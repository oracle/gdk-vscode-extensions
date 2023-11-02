/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as generator from '../../../../../Common/project-generator';
import { IMochaTestSpecification } from '../../../../../Common/IMochaTestSpecification';

export class TestSpecification implements IMochaTestSpecification {
  private actualPath = ['src', 'test', 'suite', 'Gates', 'UI', 'CodelenseAndAutocomplete', 'projects'];
  public async createProjects() {
    await generator.createGcnProject(generator.BuildTools.Maven, [generator.Features.OBJECTSTORE], this.actualPath);
    await generator.createGcnProject(generator.BuildTools.Gradle, [generator.Features.OBJECTSTORE], this.actualPath);
  }
}
