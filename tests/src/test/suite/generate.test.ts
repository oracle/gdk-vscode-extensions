/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as path from 'path';
import { findDescriptors } from '../../Common/testHelper';
import { gatherProjectsToGenerate, generateProjects } from '../../Common/projectHelper';

suite('Creating projects', function () {
  this.timeout(0);
  const args = process.env['generator']?.split(';');
  if (!args) return;
  const gatesPath = path.join(__dirname, 'Gates');
  const descriptors = findDescriptors(gatesPath, ...args);
  const projects = gatherProjectsToGenerate(descriptors);
  test(`Generating ${projects.length} Projects...`, async () => {
    await generateProjects(projects);
  });
});
