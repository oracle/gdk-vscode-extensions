/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import path from 'path';
import Mocha from 'mocha';

export function run(): Promise<void> {

  // Create the mocha test
  const mocha = new Mocha({
    ui: 'tdd',
    color: true,
  });

  return new Promise((c, e) => {
    mocha.addFile(path.join(__dirname, 'generate.test.js'));

    try {
      // Run the mocha test
      mocha.run((failures) => {
        if (failures > 0) {
          e(new Error(`${failures} tests failed.`));
        } else {
          c();
        }
      });
    } catch (err) {
      console.error(err);
      e(err);
    }
  });
}
