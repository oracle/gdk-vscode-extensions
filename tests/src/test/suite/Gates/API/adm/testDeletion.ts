/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as testspec from '../../../../../Common/ICodeTestSpecification';

export class TestSpecification implements testspec.ICodeTestSpecification, testspec.TestVscodeOptions {
  private actualPath = path.join('src', 'test', 'suite', 'Gates', 'API', 'adm', 'projects');

  public async clean() {
    const pathss = path.join(...this.actualPath);
    if (fs.existsSync(pathss)) {
      fs.rmdirSync(pathss, { recursive: true });
    }
  }

  launchOptions(): testspec.LaunchOptions | undefined {
    return {
      env: {
        'ADM_SUPPRESS_AUTO_DISPLAY' : 'true',
        "TEST_ADM_REUSE_PROJECTS": "true"
      }
    };
  }

}

