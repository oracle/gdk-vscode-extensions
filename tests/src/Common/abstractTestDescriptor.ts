/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import path from 'path';
import type { ProjectDescription, CopiedProject, GeneratedProject } from './types';

/**
 * Abstract class that encapsulates descriptions and configuration of tests in the folder.
 *
 * The extending class is expected to have name TestDescriptor
 */
export abstract class AbstractTestDescriptor {
  /**
   * Location of test folder
   */
  readonly directory: string;

  /**
   * Location of destructive tests projects
   */
  public readonly projectsPath: string;

  /**
   * Tests projects descriptions to be used during testing can be {@link CopiedProject} or {@link GeneratedProject}
   */
  descriptions: ProjectDescription[] = [];

  /**
   * Record of environment properties that will be passed to the test
   */
  environment: Record<string, string> | undefined;

  /**
   * Flag determiting if the test change the project in any way
   */
  protected destructive: boolean = true;

  /**
   * @param directory the folder where the file/tests are present (__dirname)
   */
  constructor(directory: string) {
    this.directory = directory;
    this.projectsPath = path.join(this.directory, 'projects');
  }

  /**
   * @returns list of {@link ProjectDescription} to be prepared for tests
   */
  public getProjectDescriptions(): ProjectDescription[] {
    return this.descriptions;
  }

  /**
   * @returns Record of environment properties or undefined if no should be passed to tests
   */
  public getProjectEnvironment(): Record<string, string> | undefined {
    return this.environment;
  }

  /**
   * @returns flag describing if the tests change their projects in any way
   */
  public isDestructive(): boolean {
    return this.destructive;
  }
}
