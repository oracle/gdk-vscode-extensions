/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as extest from 'vscode-extension-tester';
import * as path from 'path';
import { gatherTestCases } from './Common/helpers';

export async function runTestUI(args: string[]) {
  try {
    const testPath = path.resolve(__dirname, '../out/test/suite/Gates/UI');
    const testCases = gatherTestCases(testPath, ...(args.length > 0 ? args : ['**test.js']));
    try {
      process.env['tests'] = Object.keys(testCases)
        .map((dir) => testCases[dir][1].map((fn) => path.join(dir, fn)).join(';'))
        .join(';');
      // download code and chromedriver
      const exTester: extest.ExTester = new extest.ExTester(
        'test-resources',
        extest.ReleaseQuality.Stable,
        'test-resources/extensions',
      );
      await exTester.downloadCode();
      await exTester.downloadChromeDriver();

      if (process.env['EXTESTER_EXTENSION_LIST']) {
        const extensionList: string[] = process.env['EXTESTER_EXTENSION_LIST'].split(',');
        for (const extension of extensionList) {
          exTester.installFromMarketplace(extension);
        }
      }
      exTester.installFromMarketplace('vscjava.vscode-java-pack');

      // Run tests
      await exTester.runTests('**/testRunner-ui.js');
    } catch (err) {
      console.error('Failed to run tests', err);
      process.exit(1);
    }

    for (const x of Object.values(testCases).map((val) => val[0])) {
      await x.clean();
    }
  } catch (err) {
    console.error('Failed to run tests', err);
    process.exit(1);
  }
}
