/*
 * Copyright (c) 2023, 2024, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import { parseArgs } from './Common/helpers';
import { Arg } from './Common/types';

async function main() {
  const args = parseArgs(process.argv);
  if (args.length === 1) {
    // TODO: run all tasks?
    console.log('Invalid arguments passed');
    return;
  }
  const allArg: Arg<string> = args[0];
  let currentArg: Arg<string> | undefined;
  let exitCode = 0;
  if ((currentArg = args.find((v) => v.name === 'generate')) !== undefined) {
    const test = require('./generate');
    await test.generate(allArg.args.concat(currentArg.args));
  }
  if ((currentArg = args.find((v) => v.name === 'runTest')) !== undefined) {
    const test = require('./runTest');
    const status: boolean = await test.runTest(allArg.args.concat(currentArg.args));
    console.log('TESTS', status ? 'SUCCEEDED' : 'FAILED');
    exitCode = status ? exitCode : 1;
  }
  if ((currentArg = args.find((v) => v.name === 'prepareVscode')) !== undefined) {
    const test = require('./runTest');
    const dir = await test.prepareVscodeInstallation(true);
    console.log(`vscode installed in ${dir}`);
  }
  if ((currentArg = args.find((v) => v.name === 'prepareTest')) !== undefined) {
    const test = require('./runTest');
    const status: boolean = await test.prepareTests(allArg.args.concat(currentArg.args));
    console.log('test preparation', status ? 'SUCCEEDED' : 'FAILED');
    exitCode = status ? exitCode : 1;
  }
  if ((currentArg = args.find((v) => v.name === 'runTest-ui')) !== undefined) {
    const test = require('./runTest-ui');
    const status: boolean = await test.runTestUI(allArg.args.concat(currentArg.args));
    console.log('TESTS', status ? 'SUCCEEDED' : 'FAILED');
    exitCode = status ? exitCode : 1;
  }
  process.exit(exitCode);
}

main();
