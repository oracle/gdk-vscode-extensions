/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import { TestHelper, Tests, convertStringToInt } from './NItest';

import { BuildTools, Features, createGcnProject, SupportedJavas } from '../../../../../Common/project-generator';


 import * as assert from 'assert';
import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
// import * as Common from '../../../../../../../../gcn/out/common';

/**
 * Returns parametrs for spawn method
 * @param buildTool is a tool we are testing with
 * @param test is a type of test to perform
 * @returns parameters for spawn method
 * @returns
 */
function getRunParameters(buildTool: BuildTools, test: Tests): [string, string[]] {
  let program = './';
  let argument: string[];

  const isWindows = process.platform.toLowerCase().includes('win32') || os.type() === 'Windows_NT';

  if (isWindows) {
    program = '.\\';
  }

  if (buildTool === BuildTools.Maven) {
    program += 'mvnw';
    switch (test) {
      case Tests.NativeComp:
        argument = ['install', '-pl lib', '-am', '--no-transfer-progress'];
        break;
      case Tests.NativePackage:
        argument = ['install', '-pl oci', '-X', '--no-transfer-progress', '-Dpackaging=native-image'];
        break;
      case Tests.Run:
        argument = ['-pl oci', 'mn:run'];
        break;
      default:
        throw new Error('Invalid arguemnt');
    }
  } else if (buildTool === BuildTools.Gradle) {
    program += 'gradlew';
    switch (test) {
      case Tests.NativeComp:
        argument = ['oci:nativeCompile'];
        break;
      case Tests.Run:
        argument = ['oci:run'];
        break;
      default:
        throw new Error('Invalid arguemnt');
    }
  } else {
    throw new Error('Unknown tool: ' + buildTool);
  }
  //TODO - yes or no
  // if (isWindows) {
  //     program += ".bat";
  // }
  return [program, argument];
}

/**
 * Run tests with given arguments for given platforms
 * @param creator Testing object
 *   @param services also called features you want to create project with
 * @param runTest do you want to run the server
 * @param compileTest do you want to compile the project
 * @param maven run for maven
 * @param gradle run for gradle
 * @param java to test with
 */
async function testAll(
  creator: TestHelper,
  services: Features[],
  runTest: boolean = true,
  compileTest: boolean = true,
  maven: boolean = true,
  gradle: boolean = true,
  java: SupportedJavas = SupportedJavas.AnyJava17,
) {
  await creator.CreateProject(
    async (tool: BuildTools) => await createProject(tool),
    services.join('; '),
    runTest,
    compileTest,
    maven,
    gradle,
  );

  async function createProject(buildTool: BuildTools): Promise<string> {
    const value = await createGcnProject(buildTool, services, creator.getFolder(buildTool).split('/'), java, true);
    return value;
  }
}

/**
 * Main suite test function
 */
suite('Micronaut Extension Test Suite', () => {
  const multiplicator = convertStringToInt(process.env.TIMEOUT_MULTIPLICATOR, 1);
  const timeInterval = 12000000;
  const testTimeout = timeInterval * multiplicator;
  let creator = new TestHelper(
    getRunParameters,
    testTimeout,
    path.resolve(__dirname, '../../../my-proj/'),
    path.join('oci', 'src', 'main', 'java', 'com', 'example'),
  );

  vscode.window.showInformationMessage('Start all tests.');

//   test('Features are same', async () => {
//     assert.deepStrictEqual(
//       Common.__getServices().map((x) => x.value),
//       Object.values(Features),
//       'Features are not same',
//     );
//   });

  //test whether fails invalid argument
  test('Do not create project with unsupported java', async () => {
    assert.ok(
      testAll(creator, [], true, true, true, true, SupportedJavas.Unsupported),
      'Project was not created properly',
    );
  }).timeout(testTimeout);

  //#region TEST_HELPER
  // all combinations would run more than 7 days https://www.wolframalpha.com/input?i2d=true&i=Divide%5BSum%5BC%5C%2840%2911%5C%2844%29+k%5C%2841%29%2C%7Bk%2C0%2C11%7D%5D%2C60*24%5D*5
  // function allTestsAreOk(): void {
  //     testAll(creator, [], false, true, true, true);
  //     testAll(creator, [Features.OBJECTSTORE], false, true, true, true);
  //     testAll(creator, [Features.EMAIL], false, true, true, true);
  //     testAll(creator, [Features.K8S], false, true, true, true);
  //     testAll(creator, [Features.TRACING], false, true, true, true);
  //     testAll(creator, [Features.SDK], false, true, true, true);

  //     allTestsAreOkCombo();
  // }
  // function allTestsAreOkCombo() {
  //     testAll(creator, [Features.OBJECTSTORE, Features.EMAIL, Features.K8S, Features.TRACING, Features.SDK], false);
  // }

  // function compileTestsAreOk(): void {
  //     testAll(creator, [Features.METRICS], false);
  //     testAll(creator, [Features.DATABASE], false);
  //     testAll(creator, [Features.LOGGING], false);
  //     testAll(creator, [Features.SECRETMANAGEMENT], false);
  //     testAll(creator, [Features.SECURITY], false);

  //     compileTestsAreOkCombo();
  // }
  // function compileTestsAreOkCombo(): void {
  //     testAll(creator, [Features.OBJECTSTORE, Features.EMAIL, Features.K8S, Features.TRACING, Features.SDK, Features.METRICS, Features.DATABASE, Features.LOGGING, Features.SECRETMANAGEMENT, Features.SECURITY], false);
  // }

  // function gradleCompileTestsAreOk(): void {
  //     testAll(creator, [Features.STREAMING], false, true, false, true);

  //     gradleCompileTestsAreOkCombo();
  // }
  // function gradleCompileTestsAreOkCombo(): void {
  //     testAll(creator, [Features.OBJECTSTORE, Features.EMAIL, Features.K8S, Features.TRACING, Features.SDK, Features.METRICS, Features.DATABASE, Features.LOGGING, Features.SECRETMANAGEMENT, Features.SECURITY, Features.STREAMING], false, true, false, true);
  // }

  // function fastTests() {
  //     allTestsAreOkCombo();
  //     compileTestsAreOkCombo();
  //     gradleCompileTestsAreOkCombo();
  // }

  // function fullTests() {
  //     allTestsAreOk();
  //     compileTestsAreOk();
  //     gradleCompileTestsAreOk();
  // }
  //#endregion

  // if (process.env.FULL_TEST?.toLowerCase() === "true") {
  //     fullTests();
  // }
  // else {
  //     fastTests();
  //  }

  // fastTests();
  // fullTests();
  testAll(creator, [], false, true, true, false);
  // testAll(creator, [Features.OBJECTSTORE, Features.EMAIL, Features.K8S, Features.TRACING, Features.SDK], false);
});
