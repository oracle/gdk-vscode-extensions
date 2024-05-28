/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as path from 'path';
import { findDescriptors } from '../../Common/testHelper';
import { gatherProjectsToGenerate, generateMicronautProjects, generateProjects } from '../../Common/projectHelper';
import { GeneratedProject, Type } from '../../Common/types';

suite('Creating projects', function () {
  this.timeout(0);
  const args = process.env['generator']?.split(';');
  if (!args) return;
  const gatesPath = path.join(__dirname, 'Gates');
  const descriptors = findDescriptors(gatesPath, ...args);
  const projects = gatherProjectsToGenerate(descriptors);
  const gcnProjects: GeneratedProject[] = [];
  const micronautProjects: GeneratedProject[] = [];

  const comparator = (project: GeneratedProject) => project.type == Type.MICRONAUT;
  projects.forEach((x) => (comparator(x) ? micronautProjects.push(x) : gcnProjects.push(x)));

  test(`Generating ${gcnProjects.length} GDK Projects...`, async () => {
    await generateProjects(gcnProjects);
  });

  test(`Generating ${micronautProjects.length} Micronaut Projects...`, async () => {
    await generateMicronautProjects(micronautProjects);
  });
});
