/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as Common from '../../../gcn/out/common';
import { NodeFileHandler } from '../../../gcn/out/gcnProjectCreate';
import * as jdkUtils from 'jdk-utils';
import * as assert from 'assert';
import * as vscode from 'vscode';
import * as fs from 'fs';
import { BuildTool, CreateOptions, Feature, SupportedJava } from './types';
import { getName, resolveProjFolder } from './projectHelper';

export async function getGcnCreateOptions(
  ourBuildTool: BuildTool,
  java: SupportedJava,
  services: string[],
): Promise<CreateOptions> {
  let javaRuntimes;

  javaRuntimes = await jdkUtils.findRuntimes({ checkJavac: true });

  const selectedJavaRuntime = javaRuntimes.find((x) => x.homedir.includes(java));

  if (selectedJavaRuntime === null || selectedJavaRuntime === undefined) {
    throw new Error(
      `${java} was not found, only these GraalVMs are present:` + javaRuntimes.map((x) => x.homedir).join(';\n'),
    );
  }

  return {
    homeDir: selectedJavaRuntime.homedir,
    options: {
      micronautVersion: {
        label: '4.0.0',
        serviceUrl: '',
      },
      applicationType: 'APPLICATION',
      buildTool: ourBuildTool,
      language: 'JAVA',
      testFramework: 'JUNIT',
      basePackage: 'com.example',
      projectName: 'demo',
      javaVersion: `JDK_17`, // TODO make a variable
      clouds: ['OCI'],
      services: [...services],
      features: undefined,
    },
  };
}

/**
 * Creates GCN project with given specification
 * @param buildTool is a tool you want the project to be initialized with
 * @param services are services you want the project to be initialized with
 * @param path a path where the project shoudl be created
 * @param java is a java runtime you want the project to be initialized with
 * @returns path to the created project
 */
export async function createGcnProject(
  buildTool: BuildTool,
  services: Feature[],
  path: string[] | string,
  java: SupportedJava = SupportedJava.AnyJava,
): Promise<string> {
  try {
    await Common.initialize();
    const options = await getGcnCreateOptions(buildTool, java, services);
    const projFolder: string = resolveProjFolder(path, getName(buildTool, services));

    if (!fs.existsSync(projFolder)) {
      fs.mkdirSync(projFolder, { recursive: true });
    }
    await Common.writeProjectContents(options.options, new NodeFileHandler(vscode.Uri.file(projFolder)));

    return projFolder;
  } catch (e: any) {
    assert.fail('Project options were not resolved properly: ' + e.message);
  }
}
