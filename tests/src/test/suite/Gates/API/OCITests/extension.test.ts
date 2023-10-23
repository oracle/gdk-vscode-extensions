/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import { logError } from '../../../../../../../common/lib/logUtils';
// import * as myExtension from '../../extension';

import * as projectUtils from '../../../../../../../oci-devops/out/projectUtils';

export async function waitForStatup(wf?: vscode.WorkspaceFolder): Promise<void> {
  if (!wf) {
    return;
  }
  let wf2 = wf;
  let counter = 0;
  let p: Promise<void> = new Promise(async (resolve, reject) => {
    async function dowait() {
      try {
        await vscode.commands.executeCommand('nbls.project.info', wf2.uri.toString(), { projectStructure: true });
        resolve();
      } catch (e) {
        if (counter < 60) {
          counter++;
          console.log(`Still waiting for NBLS start, ${counter} seconds elapsed.`);
          setTimeout(dowait, 1000);
          return;
        } else {
          reject(e);
        }
      }
    }
    setTimeout(dowait, 1000);
  });
  return p;
}

let wf = vscode.workspace.workspaceFolders;

suite('Extension Test Suite', function () {
  vscode.window.showInformationMessage('Start all tests.');

  /* Wait for the NBLS to start */
  // the timeout will propagate to beforeAll hook
  this.timeout(30000);
  this.beforeAll(async () => {
    await waitForStatup(wf![0]);
  });

  // This test must be run first, in order to activate the extension (and wait for the activation to complete)
  test('Extension loaded', async () => {
    let extension = vscode.extensions.getExtension('oracle-labs-graalvm.oci-devops');
    assert(extension, 'No OCI DevOps Tools extension found!');

    await extension.activate();
  });

  // Check if OCI DevOps Tools commands have been loaded
  test('OCI DevOps Tools commands loaded', async () => {
    let commands = await vscode.commands.getCommands(true);

    let containsOciDevOpsCommands = false;
    for (const command of commands) {
      if (command.indexOf('oci.devops.') === 0) containsOciDevOpsCommands = true;
    }

    assert.ok(containsOciDevOpsCommands, 'No OCI DevOps Tools command has been loaded');
  });

  // Check if OCI DevOps Tools page opens
  test('OCI DevOps Tools page', async () => {
    await vscode.commands.executeCommand('oci.devops.showToolsPage');

    // The marvellous vscode completes the command, but still has the active tab set to the previous content,
    // so let's wait a while in a timeouted loop....
    let res = new Promise((resolve, reject) => {
      let counter = 3; // by default test timeout is 5 secs, increase if set to > 4.
      function w() {
        // let label = vscode.window.tabGroups.activeTabGroup.activeTab?.label;
        // console.log(`Waiting for the active editor to change: counter=${counter}, label =${label}`)
        if (counter > 0 && vscode.window.tabGroups.activeTabGroup.activeTab?.label !== 'OCI DevOps Tools') {
          counter--;
          setTimeout(w, 1000);
          return;
        }
        try {
          assert.strictEqual(
            vscode.window.tabGroups.activeTabGroup.activeTab?.label,
            'OCI DevOps Tools',
            'Tools page is not being shown',
          );
          resolve(true);
        } catch (err: any) {
          reject(err);
        }
      }
      w();
    });
    return res;
  });

  // Check if the workspace has an OCI deployable project inside
  test('Contains OCI Project', async () => {
    let wf = vscode.workspace.workspaceFolders;

    if (!wf?.length) {
      assert.throws(() => logError('Extension host did not load any workspace folders!'));
    } else {
      const projectFolder = await projectUtils.getProjectFolder(wf[0]);
      assert.strictEqual(projectFolder.projectType, 'GCN', 'Specified project should be deployable to OCI');
    }
  });
});
