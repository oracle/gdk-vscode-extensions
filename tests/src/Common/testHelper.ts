/*
 * Copyright (c) 2023, 2024, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as fs from 'fs';
import path from 'path';
import { AbstractTestDescriptor } from './abstractTestDescriptor';
import type { BuildTool, CopiedProject, Feature, GeneratedProject, Service, SupportedJava, TestFolders } from './types';
import { findFiles } from './helpers';
import { Type } from './types';

export function getDescriptor(dir: string): AbstractTestDescriptor {
  const tsFile = path.join(dir, 'testDescriptor');
  return fs.existsSync(tsFile + '.js') ? new (require(tsFile).TestDescriptor)() : undefined;
}

/**
 * Finds all {@link AbstractTestDescriptor AbstractTestDescriptors} in folders that have files found by glob pattern
 * @param testFolder parent folder
 * @param globPatterns glob patters by which to find {@link AbstractTestDescriptor AbstractTestDescriptors}
 * @returns list of {@link AbstractTestDescriptor AbstractTestDescriptors}
 */
export function findDescriptors(testFolder: string, ...globPatterns: string[]) {
  return Object.keys(findFiles(testFolder, ...globPatterns))
    .map(getDescriptor)
    .filter((d) => d !== undefined);
}

/**
 * Gathers test files and {@link AbstractTestDescriptor} in {@link TestFolders} object found by glob patterns
 * @param testFolder parent folder
 * @param globPatterns glob patterns to find test files by
 * @returns {@link TestFolders} object
 */
export function gatherTestFolders(testFolder: string, ...globPatterns: string[]): TestFolders {
  const tmp: { [directory: string]: string[] } = findFiles(testFolder, ...globPatterns);
  const out: TestFolders = {};
  for (const dir in tmp) {
    const newFiles = [];
    for (const file of tmp[dir]) {
      if (file.endsWith('test.js')) newFiles.push(file);
    }
    if (newFiles.length === 0) continue;
    const desc = getDescriptor(dir);
    if (desc) out[dir] = [desc, newFiles];
  }
  return out;
}

/**
 * Helper function to create {@link GeneratedProject} object
 * @param buildTool {@link BuildTool} to be used for generation
 * @param features list of {@link Feature} to be included in generated project
 * @param name optional project name
 * @param java optional java version {@link SupportedJava}
 * @returns {@link GeneratedProject} object
 */
export function genProj(
  buildTool: BuildTool,
  features: Feature[],
  type: Type = Type.GDK,
  services?: Service[] | undefined,
  name?: string,
  java?: SupportedJava,
): GeneratedProject {
  return { _type: 'generated', buildTool, features, java, name, type , services};
}

/**
 * Helper function to create {@link CopiedProject} object
 * @param copyPath path wrom which the project will be copied from root folder (tests project)
 * @param name optional project name
 * @returns {@link CopiedProject} object
 */
export function copProj(copyPath: string, name?: string): CopiedProject {
  return { _type: 'copied', copyPath, name };
}
