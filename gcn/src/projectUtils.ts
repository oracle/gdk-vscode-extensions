/*
 * Copyright (c) 2022, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

const GET_PROJECT_ARTIFACTS = 'nbls.gcn.project.artifacts';

// TODO: implement correctly for Maven/Gradle projects

export function getProjectBuildCommand(folder: vscode.WorkspaceFolder): string | undefined {
    if (isMaven(folder)) {
        return 'chmod 777 ./mvnw && ./mvnw --no-transfer-progress package';
    }
    if (isGradle(folder)) {
        return 'chmod 777 ./gradlew && ./gradlew build';
    }
    return undefined;
}

export function getProjectBuildNativeExecutableCommand(folder: vscode.WorkspaceFolder): string | undefined {
    if (isMaven(folder)) {
        return 'chmod 777 ./mvnw && ./mvnw install --no-transfer-progress -Dpackaging=native-image -DskipTests';
    }
    if (isGradle(folder)) {
        return 'chmod 777 ./gradlew && ./gradlew nativeCompile -x test';
    }
    return undefined;
}

export async function getProjectBuildArtifactLocation(folder: vscode.WorkspaceFolder): Promise<string | undefined> {
    if ((await vscode.commands.getCommands()).find(cmd => GET_PROJECT_ARTIFACTS === cmd)) {
        const projectUri: string = folder.uri.toString();
        const artifacts: any[] = await vscode.commands.executeCommand(GET_PROJECT_ARTIFACTS, projectUri);
        if (artifacts && artifacts.length === 1) {
            const loc: string = artifacts[0].location;
            if (loc.startsWith(projectUri + '/')) {
                return loc.slice(projectUri.length + 1);
            }
        }
    }
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
