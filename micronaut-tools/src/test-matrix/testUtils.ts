/*
 * Copyright (c) 2020, 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import { FilePosition, FlattenTestCase, FlattenTestSuite, ClickableState, TestState } from "./types";

export function getModulesFrom(test: FlattenTestCase | FlattenTestSuite): string[] {
    return Object.keys(test).filter(key => !["name", "tests"].includes(key));
}

export function getParameterizedMethodName(name: string): string {
    const openParenIndex = name.indexOf("(");
    const closeParenIndex = name.indexOf(")");

    if (openParenIndex !== -1 && closeParenIndex > openParenIndex) {
        const betweenBrackets = name.substring(openParenIndex + 1, closeParenIndex).replace(" ", "");
        return betweenBrackets ? name : name.replace("()", "");
    }
    return name.replace("()", "");
}

export function getTestSuiteName(name: string): string {
    const methodSeparatorIdx = name.indexOf(":");
    return methodSeparatorIdx > -1 ? name.slice(0, methodSeparatorIdx) : name;
}

export function getMethodName(name: string): string {
    return name.replace("()", "");
}

export function getModuleName(name: string | undefined): string {
    if (!name) return "";

    const index = name.indexOf(":");
    if (index !== -1) {
        // Gradle - demo-aws:oci -> moduleName = oci
        return name.slice(index + 1);
    }
    // Maven - demo-aws-demo-aws-oci -> moduleName = oci
    const parts = name.split("-");
    return parts[parts.length - 1];
}

export function fillModuleState(test: FlattenTestCase | FlattenTestSuite, fillWith: FilePosition & TestState, moduleName: string) {
    test[moduleName] = {
        range: fillWith?.range ? fillWith?.range : test[moduleName]?.range,
        file: fillWith?.file ? fillWith?.file : test[moduleName]?.file,
        state: fillWith?.state
    } as ClickableState;
    test[moduleName].stringify = JSON.stringify(test[moduleName]);
}

export function checkLibTestExistence(modules: string[]) {
    if (modules.includes("lib")) {
        vscode.commands.executeCommand('setContext', 'containsLibTests', true);
    } else {
        vscode.commands.executeCommand('setContext', 'containsLibTests', false);
    }
}