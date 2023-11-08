/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

suite(process.env['testName'] ?? 'API Tests: ' + process.env['test'], function () {
  this.timeout(0);
  const tests = process.env['tests']?.split(';');
  if (tests) {
    tests.forEach((t) => require(t));
  } else {
    console.log('No tests found.');
  }
});
