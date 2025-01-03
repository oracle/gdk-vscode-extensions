/*
 * Copyright (c) 2020, 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

interface Position {
    line: number;
    character: number;
}
interface Range {
    start: Position;
    end: Position;
}

export interface FilePosition {
    file?: string;
    range?: Range;
}

export type CurrentTestState = 'loaded' | 'started' | 'passed' | 'failed' | 'skipped' | 'errored' | 'enqueued';

export interface TestSuite extends TestState, FilePosition {
    name: string;
    moduleName?: string;
    modulePath?: string;
    tests?: TestCase[];
}

export interface TestCase extends TestState, FilePosition {
    id: string;
    name: string;
    stackTrace?: string[];
}

export interface ClickableState extends TestState, FilePosition {
    stringify: string;
}

export interface TestState {
    state: CurrentTestState;
}

export interface FlattenTestSuite {
    name: string;
    tests: FlattenTestCase[];
    [key: string]: any;
  }

  export interface FlattenTestCase {
    name: string;
    [key: string]: any;
}

export interface ModuleWithVisibility {
    name: string;
    show: boolean;
}