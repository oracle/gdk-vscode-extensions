/*
 * Copyright (c) 2022, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as dialogs from './dialogs';

function getGitAPI() {
    return vscode.extensions.getExtension('vscode.git')?.exports.getAPI(1);
}

function getPath(): string | undefined {
    return getGitAPI()?.git.path;
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
        dialogs.showErrorMessage('Cannot access Git support.');
        return false;
    }
    try {
        const command = `${gitPath} clone ${address}`;
        await execute(command, target);
    } catch (err) {
        dialogs.showErrorMessage('Failed to clone repository', err);
        return false;
    }
    return true;
}

export function getHEAD(target: vscode.Uri): { name?: string, commit?: string, upstream?: object } | undefined {
    const gitApi = getGitAPI();
    if (!gitApi) {
        dialogs.showErrorMessage('Cannot access Git support.');
        return undefined;
    }
    const repository = gitApi.getRepository(target);
    if (!repository) {
        dialogs.showErrorMessage(`Cannot find Git repository for ${target}`);
        return undefined;
    }
    return repository.state.HEAD;
}

export function locallyModified(target: vscode.Uri): boolean | undefined {
    const gitApi = getGitAPI();
    if (!gitApi) {
        dialogs.showErrorMessage('Cannot access Git support.');
        return undefined;
    }
    const repository = gitApi.getRepository(target);
    if (!repository) {
        dialogs.showErrorMessage(`Cannot find Git repository for ${target}`);
        return undefined;
    }
    return repository.state.indexChanges.length > 0 || repository.state.mergeChanges.length > 0 || repository.state.workingTreeChanges.length > 0;
}

export async function pushLocalBranch(target: vscode.Uri): Promise<boolean | undefined> {
    const gitApi = getGitAPI();
    if (!gitApi) {
        dialogs.showErrorMessage('Cannot access Git support.');
        return undefined;
    }
    const repository = gitApi.getRepository(target);
    if (!repository) {
        dialogs.showErrorMessage(`Cannot find Git repository for ${target}`);
        return undefined;
    }
    try {
        await vscode.commands.executeCommand('git.publish', [repository]);
        return true;
    } catch (err) {
        dialogs.showErrorMessage('Error while pushing a branch', err);
        return false;
    }
}

export async function populateNewRepository(address: string, source: string, ...forced: string[]): Promise<string | undefined> {
    const gitPath = getPath();
    if (!gitPath) {
        return dialogs.getErrorMessage('Cannot access Git support.');
    }
    try {
        const command = `${gitPath} init`;
        await execute(command, source);
    } catch (err) {
        return dialogs.getErrorMessage('Error while initializing repository', err);
    }
    try {
        const command = `${gitPath} remote add origin ${address}`;
        await execute(command, source);
    } catch (err) {
        return dialogs.getErrorMessage('Error while adding remote repository url', err);
    }
    try {
        const command = `${gitPath} fetch`;
        await execute(command, source);
    } catch (err) {
        return dialogs.getErrorMessage('Error while fetching content of remote repository', err);
    }
    try {
        const command = `${gitPath} checkout master`;
        await execute(command, source);
    } catch (err) {
        return dialogs.getErrorMessage('Error while checking out master branch', err);
    }
    try {
        const command = `${gitPath} add .`;
        await execute(command, source);
    } catch (err) {
        return dialogs.getErrorMessage('Error while adding local sources', err);
    }
    try {
        const command = `${gitPath} commit -m "Initial commit from VS Code"`;
        await execute(command, source);
    } catch (err) {
        return dialogs.getErrorMessage('Error while commiting changes', err);
    }
    try {
        const command = `${gitPath} push`;
        await execute(command, source);
    } catch (err) {
        return dialogs.getErrorMessage('Error while pushing lacal changes to remote repository', err);
    }
    if (forced && forced.length > 0) {
        try {
            const files = forced.join(' ');
            const command = `${gitPath} update-index --skip-worktree ${files}`;
            await execute(command, source);
        } catch (err) {
            return dialogs.getErrorMessage('Error while registering files for skipping updates', err);
        }
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

export async function skipWorkTree(folder: string, entry: string): Promise<void> {
    const gitApi = getGitAPI();
    if (gitApi) {
        await execute(`${gitApi.git.path} update-index --skip-worktree ${entry}`, folder);
    } else {
        dialogs.showErrorMessage('Cannot access Git support.');
    }
}

export function addGitIgnoreEntry(folder: string, entry: string) {
    entry = entry.replace(/\\/g, '/');
    const gitIgnore = path.join(folder, '.gitignore');
    if (fs.existsSync(gitIgnore)) {
        const content = fs.readFileSync(gitIgnore).toString();
        const lineEndRegExp = new RegExp('.*(\r?\n)');
        const match = lineEndRegExp.exec(content);
        const lineEnd = match && match[1] ? match[1] : getSystemLineEnd();
        const lines = content.length === 0 ? [] : content.split(lineEnd);
        for (const line of lines) {
            if (line.trim() === entry) {
                return;
            }
        }
        const trailingNewline = lines[lines.length - 1].length === 0;
        fs.writeFileSync(gitIgnore, (trailingNewline ? '' : lineEnd) + entry + (trailingNewline ? lineEnd : ''), { flag: 'a' });
    } else {
        fs.writeFileSync(gitIgnore, entry, { flag: 'w' });
    }
}

function getSystemLineEnd(): string {
    switch (process.platform) {
        case 'win32': return '\r\n';
        default: return '\n';
    }
}
