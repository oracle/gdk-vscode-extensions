/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import { IMochaTestSpecification } from 'src/Common/IMochaTestSpecification';

export class TestSpecification implements IMochaTestSpecification {
  private actualPath = ['src', 'test', 'suite', 'Gates', 'API', 'NITests', 'projects'];
  public async createProjects() {
    const generator = require('../../../../../Common/project-generator');
    await generator.createGcnProject(generator.BuildTools.Maven, [generator.Features.OBJECTSTORE], this.actualPath);
  }
}
