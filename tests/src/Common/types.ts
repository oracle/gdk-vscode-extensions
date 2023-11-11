/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import { AbstractTestDescriptor } from './abstractTestDescriptor';

export enum BuildTool {
  Maven = 'MAVEN',
  Gradle = 'GRADLE',
  Unsupported = 'Unsupported',
}

export enum SupportedJava {
  AnyJava17 = 'java17',
  Unsupported = 'Unsupported',
  AnyJava = 'java',
}

export enum Feature {
  DATABASE = 'DATABASE',
  EMAIL = 'EMAIL',
  K8S = 'K8S',
  LOGGING = 'LOGGING',
  METRICS = 'METRICS',
  OBJECTSTORE = 'OBJECTSTORE',
  SDK = 'SDK',
  SECRETMANAGEMENT = 'SECRETMANAGEMENT',
  SECURITY = 'SECURITY',
  STREAMING = 'STREAMING',
  TRACING = 'TRACING',
}

export type ProjectDescription = GeneratedProject | CopiedProject;
type NamedProject<T extends string> = { name?: string; _type: T };
export type GeneratedProject = NamedProject<'generated'> & {
  buildTool: BuildTool;
  features: Feature[];
  java?: SupportedJava;
};
export type CopiedProject = NamedProject<'copied'> & {
  copyPath: string;
};

export type Arg<T extends string> = {
  name: T;
  args: string[];
};

export type TestFolder = [AbstractTestDescriptor, string[]];
export type TestFolders = { [directory: string]: TestFolder };
