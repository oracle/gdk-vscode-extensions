/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';

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
