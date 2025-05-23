/*
 * Copyright (c) 2021, 2024, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as cp from 'child_process';
import { kubernetesChannel } from './kubernetesChannel';
import * as fs from 'fs';
import * as readline from 'readline'; 
import * as path from 'path';
import * as kubernetes from 'vscode-kubernetes-tools-api';
import * as logUtils from '../../../common/lib/logUtils';

enum ProjectType {
    Maven = 'pom.xml',
    Gradle = 'build.gradle'
}

export interface RunInfo {
    appName: string;
    deploymentFile: string;
    kubectl: kubernetes.KubectlV1;
    port: number;
    debugPort?: number;
    podName?: string;
    debug?: boolean;
}

const YES: string = 'Yes';
const NO: string = 'No';

export interface ProjectInfo {
    name: string;   
    version: string;
    root: string;
}

export async function collectInfo(appName: string, debug?: boolean): Promise<RunInfo> {
    logUtils.logInfo(`[kubernetesUtil] collecting info for: ${appName}`);
    const deploymentFile = await findResourceFileByKind('Deployment');
    if (!deploymentFile) {
        askToExecCommand(
            'extension.micronaut-tools.createServiceResource',
            'Deployment file is not present. Would you like to create it?');
        logUtils.logWarning(`[kubernetesUtil] ${appName}: Deployment file is not present.`);
        return Promise.reject();
    }
    const kubectl: kubernetes.API<kubernetes.KubectlV1> = await kubernetes.extension.kubectl.v1;
    if (!kubectl.available) {
        vscode.window.showErrorMessage(`kubectl not available: ${kubectl.reason}.`);
        logUtils.logError(`[kubernetesUtil] ${appName}: kubectl not available: ${kubectl.reason}.`);
        return Promise.reject();
    }
    const port = await getPort(deploymentFile);
    if (!port) {
        vscode.window.showErrorMessage(`containerPort was not found in  ${deploymentFile}.`);
        logUtils.logError(`[kubernetesUtil] ${appName}: containerPort was not found in  ${deploymentFile}.`);
        return Promise.reject();
    }
    let podName: string | undefined;
    if (appName) {
        podName = await getPod(kubectl.api, appName);
    } 
    const info = {
        appName,
        deploymentFile,
        kubectl: kubectl.api,
        port,
        debug,
        podName
    };
    logUtils.logInfo(`[kubernetesUtil] collected ${appName} info: ${JSON.stringify(info, undefined, 2)}`);
    return info;
}

export interface WrapperHelper {
    getProjectInfo: () => Promise<ProjectInfo>;
    buildAll: (runInfo: RunInfo) => Promise<RunInfo>;
}

export async function createWrapper(): Promise<WrapperHelper> {
    let wrapper: vscode.Uri[] = await vscode.workspace.findFiles(process.platform === 'win32' ? '**/gradlew.bat' : '**/gradlew', '**/node_modules/**');
    if (wrapper && wrapper.length > 0) {
        const exec = wrapper[0].fsPath.replace(/(\s+)/g, '\\$1');
        return new GradleHelper(exec);
    }
    wrapper = await vscode.workspace.findFiles(process.platform === 'win32' ? '**/mvnw.bat' : '**/mvnw', '**/node_modules/**');
    if (wrapper && wrapper.length > 0) {
        const exec = wrapper[0].fsPath.replace(/(\s+)/g, '\\$1');
        return new MavenHelper(exec);
    }
    logUtils.logError(`[kubernetesUtil] Maven nor Gradle present.`);
    return Promise.reject();
}

async function findProjectDir(type: ProjectType): Promise<string> {
    logUtils.logInfo(`[kubernetesUtil] Obtaining Project directory for type: ${type}`);
    let files: vscode.Uri[] = await vscode.workspace.findFiles(`**/${type}`);
    let projectDir = undefined;
    if(vscode.workspace.workspaceFolders !== undefined) {
        projectDir = vscode.workspace.workspaceFolders[0].uri.fsPath ; 
    }
    if (files && files.length > 0) {
        projectDir = files[0].fsPath.replace(/(.*\/).*/g, '$1');
    }
    if (projectDir) {
        logUtils.logInfo(`[kubernetesUtil] Obtained Project directory: ${projectDir}`);
        return projectDir;
    }
    logUtils.logError(`[kubernetesUtil] Project directory not found.`);
    return Promise.reject();
}

class MavenHelper implements WrapperHelper {
    wrapper: string;
    projectRoot: Promise<string>;
    constructor(wrapper: string) {
        this.wrapper = wrapper;
        this.projectRoot = findProjectDir(ProjectType.Maven);
    }

    async getProjectInfo(): Promise<ProjectInfo> {
        logUtils.logInfo(`[kubernetesUtil] Obtaining Project info.`);
        const projectDir = await this.projectRoot;
        if (projectDir) {
            const artifactId = cp.execFileSync(this.wrapper, 
                ["org.apache.maven.plugins:maven-help-plugin:evaluate", "-Dexpression=project.artifactId", "-q", "-DforceStdout"], 
                {cwd: projectDir}).toString(); 
            const version = cp.execFileSync(this.wrapper, 
                ["org.apache.maven.plugins:maven-help-plugin:evaluate", "-Dexpression=project.version", "-q", "-DforceStdout"], 
                {cwd: projectDir}).toString(); 
            logUtils.logInfo(`[kubernetesUtil] Obtained Project info.`);
            return {name: artifactId, version, root: projectDir};
        }
        logUtils.logError(`[kubernetesUtil] No Project info found.`);
        return Promise.reject();
    }

    async buildAll(runInfo: RunInfo): Promise<RunInfo> {
        const projectRoot = await this.projectRoot;
        return new Promise((resolve, reject) => {
            logUtils.logInfo(`[kubernetesUtil] Building Project: ${runInfo.appName}`);
            spawnWithOutput(this.wrapper, 
                ['-f', `${projectRoot}/pom.xml`, 'compile', 'jib:dockerBuild'], 
                {cwd: projectRoot}
            ).then(() => {
                logUtils.logInfo(`[kubernetesUtil] Builded Project: ${runInfo.appName}`);
                resolve(runInfo);
            }).catch(() => {
                logUtils.logError(`[kubernetesUtil] Building Project ${runInfo.appName} failed.`);
                reject();
            });
        });
    }
}

class GradleHelper implements WrapperHelper {
    wrapper: string;
    projectRoot: Promise<string>;

    constructor(wrapper: string) {
        this.wrapper = wrapper;
        this.projectRoot = findProjectDir(ProjectType.Maven);
    }

    async getProjectRoot() {
        return this.projectRoot;
    }

    async getProjectInfo(): Promise<ProjectInfo> {
        const projectDir = await this.projectRoot;
        logUtils.logInfo(`[kubernetesUtil] Obtaining Project info.`);
        if (projectDir) {
            let name = "";
            let version = "";
            const properties = cp.execFileSync(this.wrapper, 
                ["properties", "-q"], 
                {cwd: projectDir}); 
            properties.toString().split("\n").forEach(line => {
                let parts = line.split(": ");
                switch (parts[0]) {
                    case 'name': name = parts[1]; break;
                    case 'version': version = parts[1]; break;
                }
            });
            logUtils.logInfo(`[kubernetesUtil] Obtained Project info.`);
            return {name, version, root: projectDir};
        }
        logUtils.logError(`[kubernetesUtil] No Project info found.`);
        return Promise.reject();
    }

    async buildAll(runInfo: RunInfo): Promise<RunInfo> {
        const projectRoot = await this.projectRoot;
        return new Promise((resolve, reject) => {
            logUtils.logInfo(`[kubernetesUtil] Building Project: ${runInfo.appName}`);
            spawnWithOutput(this.wrapper, 
            ['-b', `${projectRoot}/build.gradle`, 'build', 'dockerBuild', 'dockerPush'], 
            {cwd: projectRoot}
            ).then(() => {
                logUtils.logInfo(`[kubernetesUtil] Builded Project: ${runInfo.appName}`);
                resolve(runInfo);
            }).catch(() => {
                logUtils.logError(`[kubernetesUtil] Building Project ${runInfo.appName} failed.`);
                reject();
            });
        });
    }
}

async function spawnWithOutput(command: string, args?: readonly string[] | undefined, options?: cp.SpawnOptionsWithoutStdio | undefined): Promise<void> {
    return new Promise((resolve, reject) => {
        logUtils.logInfo(`[kubernetesUtil] spawning process: ${command}: args: ${JSON.stringify(args)}`);
        const process = cp.spawn(command, args, options);
        process.stdout.on('data', (data) => {
            kubernetesChannel.appendLine(data);
        });
        
        process.stderr.on('data', (data) => {
            kubernetesChannel.appendLine(data);
        });
        process.on('exit', (exitCode) => {
            if (exitCode === 0) {
                logUtils.logInfo(`[kubernetesUtil] process exited.`);
                resolve();
            } else {
                logUtils.logError(`[kubernetesUtil] process failed.`);
                reject();
            }
        });
    });
}

export function createContent(template: (args: any) => string, templateName: string, name: string, namespace?: string, image?: string, dockerSecret?: string) {
    logUtils.logInfo(`[kubernetesUtil] creating content from template: ${templateName}`);
    return template({
        name, image, dockerSecret, namespace
    });
}

export function getUniqueFilename(parent: string, filename: string, extension: string): string {
    logUtils.logInfo(`[kubernetesUtil] creating unique filename from: ${filename}`);
    let file = path.join(parent, `${filename}.${extension}`);
    let i = 1;
    while (fs.existsSync(file)) {
        file = path.join(parent, `${filename}_${i++}.${extension}`);
    }
    logUtils.logInfo(`[kubernetesUtil] created unique filename: ${file}`);
    return file;
}

export function createNewFile(root: string, filename: string, extension: string, text: string) {
    logUtils.logInfo(`[kubernetesUtil] creating new file: ${filename}.${extension}`);
    const filePath = vscode.Uri.file(getUniqueFilename(root, filename, extension));
    const wsedit = new vscode.WorkspaceEdit();
    wsedit.createFile(filePath);
    wsedit.insert(filePath, new vscode.Position(0, 0), text);
    vscode.workspace.applyEdit(wsedit).then(
        () => vscode.window.showTextDocument(filePath)
    ).then(() => vscode.workspace.openTextDocument(filePath))
    .then((doc) => {
        doc.save();
        logUtils.logInfo(`[kubernetesUtil] created new file: ${doc.fileName}`);
    });
}

export async function findResourceFileByKind(kind: string) {
    logUtils.logInfo(`[kubernetesUtil] resolving resource file by kind: ${kind}`);
    let files: vscode.Uri[] = await vscode.workspace.findFiles(`**/*.{yaml,yml}`, '**/node_modules/**');
    let resourceFiles: string [] = [];
    for (const file of files) {
        let rl = readline.createInterface({
            input: fs.createReadStream(file.fsPath),
        });
        for await (const line of rl) {
            if (line.includes('kind') && line.includes(kind)) {
                resourceFiles.push(file.fsPath);
                break;
            }
        }
    }   
    if (resourceFiles.length > 0) {
        const file = resourceFiles.length === 1 ? resourceFiles[0] : pickOneFile(resourceFiles);
        logUtils.logInfo(`[kubernetesUtil] resolved resource file: ${file}`);
        return file;
    }
    logUtils.logError(`[kubernetesUtil] resolution of resource file failed.`);
    return undefined;
}

async function pickOneFile(files: string[]): Promise<string | undefined> {
    const items: (vscode.QuickPickItem & {value: string})[] = [];
    for (const file of files) {
        items.push({label: path.parse(file).base, value: file});
    }
    let selected = await vscode.window.showQuickPick(items, { placeHolder: `Select deployment file` });
    return selected?.value;
}

export async function askToExecCommand(command: string, message: string) {
    vscode.window.showInformationMessage(
        message, 
        ...[YES, NO]).then((answer) => {
        if (answer === YES) {
            vscode.commands.executeCommand(command);
        }
    });
}

async function getPort(deploymentFile: string): Promise<number | undefined> {
    let rl = readline.createInterface({
        input: fs.createReadStream(deploymentFile),
    });
    let ports = [];
    for await (const line of rl) {
        let matches = line.match(/\s*containerPort:\s+(\d+)/);
        if (matches) {
            ports.push(matches[1]);
        }
    }
    let port: number | undefined;
    if (ports.length > 1) {
        port = Number(await vscode.window.showQuickPick(ports));
    } else if (ports.length === 1) {
        port = Number(ports[0]);
    }
    return port;
}

export async function getPod(kubectl: kubernetes.KubectlV1, appName: string) {
    logUtils.logInfo(`[kubernetesUtil] obtaining pod for: ${appName}`);
    let command = `get pods --selector=app=${appName} -o jsonpath='{..items[*].metadata.name}'`;
    logUtils.logInfo(`[kubernetesUtil] invoking command: ${command}`);
    let result = await  kubectl.invokeCommand(command);
    let pods: string[] = [];
    if (result && result.code === 0) {
        let parts = result.stdout.split(' ');
        parts.forEach(pod => {
            pods.push(pod);
        });
    }
    if (pods.length > 0) {
        logUtils.logInfo(`[kubernetesUtil] obtained ${appName} pod: ${pods[0]}`);
        return Promise.resolve(pods[0]);
    } 
    logUtils.logError(`[kubernetesUtil] obtaininng ${appName} pod failed.`);
    return Promise.reject();
}
