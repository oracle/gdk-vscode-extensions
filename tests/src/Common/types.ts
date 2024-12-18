/*
 * Copyright (c) 2023, 2024, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import { AbstractTestDescriptor } from './abstractTestDescriptor';
import * as Common from '../../../gcn/out/common';

export enum BuildTool {
  Maven = 'MAVEN',
  Gradle = 'GRADLE',
  Unsupported = 'Unsupported',
}

export enum SupportedJava { // TODO: use from env property
  AnyJava17 = 'java17',
  Unsupported = 'Unsupported',
  AnyJava = 'java',
  JDK_17 = 'jdk-17',
}

// GDK Features
export enum Service {
  ATP = 'oracle-cloud-atp',
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

export enum Extension {
  NBLS = 'asf.apache-netbeans-java',
  OCI = 'oracle-labs-graalvm.oci-devops',
  GDK = 'oracle-labs-graalvm.gcn',
  GVM = 'oracle-labs-graalvm.graalvm',
  MN = 'oracle-labs-graalvm.micronaut',
  MNT = 'oracle-labs-graalvm.micronaut-tools',
}

export type ExtensionName = (typeof Extension)[keyof typeof Extension];
export type ExtensionMap<T> = { [Key in ExtensionName]?: T };

export enum Type {
  GDK,
  MICRONAUT,
}

export type ProjectDescription = GeneratedProject | CopiedProject;
type NamedProject<T extends string> = { name?: string; _type: T };
export type GeneratedProject = NamedProject<'generated'> & {
  buildTool: BuildTool;
  features: Feature[];
  services: Service[] | undefined;
  java?: SupportedJava;
  type?: Type;
};
export type CopiedProject = NamedProject<'copied'> & {
  copyPath: string;
};

export type Arg<T extends string> = {
  name: T;
  args: string[];
};

/**
 * Tuple of [{@link AbstractTestDescriptor}, list of names of test files]
 */
export interface CreateOptions {
  homeDir: string;
  options: Common.CreateOptions;
}

export type TestFolder = [AbstractTestDescriptor, string[]];

/**
 * Object where key is directory containing the {@link AbstractTestDescriptor} and tests files and values is {@link TestFolder}
 */
export type TestFolders = { [directory: string]: TestFolder };
