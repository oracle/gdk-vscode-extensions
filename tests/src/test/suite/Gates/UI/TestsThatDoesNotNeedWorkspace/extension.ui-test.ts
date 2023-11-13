/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

// import the webdriver and the high level browser wrapper
import { InputBox, Workbench } from 'vscode-extension-tester';
import * as assert from 'assert';
import { getInputText, waitForQuickPick } from './helper';

// Create a Mocha suite
describe('Extension UI tests', function () {
  this.timeout(30000);

  it('Create project', async () => {
    await new Promise((f) => setTimeout(f, 20000));

    // Open command pallet
    await new Workbench().openCommandPrompt();
    const input: InputBox = await InputBox.create();

    // check if the command exists
    await input.setText('> Graal Cloud Native: Create');
    const picks = await input.getQuickPicks();
    assert.ok(picks.length > 0, "Command 'Create GCN Project' not found");

    // select the command
    await input.selectQuickPick(0);

    // select micronaut version
    const pickMicronaut: string[] | undefined = await waitForQuickPick(input, 10);
    assert.ok(pickMicronaut !== undefined, 'Microunaut quickpick failed to show');
    assert.ok(pickMicronaut.length > 0, 'No micronaut versions available');
    await input.selectQuickPick(0); // first version

    await new Promise((f) => setTimeout(f, 2000));

    // select application type
    const picksAppType: string[] | undefined = await waitForQuickPick(input, 10);
    assert.ok(picksAppType !== undefined, 'Application type quickpick failed to show');
    assert.ok(picksAppType.length > 0, 'No Application types available');
    await input.selectQuickPick(0); // APPLICATION

    // select java version
    const picksJava: string[] | undefined = await waitForQuickPick(input, 10);
    assert.ok(picksJava !== undefined, 'Java version quickpick failed to show');
    assert.ok(picksJava.length > 0, 'No Java version available');
    await input.selectQuickPick(0); // any installed java

    // get project name
    const projName: string | undefined = await getInputText(input, 10);
    assert.ok(projName !== undefined, 'Project name input failed to show');
    assert.strictEqual(projName, 'demo', 'Project name is not default');
    await input.confirm();

    await new Promise((f) => setTimeout(f, 1000));

    // get project name
    const projPackage: string | undefined = await getInputText(input, 10);
    assert.ok(projPackage !== undefined, 'Project package input failed to show');
    assert.strictEqual(projPackage, 'com.example', 'Project package is not default');
    await input.confirm();

    // pick project service
    await new Promise((f) => setTimeout(f, 1000));
    await input.confirm();
    await new Promise((f) => setTimeout(f, 1000));

    // pick project features
    await new Promise((f) => setTimeout(f, 1000));
    await input.confirm();
    await new Promise((f) => setTimeout(f, 1000));

    // select build tool
    const picksBuild: string[] | undefined = await waitForQuickPick(input, 10);
    await new Promise((f) => setTimeout(f, 5000));
    assert.ok(picksBuild !== undefined, 'Build tool quickpick failed to show');
    assert.ok(picksBuild.length > 0, 'No build tool available');
    await input.selectQuickPick(0); // Gradle Groovy

    // select test framework
    const picksFramework: string[] | undefined = await waitForQuickPick(input, 10);
    assert.ok(picksFramework !== undefined, 'Test framework quickpick failed to show');
    assert.ok(picksFramework.length > 0, 'No test framework available');
    await input.selectQuickPick(0); // JUNIT

    // cancel cloud pick
    await new Promise((f) => setTimeout(f, 1000));
    try {
      await input.cancel();
    } catch {}
  }).timeout(60000);
});
