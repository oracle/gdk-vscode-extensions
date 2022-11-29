/*
 * Copyright (c) 2022, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as xml2js from 'xml2js';
import * as semver from 'semver';

const GET_PROJECT_INFO = 'nbls.project.info';
const GET_PROJECT_ARTIFACTS = 'nbls.gcn.project.artifacts';
const NATIVE_BUILD = 'native-build';

// TODO: implement correctly for Maven/Gradle projects

export async function checkNBLS(): Promise<string | undefined> {
    const version = vscode.extensions.getExtension('asf.apache-netbeans-java')?.packageJSON.version;
    if (!version || semver.lt(version, '15.0.301')) {
        return 'Obsolete project support detected. Try to update the Language Server for Java by Apache NetBeans extension to the latest version.'
    }
    for (let i = 0; i < 5; i++) {
        const commands = await vscode.commands.getCommands();
        if (commands.includes(GET_PROJECT_INFO) && commands.includes(GET_PROJECT_ARTIFACTS)) {
            return undefined;
        }
        await delay(1000);
    }
    return 'Project support not available. Check whether the Language Server for Java by Apache NetBeans extension is active and initialized.'
}

export async function getProjectFolder(folder: vscode.WorkspaceFolder): Promise<ProjectFolder> {
    const infos: any[] = await vscode.commands.executeCommand(GET_PROJECT_INFO, folder.uri.toString(), { projectStructure: true });
    if (infos?.length && infos[0]) {
        const buildSystem: BuildSystemType | undefined = infos[0].projectType.includes('gradle') ? 'Gradle' : infos[0].projectType.includes('maven') ? 'Maven' : undefined;
        const subprojects = [];
        for(const sub of infos[0].subprojects) {
            const subInfos: any[] = await vscode.commands.executeCommand(GET_PROJECT_INFO, sub);
            if (subInfos?.length && subInfos[0]) {
                let name: string = subInfos[0].displayName; // TODO: non deterministic displayName returned
                let idx = name.lastIndexOf(path.sep);
                if (idx < 0) {
                    idx = name.lastIndexOf(':');
                }
                if (idx >= 0) {
                    name = name.slice(idx + 1);
                }
                idx = name.lastIndexOf('[');
                if (idx >= 0) {
                    name = name.slice(0, idx);
                }
                subprojects.push({ name: name.trim(), uri: sub } );
            }
        }
        // TODO: add better check for supported projects
        if (subprojects.length > 0) {
            for (const sub of subprojects) {
                const u = vscode.Uri.parse(sub.uri)?.fsPath;
                if (!u) {
                    continue;
                }
                const resPath = path.join(u, 'src', 'main', 'resources');
                if (fs.existsSync(path.join(resPath,  'application-oraclecloud.yml')) ||
                    fs.existsSync(path.join(resPath, 'application-ec2.yml'))) {
                    const projectType : ProjectType = 'GCN';
                    return Object.assign({}, folder, { projectType, buildSystem, subprojects });
                }
            }
        }
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

export async function getProjectBuildCommand(folder: ProjectFolder, subfolder: string = 'oci'):  Promise<string | undefined> {
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

export async function getProjectBuildNativeExecutableCommand(folder: ProjectFolder, subfolder: string = 'oci'):  Promise<string | undefined> {
    if (isMaven(folder)) {
        if (folder.projectType === 'Micronaut') {
            return 'chmod 777 ./mvnw && ./mvnw install --no-transfer-progress -Dpackaging=native-image -DskipTests';
        }
        if (folder.projectType === 'SpringBoot') {
            return 'chmod 777 ./mvnw && ./mvnw package --no-transfer-progress -Pnative -DskipTests';
        }
        if (folder.projectType === 'GCN') {
            let appName = undefined;
            if (fs.existsSync(path.join(folder.uri.fsPath, 'app'))) {
                appName = 'app';
            } else if (fs.existsSync(path.join(folder.uri.fsPath, 'lib'))) {
                appName = 'lib';
            }
            if (subfolder) {
                return `chmod 777 ./mvnw && ./mvnw install -pl ${appName} -am --no-transfer-progress -DskipTests && ./mvnw install -pl ${subfolder} --no-transfer-progress -Dpackaging=native-image -DskipTests`;
            }
            return `chmod 777 ./mvnw && ./mvnw install -pl ${appName} -am --no-transfer-progress -Dpackaging=native-image -DskipTests`;
        }
        return await vscode.window.showInputBox({ title: 'Provide Command to Build Native Executable for Project', value: 'mvn install -Dpackaging=native-image'});
    }
    if (isGradle(folder)) {
        if (folder.projectType === 'Micronaut' || folder.projectType === 'SpringBoot') {
            return 'chmod 777 ./gradlew && ./gradlew nativeCompile -x test';
        }
        if (folder.projectType === 'GCN') {
            return `chmod 777 ./gradlew && ./gradlew ${subfolder || 'oci'}:nativeCompile -x test`;
        }
        return await vscode.window.showInputBox({ title: 'Provide Command to Build Native Executable for Project', value: 'gradle nativeCompile'});
    }
    return undefined;
}

function tryReadMavenVersion(folder : string, version: string = '0.1') : string | undefined {
    const buildscript = path.resolve(folder, 'pom.xml');
    if (fs.existsSync(buildscript)) {
        xml2js.parseString(fs.readFileSync(buildscript)?.toString() || '', (err, result) => {
            if (!err && result) {
                const v = (result['project'] || [])['version'];
                if (v && v[0]) {
                    version = v[0];
                }
            }
        });
    }
    return version;
}

function tryReadGradleVersion(folder : string, version: string = '0.1') : string | undefined {
    const buildscript = path.resolve(folder, 'build.gradle');
    if (fs.existsSync(buildscript)) {
        fs.readFileSync(buildscript)?.toString().split(os.EOL).find(l => {
            const re = /^\s*version\s*=\s*((['"])([0-9].*?)(\2))/.exec(l);
            if (re) {
                version = re[3];
                return true;
            } else {
                return false;
            }
        });
    }
    return version;
}

export async function getProjectBuildArtifactLocation(folder: ProjectFolder, subfolder: string = 'oci'): Promise<string | undefined> {
    const projectPath: string = folder.uri.path;
    let artifacts: any[] | undefined = undefined;
    if (folder.projectType === 'GCN') {
        const uri = folder.subprojects.find(sub => sub.name === subfolder)?.uri;
        if (uri) {
            artifacts = await vscode.commands.executeCommand(GET_PROJECT_ARTIFACTS, uri);
        } else {
            // specified subfolder not present
            return undefined;
        }
    } else {
        artifacts = await vscode.commands.executeCommand(GET_PROJECT_ARTIFACTS, folder.uri.toString());
    }
    if (artifacts && artifacts.length === 1) {
        const loc: vscode.Uri = vscode.Uri.parse(artifacts[0].location);
        return path.relative(projectPath, loc.path).replace(path.sep, '/');
    }
    if (isMaven(folder)) {
        if (folder.projectType === 'Micronaut') {
            return `target/${folder.name}-${tryReadMavenVersion(folder.uri.fsPath)}.jar`;
        }
        if (folder.projectType === 'SpringBoot') {
            return `target/${folder.name}-${tryReadMavenVersion(folder.uri.fsPath)}.jar`;
        }
        if (folder.projectType === 'GCN') {
            const subPath = path.resolve(folder.uri.fsPath, subfolder);
            return `${subfolder}/target/${subfolder}-${tryReadMavenVersion(subPath)}.jar`;
        }
    }
    if (isGradle(folder)) {
        if (folder.projectType === 'Micronaut') {
            return `build/libs/${folder.name}-${tryReadGradleVersion(folder.uri.fsPath)}-all.jar`;
        }
        if (folder.projectType === 'SpringBoot') {
            return `build/libs/${folder.name}-${tryReadGradleVersion(folder.uri.fsPath, '0.0.1')}-SNAPSHOT.jar`;
        }
        if (folder.projectType === 'GCN') {
            const subPath = path.resolve(folder.uri.fsPath, subfolder);
            return `${subfolder}/build/libs/${subfolder}-${tryReadGradleVersion(subPath)}-all.jar`;
        }
    }
    return undefined;
}

export async function getProjectNativeExecutableArtifactLocation(folder: ProjectFolder, subfolder: string = 'oci'): Promise<string | undefined> {
    const projectPath: string = folder.uri.path;
    let artifacts: any[] | undefined = undefined;
    if (folder.projectType === 'GCN') {
        const uri = folder.subprojects.find(sub => sub.name === subfolder)?.uri;
        if (uri) {
            artifacts = await vscode.commands.executeCommand(GET_PROJECT_ARTIFACTS, uri, NATIVE_BUILD);
        }
    } else {
        artifacts = await vscode.commands.executeCommand(GET_PROJECT_ARTIFACTS, folder.uri.toString(), NATIVE_BUILD);
    }
    if (artifacts && artifacts.length === 1) {
        const loc: vscode.Uri = vscode.Uri.parse(artifacts[0].location);
        return path.relative(projectPath, loc.path).replace(path.sep, '/');
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
    return folder.subprojects.map(sub => sub.name).filter(name => name !== 'app' && name !== 'lib') || [];
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

function delay(ms: number) {
    return new Promise( resolve => setTimeout(resolve, ms) );
}
