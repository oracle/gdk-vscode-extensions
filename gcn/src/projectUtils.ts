/*
 * Copyright (c) 2022, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

// TODO: implement correctly for Maven/Gradle projects

export function getProjectBuildCommand(folder: vscode.WorkspaceFolder): string | undefined {
    if (isMaven(folder)) {
        return './mvnw --no-transfer-progress package';
    }
    if (isGradle(folder)) {
        return './gradlew build';
    }
    return undefined;
}

export function getProjectBuildNativeExecutableCommand(folder: vscode.WorkspaceFolder): string | undefined {
    if (isMaven(folder)) {
        return './mvnw install --no-transfer-progress -Dpackaging=native-image -DskipTests';
    }
    if (isGradle(folder)) {
        return './gradlew nativeCompile -x test';
    }
    return undefined;
}

export function getProjectBuildArtifactLocation(folder: vscode.WorkspaceFolder): string | undefined {
    if (isMaven(folder)) {
        return `target/${folder.name}-0.1.jar`;
    }
    if (isGradle(folder)) {
        return `build/libs/${folder.name}-0.1-all.jar`;
    }
    return undefined;
}

export function getProjectNativeExecutableArtifactLocation(folder: vscode.WorkspaceFolder): string | undefined {
    if (isMaven(folder)) {
        return `target/${folder.name}`;
    }
    if (isGradle(folder)) {
        return `build/native/nativeCompile/${folder.name}`;
    }
    return undefined;
}

function isMaven(folder: vscode.WorkspaceFolder) {
    return fs.existsSync(path.join(folder.uri.fsPath, 'mvnw'));
}

function isGradle(folder: vscode.WorkspaceFolder) {
    return fs.existsSync(path.join(folder.uri.fsPath, 'gradlew'));
}