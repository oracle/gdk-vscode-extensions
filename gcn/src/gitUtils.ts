/*
 * Copyright (c) 2022, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as cp from 'child_process';


function getGitAPI() {
    return vscode.extensions.getExtension('vscode.git')?.exports.getAPI(1);
}

function getPath(): string {
    return getGitAPI().git.path;
}

export async function cloneSourceRepository(repoPath: string, repoName: string, msg?: string): Promise<vscode.Uri | undefined> {
    const target: vscode.Uri[] | undefined = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        title: 'Choose Target Directory',
        openLabel: 'Clone Here'
    });
    if (target) {
         const done: boolean = await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: msg ? `${msg}: Cloning "${repoName}"...` : `Cloning "${repoName}"...`,
            cancellable: false
        }, (_progress, _token) => {
            return new Promise(async resolve => {
                cloneRepository(repoPath, target[0].fsPath).then(async result => {
                    resolve(result);
                });
            });
        });
        return done ? target[0] : undefined;
    } else {
        return undefined;
    }
}

export async function cloneRepository(address: string, target: string): Promise<boolean> {
    const gitPath = getPath();
    if (!gitPath) {
        vscode.window.showErrorMessage('Cannot access Git support.');
        return false;
    }
    try {
        const command = `${gitPath} clone ${address}`;
        await execute(command, target);
    } catch (err) {
        vscode.window.showErrorMessage('Failed to clone repository.');
        return false;
    }
    // console.log('>>> CLONED');
    return true;
}

export async function populateNewRepository(address: string, source: string): Promise<string | undefined> {
    const gitPath = getPath();
    if (!gitPath) {
        return 'Cannot access Git support.';
    }
    try {
        const command = `${gitPath} init`;
        // console.log('>>> ' + command + ' in ' + source);
        await execute(command, source);
    } catch (err) {
        return `git init: ${err}`;
    }
    try {
        const command = `${gitPath} remote add origin ${address}`;
        // console.log('>>> ' + command + ' in ' + source);
        await execute(command, source);
    } catch (err) {
        return `git remote add origin: ${err}`;
    }
    try {
        const command = `${gitPath} fetch`;
        // console.log('>>> ' + command + ' in ' + source);
        await execute(command, source);
    } catch (err) {
        return `git fetch: ${err}`;
    }
    try {
        const command = `${gitPath} checkout master`;
        // console.log('>>> ' + command + ' in ' + source);
        await execute(command, source);
    } catch (err) {
        return `git checkout master: ${err}`;
    }
    try {
        const command = `${gitPath} add .`;
        // console.log('>>> ' + command + ' in ' + source);
        await execute(command, source);
    } catch (err) {
        return `git add: ${err}`;
    }
    try {
        const command = `${gitPath} commit -m "Initial commit from VS Code"`;
        // console.log('>>> ' + command + ' in ' + source);
        await execute(command, source);
    } catch (err) {
        return `git commit: ${err}`;
    }
    try {
        const command = `${gitPath} push`;
        // console.log('>>> ' + command + ' in ' + source);
        await execute(command, source);
    } catch (err) {
        return `git push: ${err}`;
    }
    return undefined;
}

async function execute(command: string, cwd: string): Promise<string> {
    // console.log(`>>> Executing '${command}' in '${cwd}'`);
    return new Promise<string>((resolve, reject) => {
        cp.exec(command, { cwd: cwd }, (error, stdout, _stderr) => {
            if (error) {
                // console.log('--- Error ---');
                // console.log(error);
                // console.log(_stderr);
                reject(error ?? new Error(_stderr));
            } else {
                // console.log('--- Done ---');
                // console.log(stdout);
                // console.log('...');
                // console.log(_stderr);
                resolve(stdout);
            }
        })
    });
}