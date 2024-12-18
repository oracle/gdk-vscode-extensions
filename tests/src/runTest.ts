/*
 * Copyright (c) 2023, 2024, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as path from 'path';
// @ts-ignore
import * as marge from 'mochawesome-report-generator';
// @ts-ignore
import { merge } from 'mochawesome-merge';
import { runTests } from '@vscode/test-electron';
import { AbortController } from 'node-abort-controller';
import { gatherTestFolders } from './Common/testHelper';
import { prepareAPITests, TestRun } from './Common/projectHelper';
import { TestFolders, TestFolder, Extension } from './Common/types';
import * as fs from 'fs';
import { prepareExtensions, prepareVSCode } from './Common/vscodeHelper';

/**
 * Prepares test data for test execution. Generates or copies sample projects to their appropriate locations,
 * so test suites can be run by the vscode instance. Sets up vscode instance in .vscode-test to contain the required
 * exetensions.
 * 
 * @param args testsuite glob patterns
 */
export async function prepareVscodeInstallation(installExtensions  : boolean) : Promise<string> {
  const vscodeExecutablePath = await prepareVSCode();
  if (installExtensions) {
    let extensionList: string[] = [
      'redhat.java',
      Extension.GVM,
      Extension.GDK,
      Extension.NBLS,
      Extension.OCI,
      'ms-kubernetes-tools.vscode-kubernetes-tools',
    ]; // TODO each test can have own extension list
    if (!process.env['TEST_SKIP_EXTENSIONS']) {
      await prepareExtensions(vscodeExecutablePath, extensionList);
    }
  }
  return vscodeExecutablePath;
}

export async function prepareTests(args : string[]) : Promise<[ folders: TestFolders, vscodePath: string, testRun : TestRun]> {
  fs.rmSync(path.resolve(__dirname, '..', 'mochawesome-report'), { recursive: true, force: true });
  fs.rmSync(path.resolve(__dirname, '..', 'out', 'test-projects'), { recursive: true, force: true });

  // The path for tests
  const bigTestPath = path.resolve(__dirname, '..', 'out', 'test', 'suite', 'Gates', 'API');
  const testCases = gatherTestFolders(bigTestPath, ...(args.length > 0 ? args : ['**test.js']));
  // copy out test projects
  let testRun = prepareAPITests(testCases);
  
  const vscodeExecutablePath = await prepareVscodeInstallation(false);
  return [ testCases, vscodeExecutablePath, testRun ];
}

/**
 * Sets up data for testing, and run the tests using the prepared vscode
 * @param args
 * @returns 
 */
export async function runTest(args: string[]) : Promise<boolean> {
  // BuildBot Abort controller fix
  // @ts-ignore
  global.AbortController = AbortController;

  const [ testCases, vscodeExecutablePath, testRun ] = await prepareTests(args);
  let statusAll: boolean = true;

  for (const directory in testRun) {
    process.env['test'] = directory;
    process.env['tests'] = testRun[directory].join(';');
    try {
      const testWorkspace = directory;

      const launchArgs = testWorkspace ? [testWorkspace] : undefined;

      const extensionDevelopmentPath = path.resolve(__dirname, '..', '..', 'graal-cloud-native-pack');
      // The path to test runner
      // Passed to --extensionTestsPath
      const extensionTestsPath = path.resolve(__dirname, '..', 'out', 'test', 'suite', 'index');

      console.log(`Running vscode: test=${directory}, tests: ${process.env['tests']}, exPath: ${vscodeExecutablePath}, devPath: ${extensionDevelopmentPath}, testPath: ${extensionTestsPath}, args: ${launchArgs}`)

      let env : { [key: string]: string | undefined } = {};
      let testEnv = getEnv(testRun[directory], testCases);
      for (let k in testEnv) {
        env[k] = testEnv[k];
      }
      env['TEST_VSCODE_EXTENSION'] = 'true';

      console.log(`Starting vscode with environment: ${JSON.stringify(env)}`);
      
      const statusCode = await runTests({
        vscodeExecutablePath,
        extensionDevelopmentPath,
        extensionTestsPath,
        launchArgs,
        extensionTestsEnv: env,
      });

      if (statusCode === 0) fs.rmSync(directory, { recursive: true, force: true });

      statusAll = statusAll && statusCode === 0;
      console.log(`Test suite reported status code ${statusCode}, overall status: ${statusAll}`);
    } catch (err) {
      console.error('Failed to run tests', err);
      statusAll = false;
    }
  }
  await generateReport();
  console.log(`Test run returns overall status: ${statusAll}`);
  return statusAll;
}

function getEnv(testFiles: string[], testCases: TestFolders): Record<string, string> | undefined {
  const tests: TestFolder | undefined = Object.values(testCases).find((tf) =>
    testFiles.some((t) => tf[1].some((tst) => t.includes(tst))),
  );
  if (!tests) return undefined;
  const env = tests[0].getProjectEnvironment();
  return env;
}

async function generateReport() {
  return merge().then((report: any) => marge.create(report));
}
