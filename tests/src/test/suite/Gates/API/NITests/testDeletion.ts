/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as fs from 'fs';

import path = require('path');
import { ICodeTestSpecification } from 'src/Common/ICodeTestSpecification';

export class TestSpecification implements ICodeTestSpecification {
  private actualPath = ['src', 'test', 'suite', 'Gates', 'API', 'NITests', 'projects'];

  public async clean() {
    const pathss = path.join(...this.actualPath);
    if (fs.existsSync(pathss)) {
      // fs.rmdirSync(pathss, { recursive: true });
    }
  }
}
