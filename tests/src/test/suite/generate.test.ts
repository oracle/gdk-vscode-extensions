/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as path from 'path';
import { getSpecifications } from '../../abstractRunTests';

suite('Creating projects', function () {
  this.timeout(0);

  test('Create UI projects', async () => {
    const testPath = path.resolve(__dirname, 'Gates/UI');

    const specifications = await getSpecifications(testPath);

    for (const x of specifications) {
      await x.createProjects();
    }
  });

  test('Create api projects', async () => {
    const testPath = path.resolve(__dirname, 'Gates/API');

    const specifications = await getSpecifications(testPath);

    for (const x of specifications) {
      await x.createProjects();
    }
  });
});
