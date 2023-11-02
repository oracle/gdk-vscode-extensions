/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as extest from 'vscode-extension-tester';
import * as path from 'path';
import { getDeletions } from './abstractRunTests';

export async function runTestUI() {
  const testPath = path.resolve(__dirname, '../out/test/suite/Gates/UI');
  const specifications = await getDeletions(testPath);

  try {
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
    await exTester.runTests('**/**.ui-test.js');
  } catch (err) {
    console.error('Failed to run tests', err);
    process.exit(1);
  }

  for (const x of specifications) {
    await x.clean();
  }
}
