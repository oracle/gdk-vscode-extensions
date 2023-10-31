/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as cp from 'child_process';
import { runTests, downloadAndUnzipVSCode, resolveCliArgsFromVSCodeExecutablePath } from '@vscode/test-electron';
import { AbortController } from 'node-abort-controller';
import { getSubDIrectories } from './abstractRunTests';
import { ICodeTestSpecification } from './Common/ICodeTestSpecification';

export async function runTest() {
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
  const directories = await getSubDIrectories(bigTestPath);

  let statusAll: boolean = true;

  for (let i = 0; i < directories.length; i++) {
    process.env['test'] = directories[i];

    let testPath = path.resolve(__dirname, '../src/test/suite/Gates/API');
    testPath = path.join(testPath, directories[i]);

    const specfile = path.resolve(__dirname, '../out/test/suite/Gates/API');
    const testSpecificationFolder = path.join(specfile, directories[i], 'testDeletion');
    let testSpecification;
    if (fs.existsSync(testSpecificationFolder + '.js')) {
      testSpecification = require(testSpecificationFolder);
    }

    const projectPath = path.join(testPath, 'projects');
    const projects = await getSubDIrectories(projectPath);

    for (let j = 0; j < projects.length; j++) {
      const project = path.join(projectPath, projects[j]);

      try {
        const testWorkspace = project;

        // Install NBLS extension
        const vscodeExecutablePath = await downloadAndUnzipVSCode('1.76.0');
        const [cli, ...args] = resolveCliArgsFromVSCodeExecutablePath(vscodeExecutablePath);

        let extensionList: string[] = ['oracle-labs-graalvm.graalvm', 'oracle-labs-graalvm.gcn', 'asf.apache-netbeans-java']; // TODO each test can have own extension list

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
        });

        statusAll = statusAll && statusCode === 0;
      } catch (err) {
        console.error('Failed to run tests', err);
        statusAll = false;
      } finally {
        const x: ICodeTestSpecification = new testSpecification.TestSpecification();
        await x.clean();
      }
    }
  }
  return statusAll;
}
