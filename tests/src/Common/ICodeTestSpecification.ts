/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

export interface ICodeTestSpecification {
  clean(): void;
}

/**
 * Test-mandated options for setting up the extension hosting instance.
 */
export interface LaunchOptions {
  /**
   * Environment variables to set up before vscode starts.
   */
  env? : { [key: string]: string | undefined };

  /**
   * Extensions to install in vscode. TBD
  extensionList? : string[];
   */

  /**
   * User settings that should be set up prior to actually executing
   * tests or activating extensions. TBD.
  userSettings? : { [key: string]: any | undefined };
   */
}

/**
 * A mixin interface, to be present on the `project-generators` test package entry point. If present,
 * the test infrastructure will get launch options for specific details on how vscode process should be run.
 */
export interface TestVscodeOptions {
  launchOptions() : LaunchOptions | undefined;
}
