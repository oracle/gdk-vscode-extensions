/*
 * Copyright (c) 2022, 2023, Oracle and/or its affiliates. All rights reserved.
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
import { logError, logInfo } from '../../common/lib/logUtils';


const GET_PROJECT_INFO = 'nbls.project.info';
const GET_PROJECT_DEPENDENCIES = 'nbls.project.dependencies.find';
const GET_PROJECT_ARTIFACTS = 'nbls.project.artifacts';
const NATIVE_BUILD = 'native-build';

const DEVOPS_RESOURCES_DIR = '.devops';

// TODO: implement correctly for Maven/Gradle projects

export function getDevOpsResourcesDir(): string {
    return DEVOPS_RESOURCES_DIR;
}

export async function checkNBLS(): Promise<string | undefined> {
    const version = vscode.extensions.getExtension('asf.apache-netbeans-java')?.packageJSON.version;
    if (!version || semver.lt(version, '15.0.301')) {
        return 'Obsolete project support detected. Try to update the Language Server for Java by Apache NetBeans extension to the latest version.';
    }
    for (let i = 0; i < 5; i++) {
        const commands = await vscode.commands.getCommands();
        if (commands.includes(GET_PROJECT_INFO) && commands.includes(GET_PROJECT_ARTIFACTS)) {
            return undefined;
        }
        await delay(1000);
    }
    return 'Project support not available. Check whether the Language Server for Java by Apache NetBeans extension is active and initialized.';
}

interface ArtifactSpec {
    groupId : string;
    artifactId : string;
    versionSpec : string;
}

interface Dependency {
    artifact : ArtifactSpec;
    project : any;
    scope : string;
}

interface DependencyResult {
    uri : string;
    project? : ArtifactSpec;
    matches? : Dependency[];
}

export async function getProjectFolder(folder: vscode.WorkspaceFolder): Promise<ProjectFolder> {
    const infos: any[] = await vscode.commands.executeCommand(GET_PROJECT_INFO, folder.uri.toString(), { projectStructure: true });
    if (infos?.length && infos[0]) {
        const buildSystem: BuildSystemType | undefined = infos[0].projectType.includes('gradle') ? 'Gradle' : infos[0].projectType.includes('maven') ? 'Maven' : undefined;
        const subprojects = [];
        for(const sub of infos[0].subprojects) {
            const subInfos: any[] = await vscode.commands.executeCommand(GET_PROJECT_INFO, sub);
            if (subInfos?.length && subInfos[0]) {
                let name: string = subInfos[0].projectDirectory;
                if (name.endsWith('/')) {
                    name = name.slice(0, name.length - 1);
                }
                if (name.startsWith(infos[0].projectDirectory)) {
                    name = name.slice(infos[0].projectDirectory.length);
                } else {
                    const idx = name.lastIndexOf('/');
                    if (idx >= 0) {
                        name = name.slice(idx);
                    }
                }
                let displayName: string = subInfos[0].displayName; // TODO: non deterministic displayName returned
                let idx = displayName.lastIndexOf('/');
                if (idx < 0) {
                    idx = displayName.lastIndexOf(':');
                }
                if (idx >= 0) {
                    displayName = displayName.slice(idx + 1);
                }
                idx = displayName.lastIndexOf('[');
                if (idx >= 0) {
                    displayName = displayName.slice(0, idx);
                }
                subprojects.push({ name, displayName: displayName.trim(), uri: sub } );
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
                    fs.existsSync(path.join(resPath,  'application-oraclecloud.properties')) ||
                    fs.existsSync(path.join(resPath, 'application-ec2.yml')) ||
                    fs.existsSync(path.join(resPath, 'application-ec2.properties'))) {
                    const projectType : ProjectType = 'GDK';
                    return Object.assign({}, folder, { projectType, buildSystem, subprojects, deploySubproject: sub });
                }
                if (fs.existsSync(path.join(resPath, 'application.yaml')) ||
                    fs.existsSync(path.join(resPath, 'META-INF', 'microprofile-config.properties')) ||
                    fs.existsSync(path.join(u, '.helidon'))) {
                    const pomPath = path.join(u, 'pom.xml');
                    // currently we only support Helidon Maven projects
                    if (fs.existsSync(pomPath)) {
                        try {
                            logInfo(`[project] Getting project dependencies for ${u.toString()}`);
                            const response : DependencyResult = await vscode.commands.executeCommand(GET_PROJECT_DEPENDENCIES, {
                                uri: folder.uri.toString(),
                                artifacts: [
                                    { groupId: 'com.oracle.oci.sdk', artifactId: 'oci-java-sdk-core'},
                                    { groupId: 'io.helidon.microprofile.bundles', artifactId: 'helidon-microprofile-core'},
                                    { groupId: 'io.helidon.webserver', artifactId: 'helidon-webserver'}
                                ],
                                returnContents: false
                            });
                            const projectType : ProjectType = 'Helidon';
                            logInfo(`[project] Dependencies for ${u.toString()}: ${JSON.stringify(response)}`);
                            let oci = false;
                            let helidon = false;
                            response.matches?.forEach(m => {
                                if (m.artifact.groupId === 'com.oracle.oci.sdk') {
                                    oci = true;
                                } else if (m.artifact.groupId.startsWith('io.helidon')) {
                                    helidon = true;
                                }
                            });
                            if (oci && helidon) {
                                return Object.assign({}, folder, { projectType, buildSystem, subprojects, deploySubproject: sub });
                            }
                        } catch (err : any) {
                            logError(`[project] Unable to read project dependencies for ${u.toString()}: ${err['message']}`);
                        }
                    }
                }
            }
        }
        const resPath = path.join(folder.uri.fsPath, 'src', 'main', 'resources');
        if (fs.existsSync(path.join(subprojects.length > 0 ? path.join(folder.uri.fsPath, 'app') : folder.uri.fsPath, 'src', 'main', 'resources', 'application.yml'))) {
            const projectType: ProjectType = infos[0].subprojects?.length ? 'GDK' : 'Micronaut';
            return Object.assign({}, folder, { projectType, buildSystem, subprojects });
        } else if (fs.existsSync(path.join(folder.uri.fsPath, 'micronaut-cli.yml'))) {
            const projectType: ProjectType = 'Micronaut';
            return Object.assign({}, folder, { projectType, buildSystem, subprojects });
        } else if (fs.existsSync(path.join(subprojects.length > 0 ? path.join(folder.uri.fsPath, 'app') : folder.uri.fsPath, 'src', 'main', 'resources', 'application.properties'))) {
            const projectType: ProjectType = 'SpringBoot';
            return Object.assign({}, folder, { projectType, buildSystem, subprojects });
        }
        if ((fs.existsSync(path.join(resPath, 'application.yaml')) ||
            fs.existsSync(path.join(resPath, 'META-INF', 'microprofile-config.properties')) ||
            fs.existsSync(path.join(folder.uri.fsPath, '.helidon'))) && fs.existsSync(path.join(folder.uri.fsPath, 'pom.xml'))) {
            // possibly Helidon, must verify using dependencies
            try {
                logInfo(`[project] Getting project dependencies for ${folder.uri.toString()}`);
                const response : DependencyResult = await vscode.commands.executeCommand(GET_PROJECT_DEPENDENCIES, {
                    uri: folder.uri.toString(),
                    artifacts: [
                        { groupId: 'io.helidon.microprofile.bundles', artifactId: 'helidon-microprofile-core'}, // Helidon MP
                        { groupId: 'io.helidon.webserver', artifactId: 'helidon-webserver'} // Helidon SE
                    ],
                    returnContents: false
                });
                logInfo(`[project] Dependencies for ${folder.uri.toString()}: ${JSON.stringify(response)}`);
                if (response.matches?.length) {
                    const projectType: ProjectType = 'Helidon';
                    return Object.assign({}, folder, { projectType, buildSystem, subprojects });
                }
            } catch (err : any) {
                logError(`[project] Could not get dependencies of ${folder.uri}: ${err['message']}`);
            }
        }
        const projectType: ProjectType = 'Unknown';
        return Object.assign({}, folder, { projectType, buildSystem, subprojects: [] });
    }

    return Object.assign({}, folder, { projectType: 'Unknown' as ProjectType, subprojects: [] });
}

export async function getProjectBuildCommand(folder: ProjectFolder, subfolder: string = 'oci'):  Promise<string | undefined> {
    if (isMaven(folder)) {
        if (folder.projectType === 'Micronaut' || folder.projectType === 'SpringBoot') {
            return 'chmod 777 ./mvnw && ./mvnw package --no-transfer-progress -DskipTests';
        }
        // Helidon wizard has no mvnw
        if (folder.projectType === 'Helidon') {
            return 'mvn package --no-transfer-progress -DskipTests';
        }
        if (folder.projectType === 'GDK') {
            return `chmod 777 ./mvnw && ./mvnw package -pl ${subfolder} -am --no-transfer-progress -DskipTests`;
        }
        return await vscode.window.showInputBox({ title: 'Provide Command to Build Project', value: 'mvn package'});
    }
    if (isGradle(folder)) {
        if (folder.projectType === 'Micronaut' || folder.projectType === 'SpringBoot') {
            return 'chmod 777 ./gradlew && ./gradlew build -x test';
        }
        if (folder.projectType === 'GDK') {
            return `chmod 777 ./gradlew && ./gradlew ${subfolder}:build -x test`;
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
            return 'chmod 777 ./mvnw && ./mvnw --no-transfer-progress native:compile -Pnative -DskipTests';
        }
        if (folder.projectType === 'Helidon') {
            return 'mvn --no-transfer-progress package -Pnative-image -DskipTests';
        }
        if (folder.projectType === 'GDK') {
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
        if (folder.projectType === 'GDK') {
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

export async function getProjectRequiredJavaVersion(folder: vscode.WorkspaceFolder): Promise<string | undefined> {
    const project = await getProjectFolder(folder);
    // TODO: once there's a proper way to read the toolchain languageVersion, should probably be used for all project types, not only SpringBoot
    if (project.projectType === 'SpringBoot' && project.buildSystem === 'Gradle') {
        return tryReadGradleToolchainJavaVersion(folder.uri.fsPath);
    }
    return undefined;
}

function tryReadGradleToolchainJavaVersion(folder: string): string | undefined {
    const buildscript = path.resolve(folder, 'build.gradle');
    if (fs.existsSync(buildscript)) {
        try {
            const lines = fs.readFileSync(buildscript).toString().split(/\r?\n/);

            function chCount(ch: string, string: string): number {
                let count = 0;
                for (const char of string) {
                    if (char === ch) {
                        count++;
                    }
                }
                return count;
            }
            function isBlockStart(block: string, string: string): boolean {
                string = string.replace(/\s+/g, '');
                return string.startsWith(`${block}{`);
            }
            function getBlockLines(block: string, lines: string[]): string[] | undefined {
                let blockLines: string[] | undefined;
                let blockLevel = 0;
                for (const line of lines) {
                    if (!blockLines && isBlockStart(block, line)) {
                        blockLevel += chCount('{', line);
                        blockLevel -= chCount('}', line);
                        if (blockLevel > 0) {
                            blockLines = [];
                        } else {
                            break;
                        }
                    } else if (blockLines) {
                        blockLevel += chCount('{', line);
                        blockLevel -= chCount('}', line);
                        if (blockLevel > 0) {
                            blockLines.push(line);
                        } else {
                            break;
                        }
                    }
                }
                return blockLines;
            }

            // TODO: temporary hack, needs a proper way to read the toolchain languageVersion
            const javaBlockLines = getBlockLines('java', lines);
            if (javaBlockLines?.length) {
                const toolchainBlockLines = getBlockLines('toolchain', javaBlockLines);
                if (toolchainBlockLines?.length) {
                    for (const rawLine of toolchainBlockLines) {
                        const line = rawLine.replace(/\s+/g, '');
                        if (line.startsWith('languageVersion=JavaLanguageVersion.of(')) {
                            const closingIndex = line.indexOf(')');
                            if (closingIndex > 0) {
                                const languageVersion = line.slice('languageVersion=JavaLanguageVersion.of('.length, closingIndex);
                                logInfo(`[project] Detected SpringBoot Gradle project with toolchain languageVersion=${languageVersion}`);
                                return languageVersion;
                            }
                        }
                    }
                }
            }
        } catch (err) {
            logError(`[project] Failed to process ${buildscript}: ${err}`);
        }
    }
    return undefined;
}

export async function getProjectBuildArtifactLocation(folder: ProjectFolder, subfolder: string = 'oci', shaded : boolean = true): Promise<string | undefined> {
    const projectPath: string = folder.uri.path;
    let artifacts: any[] | undefined = undefined;
    let opts : any = {};
    if (shaded) {
        // hint the query to return the uber-jar, if available.
        opts['tags'] = '<shaded>';
    }
    if (folder.projectType === 'GDK') {
        const uri = folder.subprojects.find(sub => sub.name === subfolder)?.uri;
        if (uri) {
            artifacts = await vscode.commands.executeCommand(GET_PROJECT_ARTIFACTS, uri.toString(), opts);
        } else {
            // specified subfolder not present
            return undefined;
        }
    } else {
        artifacts = await vscode.commands.executeCommand(GET_PROJECT_ARTIFACTS, folder.uri.toString(), opts);
    }
    if (artifacts && artifacts.length > 0) {
        const loc: vscode.Uri = vscode.Uri.parse(artifacts[0].location);
        return path.relative(projectPath, loc.path);
    }
    if (isMaven(folder)) {
        if (folder.projectType === 'Micronaut') {
            return `target/${folder.name}-${tryReadMavenVersion(folder.uri.fsPath)}.jar`;
        }
        if (folder.projectType === 'SpringBoot' || folder.projectType === 'Helidon') {
            return `target/${folder.name}-${tryReadMavenVersion(folder.uri.fsPath)}.jar`;
        }
        if (folder.projectType === 'GDK') {
            const subPath = path.resolve(folder.uri.fsPath, subfolder);
            return `${subfolder}/target/${subfolder}-${tryReadMavenVersion(subPath)}.jar`;
        }
    }
    if (isGradle(folder)) {
        if (folder.projectType === 'Micronaut') {
            return `build/libs/${folder.name}-${tryReadGradleVersion(folder.uri.fsPath)}-all.jar`;
        }
        if (folder.projectType === 'SpringBoot' || folder.projectType === 'Helidon') {
            return `build/libs/${folder.name}-${tryReadGradleVersion(folder.uri.fsPath, '0.0.1')}-SNAPSHOT.jar`;
        }
        if (folder.projectType === 'GDK') {
            const subPath = path.resolve(folder.uri.fsPath, subfolder);
            return `${subfolder}/build/libs/${subfolder}-${tryReadGradleVersion(subPath)}-all.jar`;
        }
    }
    return undefined;
}

export async function getProjectNativeExecutableArtifactLocation(folder: ProjectFolder, subfolder: string = 'oci'): Promise<string | undefined> {
    const projectPath: string = folder.uri.path;
    let artifacts: any[] | undefined = undefined;
    if (folder.projectType === 'GDK') {
        const uri = folder.subprojects.find(sub => sub.name === subfolder)?.uri;
        if (uri) {
            artifacts = await vscode.commands.executeCommand(GET_PROJECT_ARTIFACTS, uri, NATIVE_BUILD);
        }
    } else {
        artifacts = await vscode.commands.executeCommand(GET_PROJECT_ARTIFACTS, folder.uri.toString(), NATIVE_BUILD);
    }
    if (artifacts && artifacts.length === 1) {
        const loc: vscode.Uri = vscode.Uri.parse(artifacts[0].location);
        return path.relative(projectPath, loc.path);
    }
    if (isMaven(folder)) {
        if (folder.projectType === 'Micronaut' || folder.projectType === 'SpringBoot' || folder.projectType === 'Helidon') {
            return `target/${folder.name}`;
        }
        if (folder.projectType === 'GDK') {
            return `${subfolder}/target/${subfolder}`;
        }
    }
    if (isGradle(folder)) {
        if (folder.projectType === 'Micronaut' || folder.projectType === 'SpringBoot') {
            return `build/native/nativeCompile/${folder.name}`;
        }
        if (folder.projectType === 'GDK') {
            return `${subfolder}/build/native/nativeCompile/${subfolder}`;
        }
    }
    return undefined;
}

export function getCloudSpecificSubProjectNames(folder: ProjectFolder): string[] {
    return folder.subprojects.map(sub => sub.name).filter(name => name !== 'app' && name !== 'lib') || [];
}

export function getDockerfiles(folder: ProjectFolder): string[] {
    return fs.readdirSync(folder.uri.fsPath).filter(name => name === 'Dockerfile' || name.startsWith('Dockerfile.'));
}

export type ProjectType = 'GDK' | 'Micronaut' | 'SpringBoot' | 'Helidon' | 'Unknown';
export type BuildSystemType = 'Maven' | 'Gradle';

export interface ProjectFolder extends vscode.WorkspaceFolder {
    readonly projectType: ProjectType;
    readonly subprojects: {name: string; displayName?: string; uri: string}[];
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