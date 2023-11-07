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

async function waitForStatup(wf?: vscode.WorkspaceFolder): Promise<void> {
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

suite('Micronaut Symbols Test Suite', function () {
  vscode.window.showInformationMessage('Start all tests.');

  /* Wait for the NBLS to start */
  // the timeout will propagate to beforeAll hook
  this.timeout(30000);
  this.beforeAll(async () => {
    await waitForStatup(wf![0]);
  });

  // This test must be run first, in order to activate the extension (and wait for the activation to complete)
  test('Extension loaded', async () => {
    let extension = vscode.extensions.getExtension('asf.apache-netbeans-java');
    assert(extension, 'No Language Server for Java by Apache NetBeans extension found!');

    await extension.activate();
  });

  // Check if "nbls.workspace.symbols" command has been loaded
  test('"nbls.workspace.symbols" command loaded', async () => {
    let commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('nbls.workspace.symbols'), '"nbls.workspace.symbols" command has not been loaded');
  });

  // Check Micronaut endpoint symbols
  test('Micronaut endpoint symbols', async () => {
    const endpoints: any[] = await vscode.commands.executeCommand('nbls.workspace.symbols', '@/');
    assert.ok(endpoints.length > 0, 'No endpoint symbols found');
    for (const endpoint of endpoints) {
      try {
        const name: string = endpoint.name;
        assert.ok(name.length > 0, 'Endpoint symbol has an empty name');
        const uri: vscode.Uri = vscode.Uri.parse(endpoint.location?.uri);
        assert.ok(uri, 'Endpoint symbol has an invalid uri');
        const startPos: vscode.Position = new vscode.Position(endpoint.location?.range?.start?.line, endpoint.location?.range?.start?.character);
        assert.ok(startPos, 'Endpoint symbol has an invalid start position');
        const endPos: vscode.Position = new vscode.Position(endpoint.location?.range?.end?.line, endpoint.location?.range?.end?.character);
        assert.ok(endPos, 'Endpoint symbol has an invalid end position');
      } catch (err) {
        assert.fail(`Failed to read endpoint symbol: ${err}`);
      }
    }
  });

  // Check Micronaut bean symbols
  test('Micronaut bean symbols', async () => {
    const beans: any[] = await vscode.commands.executeCommand('nbls.workspace.symbols', '@+');
    assert.ok(beans.length > 0, 'No bean symbols found');
    for (const bean of beans) {
      try {
        const name: string = bean.name;
        assert.ok(name.length > 0, 'Bean symbol has an empty name');
        const uri: vscode.Uri = vscode.Uri.parse(bean.location?.uri);
        assert.ok(uri, 'Bean symbol has an invalid uri');
        const startPos: vscode.Position = new vscode.Position(bean.location?.range?.start?.line, bean.location?.range?.start?.character);
        assert.ok(startPos, 'Bean symbol has an invalid start position');
        const endPos: vscode.Position = new vscode.Position(bean.location?.range?.end?.line, bean.location?.range?.end?.character);
        assert.ok(endPos, 'Bean symbol has an invalid end position');
      } catch (err) {
        assert.fail(`Failed to read bean symbol: ${err}`);
      }
    }
  });
});
