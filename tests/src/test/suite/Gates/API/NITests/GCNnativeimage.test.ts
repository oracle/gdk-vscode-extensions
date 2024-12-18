/*
 * Copyright (c) 2023, 2024, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import { TestHelper, Tests, convertStringToInt, createGcnProjectNiTest } from './NItest';

import { BuildTool, Feature, SupportedJava } from '../../../../../Common/types';

import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import * as Common from '../../../../../../../gcn/out/common';
import * as assert from 'assert';

/**
 * Returns parametrs for spawn method
 * @param buildTool is a tool we are testing with
 * @param test is a type of test to perform
 * @returns parameters for spawn method
 * @returns
 */
function getRunParameters(buildTool: BuildTool, test: Tests): [string, string[]] {
  let program = './';
  let argument: string[];

  const isWindows = process.platform.toLowerCase().includes('win32') || os.type() === 'Windows_NT';

  if (isWindows) {
    program = '.\\';
  }

  if (buildTool === BuildTool.Maven) {
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
        throw new Error('Invalid arguement');
    }
  } else if (buildTool === BuildTool.Gradle) {
    program += 'gradlew';
    switch (test) {
      case Tests.NativeComp:
        argument = ['oci:nativeCompile'];
        break;
      case Tests.Run:
        argument = ['oci:run'];
        break;
      default:
        throw new Error('Invalid arguement');
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
  services: Feature[],
  runTest: boolean = true,
  compileTest: boolean = true,
  maven: boolean = true,
  gradle: boolean = true,
  java: SupportedJava = SupportedJava.JDK_17,
) {
  await creator.CreateProject(
    async (tool: BuildTool) => await createProject(tool),
    services.join('; '),
    runTest,
    compileTest,
    maven,
    gradle,
  );

  async function createProject(buildTool: BuildTool): Promise<string> {
    const value = await createGcnProjectNiTest(buildTool, services, creator.getFolder(buildTool).split('/'), java);
    return value;
  }
}

/**
 * Main suite test function
 */
suite('GDK Extension Test Suite', () => {
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

  test('Features are same', async () => {
    await Common.initialize();
    assert.deepStrictEqual(
      Common.__getServices().map((x) => x.value),
      Object.values(Feature),
      'Features are not same',
    );
  });

  testAll(creator, [Feature.OBJECTSTORE], true, true, true, true);
  testAll(creator, [Feature.DATABASE], false, true, true, true);
});
