/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as fs from 'fs';
import * as fsex from 'fs-extra';
import * as path from 'path';
import { IMochaTestSpecification } from 'src/Common/IMochaTestSpecification';
import * as gen from '../../../../../Common/project-generator';

export class TestSpecification implements IMochaTestSpecification {
  private actualPath = path.join('src', 'test', 'suite', 'Gates', 'API', 'adm', 'projects');
  private templatePath = path.join('src', 'test', 'suite', 'Gates', 'project-templates', 'adm');

  private copyProject(prjName : string, tool : gen.BuildTools) {
    let p = path.join(this.templatePath, prjName);
    let p2 = path.join(this.actualPath, prjName + '_' + gen.createUniqueSuffix(tool, []));

    fsex.copySync(p, p2);
  }

  public async createProjects() {

    fs.mkdirSync(this.actualPath, { recursive: true });
    this.copyProject('oci-adm-g', gen.BuildTools.Gradle);
  }
}
