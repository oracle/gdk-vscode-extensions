import { parseArgs } from './Common/helpers';
import { AllArg } from './Common/types';
/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

async function main() {
  const args = parseArgs(process.argv);
  if (args.length === 1) {// TODO: run all tasks?
    console.log('Invalid arguments passed');
    return;
  }
  const allArg: AllArg = args.find(v => v.name === '__all__') as AllArg;
  let currentArg;
  if ((currentArg = args.find(v => v.name === 'generate')) !== undefined) {
    const test = require('./generate');
    test.generate(allArg.args.concat(currentArg.args));
  }
  if ((currentArg = args.find(v => v.name === 'runTest')) !== undefined) {
    const test = require('./runTest');
    const status: boolean = await test.runTest(allArg.args.concat(currentArg.args));
    console.log('TESTS', status ? 'SUCCEEDED' : 'FAILED');
  }
  if ((currentArg = args.find(v => v.name === 'runTest-ui')) !== undefined) {
    const test = require('./runTest-ui');
    const status: boolean = await test.runTestUI(allArg.args.concat(currentArg.args));
    console.log('TESTS', status ? 'SUCCEEDED' : 'FAILED');
  }
}

main();
