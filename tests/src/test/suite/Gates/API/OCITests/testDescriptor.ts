/*
 * Copyright (c) 2023, 2024, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import { ProjectDescription, BuildTool, Feature, Type, Service } from '../../../../../Common/types';
import { AbstractTestDescriptor } from '../../../../../Common/abstractTestDescriptor';
import * as help from '../../../../../Common/testHelper';
export class TestDescriptor extends AbstractTestDescriptor {
  constructor() {
    super(__dirname);
  }
  descriptions: ProjectDescription[] = [
    help.genProj(BuildTool.Maven, [Feature.OBJECTSTORE, Feature.DATABASE], Type.GDK, [Service.ATP]),
    // help.genProj(BuildTool.Gradle, [Feature.OBJECTSTORE, Feature.DATABASE]),

    help.genProj(BuildTool.Maven, [], Type.MICRONAUT),
    // help.genProj(BuildTool.Gradle, [], Type.MICRONAUT)
  ];
}
