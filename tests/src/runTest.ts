/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as path from 'path';
import * as cp from 'child_process';
import { runTests, downloadAndUnzipVSCode, resolveCliArgsFromVSCodeExecutablePath } from '@vscode/test-electron';
import { AbortController } from 'node-abort-controller';
import { getSubDirs, gatherTestCases } from './Common/helpers';

export async function runTest(args: string[]) {
  console.log('runTest: ' + args);
  // BuildBot Abort controller fix
  // @ts-ignore
  global.AbortController = AbortController;

  // The folder containing the Extension Manifest package.json
  // Passed to `--extensionDevelopmentPath`
  const extensionDevelopmentPath = path.resolve(__dirname, '../../graal-cloud-native-pack');

  // The path to test runner
  // Passed to --extensionTestsPath
  const extensionTestsPath = path.resolve(__dirname, '../out/test/suite/index');

  // The path for tests
  const bigTestPath = path.resolve(__dirname, '../out/test/suite/Gates/API');
  const testCases = gatherTestCases(bigTestPath, ...(args.length > 0 ? args : ['**test.js']));

  let statusAll: boolean = true;

  for (const directory in testCases) {
    process.env['test'] = path.basename(directory);
    const testDescriptor = testCases[directory][0];
    process.env['tests'] = testCases[directory][1].map((fn) => path.join(directory, fn)).join(';');
    const projectPath = path.join(directory, 'projects');
    const projects = getSubDirs(projectPath);

    for (let j = 0; j < projects.length; j++) {
      const project = path.join(projectPath, projects[j]);
      try {
        const testWorkspace = project;

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

        const env = testDescriptor.getProjectEnvironment();

        const statusCode = await runTests({
          vscodeExecutablePath,
          extensionDevelopmentPath,
          extensionTestsPath,
          launchArgs,
          extensionTestsEnv: Object.keys(env).length > 0 ? env : undefined,
        });

        statusAll = statusAll && statusCode === 0;
      } catch (err) {
        console.error('Failed to run tests', err);
        statusAll = false;
      } finally {
        await testDescriptor.clean();
      }
    }
  }
  return statusAll;
}
