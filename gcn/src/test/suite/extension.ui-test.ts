/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

// import the webdriver and the high level browser wrapper
import { InputBox, Workbench } from 'vscode-extension-tester';
import * as assert from 'assert';
// import * as vscode from 'vscode';


/**
 * Waits for quickpics to show and returns result
 * 
 * @param input 
 * @param timeout 
 */
async function waitForQuickPick(input : InputBox, timeout : number) : Promise<string[] | undefined> {
  let picks = await input.getQuickPicks();
  let items : string [] = [];
  while (timeout > 0) {
    if (picks.length) {
      for (let pick of picks) {
        items.push( await pick.getLabel() );
      }
      break;
    } else {
      await new Promise( f => setTimeout(f, 1000));
      picks = await input.getQuickPicks();
    }

    timeout -= 1;
    if (timeout <= 0) return undefined;
  }
  return items;
}

/**
 * Returns text inside input box when it becomes not empty
 * @param input 
 * @param timeout 
 * @returns 
 */
async function getInputText(input : InputBox, timeout : number) : Promise<string | undefined> {
  while (timeout > 0) {
    let inp = input.getText();
    if (!inp) {
      await new Promise( f => setTimeout(f, 1000));
      timeout -= 1;
      continue;
    } else {
      return inp;
    }
  }
  return undefined;
}

// Create a Mocha suite
describe('Extension UI tests', function() {
	this.timeout(30000);
	this.beforeAll(async () => {
	        //await vscode.extensions.getExtension('oracle-labs-graalvm.gcn')?.activate();
	});
	// revert for tests
	this.timeout(5000);

  it("Create project", async () => {
    // Open command pallet
    await new Workbench().openCommandPrompt();
    let input: InputBox = await InputBox.create();

    // check if the command exists
    await input.setText('> Graal Cloud Native: Create');
    const picks = await input.getQuickPicks();
    assert.ok(picks.length>0, "Command 'Create GCN Project' not found");

    // select the command
    await input.selectQuickPick(0);

    // select micronaut version
    const picks_micronaut : string[] | undefined = await waitForQuickPick(input, 10);
    assert.ok(picks_micronaut !== undefined, "Microunaut quickpick failed to show");
    assert.ok(picks_micronaut.length>0, "No micronaut versions available");
    await input.selectQuickPick(0); // first version

    // select application type
    let picks_app_type : string[] | undefined = await waitForQuickPick(input, 10);
    assert.ok(picks_app_type !== undefined, "Application type quickpick failed to show");
    assert.ok(picks_app_type.length>0, "No Application types available");
    await input.selectQuickPick(0); // APPLICATION
 
    // select java version
    let picks_java : string[] | undefined = await waitForQuickPick(input, 10);
    assert.ok(picks_java !== undefined, "Java version quickpick failed to show");
    assert.ok(picks_java.length>0, "No Java version available");
    await input.selectQuickPick(0); // any installed java

    // get project name
    let proj_name : string | undefined = await getInputText(input, 10);
    assert.ok(proj_name !== undefined, "Project name input failed to show");
    assert.strictEqual(proj_name, "demo", "Project name is not default");
    await input.confirm();

    // get project name
    let proj_package : string | undefined = await getInputText(input, 10);
    assert.ok(proj_package !== undefined, "Project package input failed to show");
    assert.strictEqual(proj_package, "com.example", "Project package is not default");
    await input.confirm();

    // pick project service
    await new Promise( f => setTimeout(f, 1000));
    await input.confirm();

    // select build tool
    let picks_build : string[] | undefined = await waitForQuickPick(input, 10);
    assert.ok(picks_build !== undefined, "Build tool quickpick failed to show");
    assert.ok(picks_build.length>0, "No build tool available");
    await input.selectQuickPick(0); // Gradle Groovy

    // select test framework
    let picks_framework : string[] | undefined = await waitForQuickPick(input, 10);
    assert.ok(picks_framework !== undefined, "Test framework quickpick failed to show");
    assert.ok(picks_framework.length>0, "No test framework available");
    await input.selectQuickPick(0); // JUNIT

    // cancel cloud pick
    await new Promise( f => setTimeout(f, 1000));
    try {
      await input.cancel();
    } catch {}

  }).timeout(20000);

});