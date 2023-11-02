/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as fs from 'fs';
import * as path from 'path';
import { readdir } from 'fs/promises';
import { IMochaTestSpecification } from './Common/IMochaTestSpecification';
import { ICodeTestSpecification } from './Common/ICodeTestSpecification';

export async function getSubDirectories(projectPath: string): Promise<string[]> {
  let directories;
  try {
    directories = (await readdir(projectPath, { withFileTypes: true }))
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name);
  } catch {
    return [];
  }

  return directories;
}

export async function getSpecifications(testFolder: string): Promise<IMochaTestSpecification[]> {
  const specifications: IMochaTestSpecification[] = [];
  const directories = await getSubDirectories(testFolder);

  for (let i = 0; i < directories.length; i++) {
    const testSpecificationFolder = path.join(testFolder, directories[i], 'testSpecification');

    let specModule;
    if (fs.existsSync(testSpecificationFolder + '.js')) {
      specModule = require(testSpecificationFolder);

      specifications.push(new specModule.TestSpecification());
    }
  }
  return specifications;
}

export async function getDeletions(testFolder: string): Promise<ICodeTestSpecification[]> {
  const specifications: ICodeTestSpecification[] = [];
  const directories = await getSubDirectories(testFolder);

  for (let i = 0; i < directories.length; i++) {
    const testSpecificationFolder = path.join(testFolder, directories[i], 'testDeletion');

    let specModule;
    if (fs.existsSync(testSpecificationFolder + '.js')) {
      specModule = require(testSpecificationFolder);

      specifications.push(new specModule.TestSpecification());
    }
  }
  return specifications;
}
