/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

describe(process.env['testName'] ?? 'UI Tests:', function () {
  const tests = process.env['tests']?.split(';');
  if (tests && tests.length !== 0) {
    tests.forEach((t) => require(t));
  } else {
    console.log('No tests found.');
  }
});
