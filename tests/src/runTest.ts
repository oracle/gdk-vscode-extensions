/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as path from 'path';
import * as cp from 'child_process';
// @ts-ignore
import * as marge from 'mochawesome-report-generator';
// @ts-ignore
import { merge } from 'mochawesome-merge';
import { runTests, downloadAndUnzipVSCode, resolveCliArgsFromVSCodeExecutablePath } from '@vscode/test-electron';
import { AbortController } from 'node-abort-controller';
import { gatherTestFolders } from './Common/testHelper';
import { prepareAPITests } from './Common/projectHelper';
import { TestFolders, TestFolder } from './Common/types';
import * as fs from 'fs';

export async function runTest(args: string[]) {
  // BuildBot Abort controller fix
  // @ts-ignore
  global.AbortController = AbortController;

  fs.rmSync(path.resolve(__dirname, '..', 'mochawesome-report'), { recursive: true, force: true });

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

  for (const directory in testRun) {
    process.env['test'] = directory;
    process.env['tests'] = testRun[directory].join(';');
    try {
      const testWorkspace = directory;

      // Install NBLS extension
      const vscodeExecutablePath = await downloadAndUnzipVSCode('1.76.0');
      const [cli, ...args] = resolveCliArgsFromVSCodeExecutablePath(vscodeExecutablePath);

      let extensionList: string[] = [
        'redhat.java',
        'oracle-labs-graalvm.graalvm',
        'oracle-labs-graalvm.gcn',
        'asf.apache-netbeans-java',
        'oracle-labs-graalvm.oci-devops',
        'vscjava.vscode-java-pack',
        'ms-kubernetes-tools.vscode-kubernetes-tools',
      ]; // TODO each test can have own extension list

      // download additional extensions
      if (process.env['MOCHA_EXTENSION_LIST']) {
        extensionList = extensionList.concat(process.env['MOCHA_EXTENSION_LIST'].split(','));
      }

      for (const extensionId of extensionList) {
        cp.spawnSync(cli, [...args, '--install-extension', extensionId], {
          encoding: 'utf-8',
          stdio: 'inherit',
        });
      }

      const launchArgs = testWorkspace ? [testWorkspace] : undefined;

      const statusCode = await runTests({
        vscodeExecutablePath,
        extensionDevelopmentPath,
        extensionTestsPath,
        launchArgs,
        extensionTestsEnv: getEnv(directory, testCases),
      });

      statusAll = statusAll && statusCode === 0;
    } catch (err) {
      console.error('Failed to run tests', err);
      statusAll = false;
    }
  }
  await generateReport();
  return statusAll;
}
function getEnv(projDir: string, testCases: TestFolders): Record<string, string> | undefined {
  const tests: TestFolder | undefined = testCases[path.dirname(projDir)];
  if (!tests) return undefined;
  return tests[0].getProjectEnvironment();
}

async function generateReport() {
  return merge().then((report: any) => marge.create(report));
}