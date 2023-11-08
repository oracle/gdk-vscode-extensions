/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import path from 'path';
import * as fs from 'fs';
import { ProjectDescription } from './types';
import { copyProject } from './helpers';

export abstract class AbstractTestDescriptor {
  readonly directory: string;
  readonly projPath: string;
  descriptions: ProjectDescription[] = [];
  environment: Record<string, string> = {};
  constructor(directory: string) {
    this.directory = directory;
    this.projPath = path.join(this.directory, 'projects');
  }

  public async clean() {
    fs.rmSync(this.projPath, { recursive: true, force: true });
  }

  public getProjectDescriptions(): ProjectDescription[] {
    return this.descriptions;
  }

  public getProjectEnvironment(): Record<string, string> {
    return this.environment;
  }

  public async createProjects() {
    const generator = require('./project-generator');
    for (const desc of this.getProjectDescriptions())
      if (desc._type === 'generated')
        await generator.createGcnProject(desc.buildTool, desc.features, this.projPath, desc.java);
      else if (desc._type === 'copied') await copyProject(desc, this.projPath);
  }

  public getProjectsPath(): string {
    return this.projPath;
  }
}
