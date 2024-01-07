/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { LAUNCH_COMMAND } from '../launcher/extension';


const EXTENSION_NBLS_ID = 'asf.apache-netbeans-java';
const COMMAND_GET_PROJECT_INFO = 'nbls.project.info';
const COMMAND_DEBUG_FROM_PROJECT_VIEW = 'java.debug.debugFromProjectView';
const COMMAND_RUN_FROM_PROJECT_VIEW = 'java.debug.runFromProjectView';
const TIMEOUT_COMMAND_GET_PROJECT_INFO = 30; // wait for NBLS & projectInfo up to 30 seconds
const RUN_DEV_MAVEN = 'Micronaut: dev mode';
const RUN_DEV_GRADLE = 'Continuous Mode';

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

/**
 * Artifact specification
 */
export interface NbArtifactSpec {
    artifactId? : string;
    groupId?: string;
    versionSpec?: string,
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
    if (infos?.length && infos[0]) {
        const buildSystem: BuildSystemType = resolveBuildSystemType(uri, infos[0].projectType);
        const runnableModules: string[] = [];

        if (isRunnableUri(uri)) { // root module - most likely Micronaut
            runnableModules.push('');
        }

        for (const subproject of infos[0].subprojects) { // multimodule - most likely GCN
            if (isRunnableUri(vscode.Uri.parse(subproject))) {
                runnableModules.push(subproject);
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

export async function runModule(mode: RunMode, uri: vscode.Uri, name: string, build: BuildSystemType) {
    const nblsDebugEnabled = vscode.workspace.getConfiguration('netbeans')?.get('javaSupport.enabled') as boolean;
    if (nblsDebugEnabled) {
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
    } else {
        const ext = vscode.extensions.getExtension('vscjava.vscode-java-debug');
        if (!ext) {
            throw new Error('No Run/Debug support found for this project.');
        }
        if (!ext.isActive) {
            await ext.activate();
        }
        if (mode === RunMode.DEBUG) {
            vscode.commands.executeCommand(COMMAND_DEBUG_FROM_PROJECT_VIEW, {name, uri});
        } else if (mode === RunMode.RUN) {
            vscode.commands.executeCommand(COMMAND_RUN_FROM_PROJECT_VIEW, {name, uri});
        } else {
            vscode.commands.executeCommand(LAUNCH_COMMAND, uri, true);
        }
    }
}

function resolveBuildSystemType(uri: vscode.Uri, projectType?: string): BuildSystemType {
    if (projectType?.includes('gradle')) {
        return BuildSystemType.GRADLE;
    }
    if (projectType?.includes('maven')) {
        return BuildSystemType.MAVEN;
    }
    if (fs.existsSync(path.join(uri.fsPath, 'build.gradle'))) {
        return BuildSystemType.GRADLE;
    }
    if (fs.existsSync(path.join(uri.fsPath, 'pom.xml'))) {
        return BuildSystemType.MAVEN;
    }
    return BuildSystemType.UNKNOWN;
}

export async function dependencyCheckingAvailable(): Promise<boolean> {
    return (await vscode.commands.getCommands()).includes('nbls.project.dependencies.find');
}

export async function checkConfigured(uri: vscode.Uri, subject: string, addMissing: boolean, ...dependencies: NbArtifactSpec[]): Promise<boolean> {
    const missingDependencies = await getMissingDependencies(uri, addMissing, ...dependencies);
    if (missingDependencies.length) {
        if (addMissing) {
            const updateDependenciesOption = 'Update Dependencies';
            const cancelOption = 'Cancel';
            const selected = await vscode.window.showWarningMessage(`Project dependencies must be updated to enable ${subject}.`, updateDependenciesOption, cancelOption);
            if (selected === updateDependenciesOption) {
                await addMissingDependencies(uri, ...missingDependencies);
                return true;
            }
        }
        return false;
    }
    return true;
}

/**
 * Dependency specification
 */
interface NbProjectDependency {
    artifact: NbArtifactSpec;
    scope?: string;
};

/**
 * Result of find artifacts operation.
 */
interface FindArtifactResult {
    /**
     * The project's product artifact
     */
    project : NbArtifactSpec;

    /**
     * Dependencies, that match the artifacts
     */
    matches: NbProjectDependency[];
}

interface DependencyChange {
    kind: 'add' | 'remove';
    options?: ('skipConflicts' | 'ignoreVersions')[];
    dependencies: NbProjectDependency[];
}

/*
interface DependencyChangeResult {
    edit : vscode.WorkspaceEdit;
    modifiedUris : string[];
}
*/

async function getMissingDependencies(uri: vscode.Uri, showProgress: boolean, ...dependencies: NbArtifactSpec[]): Promise<NbArtifactSpec[]> {
    async function impl(): Promise<NbArtifactSpec[]> {
        if (await dependencyCheckingAvailable()) {
            try {
                let found : FindArtifactResult = await vscode.commands.executeCommand('nbls.project.dependencies.find', {
                    uri: uri.toString(),
                    scopes: [ 'runtime'], // runtime scope hardcoded for now
                    artifacts: dependencies
                });
                return dependencies.filter(d => 
                    found?.matches?.filter(f => d.groupId == f.artifact.groupId && d.artifactId == f.artifact.artifactId).length == 0
                );
            } catch (err : any) {
                throw new Error('Failed to determine dependencies.');
            }
        } else {
            throw new Error('Java support not ready yet to check project dependencies.');
        }
    }
    return showProgress ? vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification, 
        title: 'Verifying required dependencies...' },
        impl
    ) : impl();
}

async function addMissingDependencies(uri: vscode.Uri, ...dependencies: NbArtifactSpec[]) {
    return vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification, 
        title: 'Adding required dependencies...' },
        async () => {
            if ((await vscode.commands.getCommands()).includes('nbls.project.dependencies.change')) {
                let depChanges : NbProjectDependency[] = dependencies.map(d => ({
                    // kind: 'add',
                    artifact : d,
                    scope: 'runtime' // runtime scope hardcoded for now
                }));
                let changeRequest : DependencyChange = {
                    kind: 'add',
                    // BUG in deseralization: options: [ 'skipConflicts' ],
                    dependencies: depChanges
                }
                try {
                    await vscode.commands.executeCommand('nbls.project.dependencies.change', {
                        uri: uri.toString(),
                        applyChanges: true,
                        saveFromServer: false,
                        changes: {
                            operations: [ changeRequest ]
                        }
                    });
                } catch (err : any) {
                    throw new Error('Failed to add dependencies.');
                }
            } else {
                throw new Error('Java support not ready yet to add missing dependencies.');
            }
        }
    );
}

function delay(ms: number) {
    return new Promise( resolve => setTimeout(resolve, ms) );
}
