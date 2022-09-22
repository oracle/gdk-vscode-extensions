/*
 * Copyright (c) 2022, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as model from './model';

const GET_PROJECT_INFO = 'nbls.project.info';
const GET_PROJECT_ARTIFACTS = 'nbls.gcn.project.artifacts';
const NATIVE_BUILD = 'native-build';

// TODO: implement correctly for Maven/Gradle projects

export async function getProjectInfo(folder: vscode.WorkspaceFolder): Promise<ProjectInfo> {
    const infos: any[] = await vscode.commands.executeCommand(GET_PROJECT_INFO, folder.uri.toString(), { projectStructure: true });
    if (infos?.length && infos[0]) {
        // TODO: add better check for supported projects
        const buildSystem = infos[0].projectType.includes('gradle') ? 'Gradle' : infos[0].projectType.includes('maven') ? 'Maven' : undefined;
        const subprojects = [];
        for(const sub of infos[0].subprojects) {
            const subInfos: any[] = await vscode.commands.executeCommand(GET_PROJECT_INFO, sub);
            if (subInfos?.length && subInfos[0]) {
                const name: string = subInfos[0].displayName; // TODO: non deterministic displayName returned
                let idx = name.lastIndexOf(path.sep);
                if (idx < 0) {
                    idx = name.lastIndexOf(':');
                }
                subprojects.push({ name: idx < 0 ? name : name.slice(idx + 1), uri: sub } );
            }
        }
        if (fs.existsSync(path.join(subprojects.length > 0 ? path.join(folder.uri.fsPath, 'app') : folder.uri.fsPath, 'src', 'main', 'resources', 'application.yml'))) {
            return { projectType: infos[0].subprojects?.length ? 'GCN' : 'Micronaut', buildSystem, subprojects };
        } else {
            return { projectType: 'Unknown', buildSystem, subprojects: [] }
        }
    }
    return { projectType: 'Unknown', subprojects: [] };
}

export function getProjectBuildCommand(folder: model.DeployFolder, subfolder: string = 'app'): string | undefined {
    if (isMaven(folder)) {
        if (folder.projectInfo.projectType === 'Micronaut') {
            return 'chmod 777 ./mvnw && ./mvnw package --no-transfer-progress';
        }
        if (folder.projectInfo.projectType === 'GCN') {
            return `chmod 777 ./mvnw && ./mvnw package -pl ${subfolder} -am --no-transfer-progress`;
        }
    }
    if (isGradle(folder)) {
        if (folder.projectInfo.projectType === 'Micronaut') {
            return 'chmod 777 ./gradlew && ./gradlew build';
        }
        if (folder.projectInfo.projectType === 'GCN') {
            return `chmod 777 ./gradlew && ./gradlew ${subfolder}:build`;
        }
    }
    return undefined;
}

export function getProjectBuildNativeExecutableCommand(folder: model.DeployFolder, subfolder?: string): string | undefined {
    if (isMaven(folder)) {
        if (folder.projectInfo.projectType === 'Micronaut') {
            return 'chmod 777 ./mvnw && ./mvnw install --no-transfer-progress -Dpackaging=native-image -DskipTests';
        }
        if (folder.projectInfo.projectType === 'GCN') {
            if (subfolder) {
                return `chmod 777 ./mvnw && ./mvnw install -pl app -am --no-transfer-progress -DskipTests && ./mvnw install -pl ${subfolder} --no-transfer-progress -Dpackaging=native-image -DskipTests`;
            }
            return `chmod 777 ./mvnw && ./mvnw install -pl app -am --no-transfer-progress -Dpackaging=native-image -DskipTests`;
        }
    }
    if (isGradle(folder)) {
        if (folder.projectInfo.projectType === 'Micronaut') {
            return 'chmod 777 ./gradlew && ./gradlew nativeCompile -x test';
        }
        if (folder.projectInfo.projectType === 'GCN') {
            return `chmod 777 ./gradlew && ./gradlew ${subfolder || 'app'}:nativeCompile -x test`;
        }
    }
    return undefined;
}

export async function getProjectBuildArtifactLocation(folder: model.DeployFolder, subfolder: string = 'app'): Promise<string | undefined> {
    const projectUri: string = folder.folder.uri.toString();
    let artifacts: any[] | undefined = undefined;
    if (folder.projectInfo.projectType === 'Micronaut') {
        artifacts = await vscode.commands.executeCommand(GET_PROJECT_ARTIFACTS, projectUri);
    }
    if (folder.projectInfo.projectType === 'GCN') {
        const uri = folder.projectInfo.subprojects.find(sub => sub.name === subfolder)?.uri;
        if (uri) {
            artifacts = await vscode.commands.executeCommand(GET_PROJECT_ARTIFACTS, uri);
        }
    }
    if (artifacts && artifacts.length === 1) {
        const loc: string = artifacts[0].location;
        if (loc.startsWith(projectUri + '/')) {
            return loc.slice(projectUri.length + 1);
        }
    }
    if (isMaven(folder)) {
        if (folder.projectInfo.projectType === 'Micronaut') {
            return `target/${folder.folder.name}-0.1.jar`;
        }
        if (folder.projectInfo.projectType === 'GCN') {
            return `${subfolder}/target/${subfolder}-0.1.jar`;
        }
    }
    if (isGradle(folder)) {
        if (folder.projectInfo.projectType === 'Micronaut') {
            return `build/libs/${folder.folder.name}-0.1-all.jar`;
        }
        if (folder.projectInfo.projectType === 'GCN') {
            return `${subfolder}/build/libs/${subfolder}-0.1-all.jar`;
        }
    }
    return undefined;
}

export async function getProjectNativeExecutableArtifactLocation(folder: model.DeployFolder, subfolder: string = 'app'): Promise<string | undefined> {
    const projectUri: string = folder.folder.uri.toString();
    let artifacts: any[] | undefined = undefined;
    if (folder.projectInfo.projectType === 'Micronaut') {
        artifacts = await vscode.commands.executeCommand(GET_PROJECT_ARTIFACTS, projectUri, NATIVE_BUILD);
    }
    if (folder.projectInfo.projectType === 'GCN') {
        const uri = folder.projectInfo.subprojects.find(sub => sub.name === subfolder)?.uri;
        if (uri) {
            artifacts = await vscode.commands.executeCommand(GET_PROJECT_ARTIFACTS, uri, NATIVE_BUILD);
        }
    }
    if (artifacts && artifacts.length === 1) {
        const loc: string = artifacts[0].location;
        if (loc.startsWith(projectUri + '/')) {
            return loc.slice(projectUri.length + 1);
        }
    }
    if (isMaven(folder)) {
        if (folder.projectInfo.projectType === 'Micronaut') {
            return `target/${folder.folder.name}`;
        }
        if (folder.projectInfo.projectType === 'GCN') {
            return `${subfolder}/target/${subfolder}`;
        }
    }
    if (isGradle(folder)) {
        if (folder.projectInfo.projectType === 'Micronaut') {
            return `build/native/nativeCompile/${folder.folder.name}`;
        }
        if (folder.projectInfo.projectType === 'GCN') {
            return `${subfolder}/build/native/nativeCompile/${subfolder}`;
        }
    }
    return undefined;
}

export function getCloudSpecificSubProjectNames(folder: model.DeployFolder): string[] {
    return folder.projectInfo.subprojects.map(sub => sub.name).filter(name => name !== 'app') || [];
}

export interface ProjectInfo {
    readonly projectType: 'GCN' | 'Micronaut' | 'Unknown';
    readonly subprojects: {name: string, uri: string}[];
    readonly buildSystem?: 'Maven' | 'Gradle';
}

function isMaven(folder: model.DeployFolder) {
    if (folder.projectInfo.buildSystem) {
        return folder.projectInfo.buildSystem === 'Maven';
    }
    return fs.existsSync(path.join(folder.folder.uri.fsPath, 'mvnw'));
}

function isGradle(folder: model.DeployFolder) {
    if (folder.projectInfo.buildSystem) {
        return folder.projectInfo.buildSystem === 'Gradle';
    }
    return fs.existsSync(path.join(folder.folder.uri.fsPath, 'gradlew'));
}
