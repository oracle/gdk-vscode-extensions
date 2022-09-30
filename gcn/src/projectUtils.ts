/*
 * Copyright (c) 2022, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

const GET_PROJECT_INFO = 'nbls.project.info';
const GET_PROJECT_ARTIFACTS = 'nbls.gcn.project.artifacts';
const NATIVE_BUILD = 'native-build';

// TODO: implement correctly for Maven/Gradle projects

export async function getProjectFolder(folder: vscode.WorkspaceFolder): Promise<ProjectFolder> {
    const infos: any[] = await vscode.commands.executeCommand(GET_PROJECT_INFO, folder.uri.toString(), { projectStructure: true });
    if (infos?.length && infos[0]) {
        const buildSystem: BuildSystemType | undefined = infos[0].projectType.includes('gradle') ? 'Gradle' : infos[0].projectType.includes('maven') ? 'Maven' : undefined;
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
        // TODO: add better check for supported projects
        if (fs.existsSync(path.join(subprojects.length > 0 ? path.join(folder.uri.fsPath, 'app') : folder.uri.fsPath, 'src', 'main', 'resources', 'application.yml'))) {
            const projectType: ProjectType = infos[0].subprojects?.length ? 'GCN' : 'Micronaut';
            return Object.assign({}, folder, { projectType, buildSystem, subprojects });
        } else if (fs.existsSync(path.join(subprojects.length > 0 ? path.join(folder.uri.fsPath, 'app') : folder.uri.fsPath, 'src', 'main', 'resources', 'application.properties'))) {
            const projectType: ProjectType = 'SpringBoot';
            return Object.assign({}, folder, { projectType, buildSystem, subprojects });
        } else {
            const projectType: ProjectType = 'Unknown';
            return Object.assign({}, folder, { projectType, buildSystem, subprojects: [] });
        }
    }
    return Object.assign({}, folder, { projectType: 'Unknown' as ProjectType, subprojects: [] });
}

export async function getProjectBuildCommand(folder: ProjectFolder, subfolder: string = 'app'):  Promise<string | undefined> {
    if (isMaven(folder)) {
        if (folder.projectType === 'Micronaut' || folder.projectType === 'SpringBoot') {
            return 'chmod 777 ./mvnw && ./mvnw package --no-transfer-progress';
        }
        if (folder.projectType === 'GCN') {
            return `chmod 777 ./mvnw && ./mvnw package -pl ${subfolder} -am --no-transfer-progress`;
        }
        return await vscode.window.showInputBox({ title: 'Provide Command to Build Project', value: 'mvn package'});
    }
    if (isGradle(folder)) {
        if (folder.projectType === 'Micronaut' || folder.projectType === 'SpringBoot') {
            return 'chmod 777 ./gradlew && ./gradlew build';
        }
        if (folder.projectType === 'GCN') {
            return `chmod 777 ./gradlew && ./gradlew ${subfolder}:build`;
        }
        return await vscode.window.showInputBox({ title: 'Provide Command to Build Project', value: 'gradle build'});
    }
    return undefined;
}

export async function getProjectBuildNativeExecutableCommand(folder: ProjectFolder, subfolder?: string):  Promise<string | undefined> {
    if (isMaven(folder)) {
        if (folder.projectType === 'Micronaut') {
            return 'chmod 777 ./mvnw && ./mvnw install --no-transfer-progress -Dpackaging=native-image -DskipTests';
        }
        if (folder.projectType === 'SpringBoot') {
            return 'chmod 777 ./mvnw && ./mvnw package --no-transfer-progress -Pnative -DskipTests';
        }
        if (folder.projectType === 'GCN') {
            if (subfolder) {
                return `chmod 777 ./mvnw && ./mvnw install -pl app -am --no-transfer-progress -DskipTests && ./mvnw install -pl ${subfolder} --no-transfer-progress -Dpackaging=native-image -DskipTests`;
            }
            return `chmod 777 ./mvnw && ./mvnw install -pl app -am --no-transfer-progress -Dpackaging=native-image -DskipTests`;
        }
        return await vscode.window.showInputBox({ title: 'Provide Command to Build Native Image for Project', value: 'mvn install -Dpackaging=native-image'});
    }
    if (isGradle(folder)) {
        if (folder.projectType === 'Micronaut' || folder.projectType === 'SpringBoot') {
            return 'chmod 777 ./gradlew && ./gradlew nativeCompile -x test';
        }
        if (folder.projectType === 'GCN') {
            return `chmod 777 ./gradlew && ./gradlew ${subfolder || 'app'}:nativeCompile -x test`;
        }
        return await vscode.window.showInputBox({ title: 'Provide Command to Build Native Image for Project', value: 'gradle nativeCompile'});
    }
    return undefined;
}

export async function getProjectBuildArtifactLocation(folder: ProjectFolder, subfolder: string = 'app'): Promise<string | undefined> {
    const projectUri: string = folder.uri.toString();
    let artifacts: any[] | undefined = undefined;
    if (folder.projectType === 'GCN') {
        const uri = folder.subprojects.find(sub => sub.name === subfolder)?.uri;
        if (uri) {
            artifacts = await vscode.commands.executeCommand(GET_PROJECT_ARTIFACTS, uri);
        }
    } else {
        artifacts = await vscode.commands.executeCommand(GET_PROJECT_ARTIFACTS, projectUri);
    }
    if (artifacts && artifacts.length === 1) {
        const loc: string = artifacts[0].location;
        if (loc.startsWith(projectUri + '/')) {
            return loc.slice(projectUri.length + 1);
        }
    }
    if (isMaven(folder)) {
        if (folder.projectType === 'Micronaut') {
            return `target/${folder.name}-0.1.jar`;
        }
        if (folder.projectType === 'SpringBoot') {
            return `target/${folder.name}-0.0.1-SNAPSHOT.jar`;
        }
        if (folder.projectType === 'GCN') {
            return `${subfolder}/target/${subfolder}-0.1.jar`;
        }
    }
    if (isGradle(folder)) {
        if (folder.projectType === 'Micronaut') {
            return `build/libs/${folder.name}-0.1-all.jar`;
        }
        if (folder.projectType === 'SpringBoot') {
            return `build/libs/${folder.name}-0.0.1-SNAPSHOT.jar`;
        }
        if (folder.projectType === 'GCN') {
            return `${subfolder}/build/libs/${subfolder}-0.1-all.jar`;
        }
    }
    return undefined;
}

export async function getProjectNativeExecutableArtifactLocation(folder: ProjectFolder, subfolder: string = 'app'): Promise<string | undefined> {
    const projectUri: string = folder.uri.toString();
    let artifacts: any[] | undefined = undefined;
    if (folder.projectType === 'GCN') {
        const uri = folder.subprojects.find(sub => sub.name === subfolder)?.uri;
        if (uri) {
            artifacts = await vscode.commands.executeCommand(GET_PROJECT_ARTIFACTS, uri, NATIVE_BUILD);
        }
    } else {
        artifacts = await vscode.commands.executeCommand(GET_PROJECT_ARTIFACTS, projectUri, NATIVE_BUILD);
    }
    if (artifacts && artifacts.length === 1) {
        const loc: string = artifacts[0].location;
        if (loc.startsWith(projectUri + '/')) {
            return loc.slice(projectUri.length + 1);
        }
    }
    if (isMaven(folder)) {
        if (folder.projectType === 'Micronaut' || folder.projectType === 'SpringBoot') {
            return `target/${folder.name}`;
        }
        if (folder.projectType === 'GCN') {
            return `${subfolder}/target/${subfolder}`;
        }
    }
    if (isGradle(folder)) {
        if (folder.projectType === 'Micronaut' || folder.projectType === 'SpringBoot') {
            return `build/native/nativeCompile/${folder.name}`;
        }
        if (folder.projectType === 'GCN') {
            return `${subfolder}/build/native/nativeCompile/${subfolder}`;
        }
    }
    return undefined;
}

export function getCloudSpecificSubProjectNames(folder: ProjectFolder): string[] {
    return folder.subprojects.map(sub => sub.name).filter(name => name !== 'app') || [];
}

export type ProjectType = 'GCN' | 'Micronaut' | 'SpringBoot' | 'Unknown';
export type BuildSystemType = 'Maven' | 'Gradle';

export interface ProjectFolder extends vscode.WorkspaceFolder {
    readonly projectType: ProjectType;
    readonly subprojects: {name: string, uri: string}[];
    readonly buildSystem?: BuildSystemType;
}

function isMaven(folder: ProjectFolder) {
    if (folder.buildSystem) {
        return folder.buildSystem === 'Maven';
    }
    return fs.existsSync(path.join(folder.uri.fsPath, 'mvnw'));
}

function isGradle(folder: ProjectFolder) {
    if (folder.buildSystem) {
        return folder.buildSystem === 'Gradle';
    }
    return fs.existsSync(path.join(folder.uri.fsPath, 'gradlew'));
}
