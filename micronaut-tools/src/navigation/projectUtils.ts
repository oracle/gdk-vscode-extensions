/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';


const EXTENSION_NBLS_ID = 'asf.apache-netbeans-java';
const COMMAND_GET_PROJECT_INFO = 'nbls.project.info';
const TIMEOUT_COMMAND_GET_PROJECT_INFO = 30; // wait for NBLS & projectInfo up to 30 seconds
const RUN_DEV_MAVEN = 'Micronaut: dev mode';
const RUN_DEV_GRADLE = 'Continuous Mode';
const CONTEXT_NBLS_INITIALIZED = 'extension.micronaut-tools.navigation.nblsInitialized';

export enum RunMode {
    RUN = 'nbls.project.run',
    RUN_DEV = 'nbls.project.runDev',
    DEBUG = 'nbls.project.debug'
}

export enum BuildSystemType {
    MAVEN = 'Maven',
    GRADLE = 'Gradle',
    UNKNOWN = 'Unknown'
}

export interface ProjectInfo {
    readonly buildSystem: BuildSystemType;
    readonly runnableModules: string[];
}

export function isRunnableUri(uri: vscode.Uri): boolean {
    try {
        const rootDir = uri.fsPath;
        const javaDir = path.join(rootDir, 'src', 'main', 'java');
        return fs.existsSync(javaDir);
    } catch (err) {
        console.log(err);
    }
    return false;
}

export async function waitForProjectInfoAvailable() {
    const nbls = vscode.extensions.getExtension(EXTENSION_NBLS_ID);
    if (nbls) {
        for (let i = 0; i < TIMEOUT_COMMAND_GET_PROJECT_INFO; i++) {
            // console.log('>>> Waiting for project info ' + i)
            const commands = await vscode.commands.getCommands();
            if (commands.includes(COMMAND_GET_PROJECT_INFO)) {
                return;
            }
            await delay(1000);
        }
    }
    throw new Error('Timed out waiting for project support. Check whether the Language Server for Java by Apache NetBeans extension is active and initialized.');
}

export async function getProjectInfo(uri: vscode.Uri): Promise<ProjectInfo> {
    const infos: any[] = await vscode.commands.executeCommand(COMMAND_GET_PROJECT_INFO, uri.toString(), { projectStructure: true });
    setTimeout(() => { vscode.commands.executeCommand('setContext', CONTEXT_NBLS_INITIALIZED, true); }, 0);
    
    if (infos?.length && infos[0]) {
        const buildSystem: BuildSystemType = resolveBuildSystemType(uri, infos[0].projectType);
        const runnableModules: string[] = [];

        if (isRunnableUri(uri)) { // root module - most likely Micronaut
            runnableModules.push('');
        }

        for (const subproject of infos[0].subprojects) { // multimodule - most likely GCN
            if (isRunnableUri(vscode.Uri.parse(subproject))) {
                runnableModules.push(subproject);
                // runnableModuleNames.push(path.parse(subUri.fsPath).base);
            }
        }

        return {
            buildSystem: buildSystem,
            runnableModules: runnableModules.sort()
        };
    } else {
        return {
            buildSystem: BuildSystemType.UNKNOWN,
            runnableModules: []
        };
    }
}

export async function runModule(mode: RunMode, uri: vscode.Uri, build: BuildSystemType) {
    if (mode === RunMode.RUN_DEV) {
        if (build === BuildSystemType.MAVEN) {
            vscode.commands.executeCommand(RunMode.RUN, uri, RUN_DEV_MAVEN);
        } else if (build === BuildSystemType.GRADLE) {
            vscode.commands.executeCommand(RunMode.RUN, uri, RUN_DEV_GRADLE);
        } else {
            throw new Error('Running in Dev mode not supported for this project.');
        }
    } else {
        vscode.commands.executeCommand(mode, uri);
    }
}

function resolveBuildSystemType(uri: vscode.Uri, projectType: string | undefined): BuildSystemType {
    if (projectType?.includes('gradle')) {
        return BuildSystemType.GRADLE;
    }
    if (projectType?.includes('maven')) {
        return BuildSystemType.MAVEN;
    }
    if (fs.existsSync(path.join(uri.fsPath, 'gradlew'))) {
        return BuildSystemType.GRADLE;
    }
    if (fs.existsSync(path.join(uri.fsPath, 'mvnw'))) {
        return BuildSystemType.MAVEN;
    }
    return BuildSystemType.UNKNOWN;
}

function delay(ms: number) {
    return new Promise( resolve => setTimeout(resolve, ms) );
}
