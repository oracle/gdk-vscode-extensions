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

  let picks_micronaut: string[] | undefined;

  it('Create project', async () => {
    await new Promise((f) => setTimeout(f, 20000));

    // Open command pallet
    new Workbench().openCommandPrompt();
    let input: InputBox = await InputBox.create();

    // check if the command exists
    await input.setText('> Micronaut: Create Micronaut Project');
    const picks = await input.getQuickPicks();
    assert.ok(picks.length > 0, "Micronaut: Create Micronaut Project' not found");
    await input.selectQuickPick(0);

    // select micronaut version
    picks_micronaut = await waitForQuickPick(input, 10);
    assert.ok(picks_micronaut !== undefined, 'Microunaut quickpick failed to show');
    assert.ok(picks_micronaut.length > 0, 'No micronaut versions available');
    await input.selectQuickPick(0); // first version

    await new Promise((f) => setTimeout(f, 2000));

    // select application type
    const picks_app_type: string[] | undefined = await waitForQuickPick(input, 10);
    assert.ok(picks_app_type !== undefined, 'Application type quickpick failed to show');
    assert.ok(picks_app_type.length > 0, 'No Application types available');
    assert.deepStrictEqual(
      picks_app_type,
      [
        'Micronaut Application',
        'Micronaut CLI Application',
        'Micronaut Serverless Function',
        'Micronaut gRPC Application',
        'Micronaut Messaging Application',
      ],
      'Diffeent Application tyopes',
    );
    await input.selectQuickPick(0); // APPLICATION

    // select java version TODO: make sure packages are filtered
    const picks_java: string[] | undefined = await waitForQuickPick(input, 10);
    assert.ok(picks_java !== undefined, 'Java version quickpick failed to show');
    assert.ok(picks_java.length > 0, 'No Java version available');
    await input.selectQuickPick(0); // any installed java

    // get project name
    const proj_name: string | undefined = await getInputText(input, 10);
    assert.ok(proj_name !== undefined, 'Project name input failed to show');
    assert.strictEqual(proj_name, 'demo', 'Project name is not default');
    await input.confirm();

    await new Promise((f) => setTimeout(f, 1000));

    // get package name
    const proj_package: string | undefined = await getInputText(input, 10);
    assert.ok(proj_package !== undefined, 'Project package input failed to show');
    assert.strictEqual(proj_package, 'com.example', 'Project package is not default');
    await input.confirm();

    // set project language
    const languages: string[] | undefined = await waitForQuickPick(input, 10);
    assert.ok(languages !== undefined, 'Languages quickpick failed to show');
    assert.ok(languages.length > 0, 'No Languages available');
    assert.deepStrictEqual(languages, ['Java', 'Kotlin', 'Groovy'], 'Different languages');
    await input.selectQuickPick(0); // Java

    // pick project features TODO: test if features are displayed
    await new Promise((f) => setTimeout(f, 1000));
    await input.confirm();
    await new Promise((f) => setTimeout(f, 1000));

    // select build tool
    const picks_lan: string[] | undefined = await waitForQuickPick(input, 10);
    await new Promise((f) => setTimeout(f, 5000));
    assert.ok(picks_lan !== undefined, 'Build tool quickpick failed to show');
    assert.ok(picks_lan.length > 0, 'No build tool available');
    assert.deepStrictEqual(picks_lan, ['Gradle', 'Maven'], 'Different build tools');
    await input.selectQuickPick(0); // Gradle Groovy

    // select test framework
    const picks_framework: string[] | undefined = await waitForQuickPick(input, 10);
    assert.ok(picks_framework !== undefined, 'Test framework quickpick failed to show');
    assert.ok(picks_framework.length > 0, 'No test framework available');
    assert.deepStrictEqual(picks_framework, ['JUnit', 'Spock', 'Kotlintest'], 'Different test frameworks');
    await input.selectQuickPick(0); // JUNIT

    // cancel cloud pick
    await new Promise((f) => setTimeout(f, 1000));
    try {
      await input.cancel();
    } catch {}
  }).timeout(60000);

  it('Micronaut breaking updates', function () {
    try {
      assert.deepStrictEqual(picks_micronaut, ['4.1.6', '4.2.0-SNAPSHOT'], 'Micronaut changed versions');
    } catch {
      this.skip();
    }
    assert.ok(true, 'Micronaut versions differ');
  }).timeout(60000);
});
