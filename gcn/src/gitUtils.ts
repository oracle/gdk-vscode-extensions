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
    const gitApi = getGitAPI();
    if (!gitApi) {
        return 'Cannot access Git support.';
    }
    try {
        const repository = await gitApi.init(vscode.Uri.file(source));
        if (!repository) {
            dialogs.showErrorMessage(`Cannot initialize Git repository for ${source}`);
            return undefined;
        }
        await repository.addRemote('origin', address);
        await repository.fetch();
        await repository.checkout('master');
        await execute(`${gitApi.git.path} add .`, source);
        await repository.commit('Initial commit from VS Code');
        await repository.push();
        if (forced && forced.length) {
            const files = forced.join(' ');
            await execute(`${gitApi.git.path} update-index --skip-worktree  ${files}`, source);
        }
    } catch (err) {
        return dialogs.getErrorMessage('Error while populating new repository', err);
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

export async function skipWorkTree(folder: string, entry: string) {
    const gitApi = getGitAPI();
    if (!gitApi) {
        return 'Cannot access Git support.';
    }
    await execute(`${gitApi.git.path} update-index --skip-worktree ${entry}`, folder);
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
