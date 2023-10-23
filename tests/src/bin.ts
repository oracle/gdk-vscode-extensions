/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

async function main() {
  if (process.argv.indexOf('--runTest') !== -1) {
    const test = require('./runTest');
    const status: boolean = await test.runTest();
    console.log('TESTS', status ? 'SUCCEEDED' : 'FAILED');
  } else if (process.argv.indexOf('--runTest-ui') !== -1) {
    const test = require('./runTest-ui');
    test.runTestUI();
  } else if (process.argv.indexOf('--generate') !== -1) {
    const test = require('./generate');
    test.generate();
  } else {
    console.log('Invalid arguments passed');
  }
}

main();
