/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as path from 'path';
import { runTests, downloadAndUnzipVSCode } from '@vscode/test-electron';
import { AbortController } from 'node-abort-controller';

export async function generate(args: string[]) {
  // BuildBot Abort controller fix
  // @ts-ignore
  global.AbortController = AbortController;

  // The folder containing the Extension Manifest package.json
  // Passed to `--extensionDevelopmentPath`
  const extensionDevelopmentPath = path.resolve(__dirname, '../../graal-cloud-native-pack');

  // The path to test runner
  // Passed to --extensionTestsPath
  const extensionTestsPath = path.resolve(__dirname, '../out/test/suite/genindex');

  const vscodeExecutablePath = await downloadAndUnzipVSCode('1.76.0');
  await runTests({
    vscodeExecutablePath,
    extensionDevelopmentPath,
    extensionTestsPath,
  });
}
