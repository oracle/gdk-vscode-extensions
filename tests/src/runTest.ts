/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
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
import { prepareAPITests } from './Common/projectHelper';
import { TestFolders, TestFolder, Extension } from './Common/types';
import * as fs from 'fs';
import { prepareExtensions, prepareVSCode } from './Common/vscodeHelper';

export async function runTest(args: string[]) {
  // BuildBot Abort controller fix
  // @ts-ignore
  global.AbortController = AbortController;

  fs.rmSync(path.resolve(__dirname, '..', 'mochawesome-report'), { recursive: true, force: true });
  fs.rmSync(path.resolve(__dirname, '..', 'out', 'test-projects'), { recursive: true, force: true });

  // The folder containing the Extension Manifest package.json
  // Passed to `--extensionDevelopmentPath`
  const extensionDevelopmentPath = path.resolve(__dirname, '..', '..', 'graal-cloud-native-pack');

  // The path to test runner
  // Passed to --extensionTestsPath
  const extensionTestsPath = path.resolve(__dirname, '..', 'out', 'test', 'suite', 'index');

  // The path for tests
  const bigTestPath = path.resolve(__dirname, '..', 'out', 'test', 'suite', 'Gates', 'API');
  const testCases = gatherTestFolders(bigTestPath, ...(args.length > 0 ? args : ['**test.js']));
  const testRun = prepareAPITests(testCases);
  let statusAll: boolean = true;

  const vscodeExecutablePath = await prepareVSCode();
  let extensionList: string[] = [
    'redhat.java',
    Extension.GVM,
    Extension.GCN,
    Extension.NBLS,
    Extension.OCI,
    //'vscjava.vscode-java-pack',
    'ms-kubernetes-tools.vscode-kubernetes-tools',
  ]; // TODO each test can have own extension list
  await prepareExtensions(vscodeExecutablePath, extensionList);

  for (const directory in testRun) {
    process.env['test'] = directory;
    process.env['tests'] = testRun[directory].join(';');
    try {
      const testWorkspace = directory;
      const launchArgs = testWorkspace ? [testWorkspace] : undefined;

      const statusCode = await runTests({
        vscodeExecutablePath,
        extensionDevelopmentPath,
        extensionTestsPath,
        launchArgs,
        extensionTestsEnv: getEnv(testRun[directory], testCases),
      });

      if (statusCode === 0) fs.rmSync(directory, { recursive: true, force: true });

      statusAll = statusAll && statusCode === 0;
    } catch (err) {
      console.error('Failed to run tests', err);
      statusAll = false;
    }
  }
  await generateReport();
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
