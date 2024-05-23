/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as assert from 'assert';
import * as path from 'path';
import { BuildTool, SupportedJava } from './types';
import * as micronaut from '../../../micronaut/out/projectCreate';
import { CreateOptions } from '../../../micronaut/out/projectCreate';
import { getName, resolveProjFolder } from './projectHelper';
import * as fs from 'fs';
import { selectJavaRuntime } from './helpers';

export async function getMicronautCreateOptions(buildTool: BuildTool, java: SupportedJava): Promise<CreateOptions> {
  const selectedJavaRuntime = await selectJavaRuntime(java);

  const projectName = 'demo';
  return {
    url: `https://launch.micronaut.io/create/default/com.example.demoty?javaVersion=JDK_17&lang=JAVA&build=${buildTool}&test=JUNIT`,
    name: projectName,
    target: path.join(__dirname, projectName, buildTool),
    buildTool: buildTool,
    java: selectedJavaRuntime.homedir,
  };
}

/**
 * Creates Micronaut project with given specification
 * @param buildTool is a tool you want the project to be initialized with
 * @param java is a java runtime you want the project to be initialized with
 * @param p a path where the project shoudl be created
 * @returns path to the created project
 */
export async function createMicronautProject(
  buildTool: BuildTool,
  java: SupportedJava = SupportedJava.AnyJava,
  p: string[] | string,
): Promise<string> {
  try {
    await micronaut.creatorInit();
    const options = await getMicronautCreateOptions(buildTool, java);
    const projFolder: string = resolveProjFolder(p, getName(buildTool, ['micronaut']));

    if (!fs.existsSync(projFolder)) {
      fs.mkdirSync(projFolder, { recursive: true });
    }
    options.target = projFolder;

    await micronaut.__writeProject(options, false);
    let files = fs.readdirSync(options.target);
    if (files && files.length == 1 && fs.statSync(path.join(options.target, files[0])).isDirectory()) {
      // move all contents of the single directory one level up, to 'target'.
      const subdir = path.join(options.target, files[0]);
      for (let f of fs.readdirSync(subdir)) {
        let org = path.join(subdir, f);
        let dest = path.join(options.target, f);
        fs.renameSync(org, dest);
      }
      // remove the obsolete dir
      fs.rmdirSync(subdir);
    }
    return options.target;
  } catch (e: any) {
    assert.fail('Project options were not resolved properly: ' + e.message);
  }
}
