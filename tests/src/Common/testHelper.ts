/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as fs from 'fs';
import path from 'path';
import { AbstractTestDescriptor } from './abstractTestDescriptor';
import { findFiles, getSubDirs } from './helpers';
import { CopiedProject, GeneratedProject, BuildTool, Feature, SupportedJava, TestFolders } from './types';

export function getDescriptors(testFolder: string): AbstractTestDescriptor[] {
  return getSubDirs(testFolder)
    .map((dir) => getDescriptor(path.join(testFolder, dir)))
    .filter((td) => td !== undefined);
}

export function getDescriptor(dir: string): AbstractTestDescriptor {
  const tsFile = path.join(dir, 'testDescriptor');
  return fs.existsSync(tsFile + '.js') ? new (require(tsFile).TestDescriptor)() : undefined;
}

export function findDescriptors(testFolder: string, ...globPatterns: string[]) {
  return Object.keys(findFiles(testFolder, ...globPatterns))
    .map(getDescriptor)
    .filter((d) => d !== undefined);
}

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

export function genProj(
  buildTool: BuildTool,
  features: Feature[],
  name?: string,
  java?: SupportedJava,
): GeneratedProject {
  return { _type: 'generated', buildTool, features, java, name };
}

export function copProj(copyPath: string, name?: string): CopiedProject {
  return { _type: 'copied', copyPath, name };
}
