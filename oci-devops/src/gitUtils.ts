/*
 * Copyright (c) 2022, 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as dialogs from '../../common/lib/dialogs';
import * as logUtils from '../../common/lib/logUtils';

function getGitAPI() {
    return vscode.extensions.getExtension('vscode.git')?.exports.getAPI(1);
}

function getPath(): string | undefined {
    let path: string | undefined = getGitAPI()?.git.path;
    if (path?.includes(' ')) {
       path = `"${path}"`;
    }
    return path;
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
    logUtils.logInfo(`[git] Clone repository ${address} to ${target}`);
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

/**
 * Close the internal Git Repository object. When the .git directory is deleted, vscode git extension's
 * model is still cached and active; susbequent attempts to reinitialize Git for the project would fail. 
 * This function will close the internal model and evict it from the git extension's cache. It uses
 * an undocumented hack - git extension registers internal commands working against model objects,
 * which must be unwrapped from the API wrappers.
 * @param target target directory (the parent of .git dir)
 * @param silent true to not report any errors
 * @returns true, if close was successful.
 */
export async function closeRepository(target : vscode.Uri, silent : boolean = true) : Promise<boolean | undefined> {
    logUtils.logInfo(`[git] Checking existing repository for ${target.fsPath}`);
    const gitApi = getGitAPI();
    if (!gitApi) {
        if (!silent) {
            dialogs.showErrorMessage('Cannot access Git support.');
        }
        return undefined;
    }
    if (gitApi.state === 'uninitialized') {
        if (!silent) {
            dialogs.showErrorMessage('Git support has not been initialized yet.');
        }
        return undefined;
    }
    const repository = gitApi.getRepository(target);
    if (repository != null) {
        logUtils.logInfo(`[git] Closing repository for ${target.fsPath}`);
        try {
            // must unwrap the internal model from the API facade.
            await vscode.commands.executeCommand('git.close', repository['repository']);
            logUtils.logInfo(`[git] Repository closed for ${target.fsPath}`)
            return true;
        } catch (err : any) {
            // just in the case, shouldn't fail anyway but if it does, we do not want to fail the undeploy operation.
            logUtils.logError(`[git] Error closing repository at ${target.fsPath}: ${err?.message}`);
            return false;
        }
    }
    return true;
}

export function getHEAD(target: vscode.Uri, silent?: boolean): { name?: string; commit?: string; upstream?: object } | undefined {
    logUtils.logInfo(`[git] Get head of ${target.fsPath}`);
    const gitApi = getGitAPI();
    if (!gitApi) {
        if (!silent) {
            dialogs.showErrorMessage('Cannot access Git support.');
        }
        return undefined;
    }
    if (gitApi.state === 'uninitialized') {
        if (!silent) {
            dialogs.showErrorMessage('Git support has not been initialized yet.');
        }
        return undefined;
    }
    const repository = gitApi.getRepository(target);


    if (!repository) {
        if (!silent) {
            dialogs.showErrorMessage(`Cannot find Git repository for ${target}`);
        }
        return undefined;
    }
    return repository.state.HEAD;
}

export function locallyModified(target: vscode.Uri): boolean | undefined {
    logUtils.logInfo(`[git] Check locally modified ${target.fsPath}`);
    const gitApi = getGitAPI();
    if (!gitApi) {
        dialogs.showErrorMessage('Cannot access Git support.');
        return undefined;
    }
    if (gitApi.state === 'uninitialized') {
        dialogs.showErrorMessage('Git support has not been initialized yet.');
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
    logUtils.logInfo(`[git] Push local branch ${target.fsPath}`);
    const gitApi = getGitAPI();
    if (!gitApi) {
        dialogs.showErrorMessage('Cannot access Git support.');
        return undefined;
    }
    if (gitApi.state === 'uninitialized') {
        dialogs.showErrorMessage('Git support has not been initialized yet.');
        return undefined;
    }
    const repository = gitApi.getRepository(target);
    if (!repository) {
        dialogs.showErrorMessage(`Cannot find Git repository for ${target}`);
        return undefined;
    }
    try {
        logUtils.logInfo(`[git] Execute git.publish ${repository}`);
        await vscode.commands.executeCommand('git.publish', [repository]);
        return true;
    } catch (err) {
        dialogs.showErrorMessage('Error while pushing a branch', err);
        return false;
    }
}

export async function populateNewRepository(address: string, source: string, folderData: any, user: () => Promise<any>, ...skipWorkTree: string[]): Promise<string | undefined> {
    logUtils.logInfo(`[git] Populate new repository ${address} from ${source}`);
    const gitPath = getPath();
    if (!gitPath) {
        return dialogs.getErrorMessage('Cannot access Git support.');
    }
    if (!folderData.git) {
        try {
            const command = `${gitPath} init`;
            await execute(command, source);
        } catch (err) {
            return dialogs.getErrorMessage('Error while initializing repository', err);
        }
        folderData.git = {};
    }
    if (!folderData.git.userName) {
        try {
            const command = `${gitPath} config user.name`;
            await execute(command, source);
        } catch (err) {
            try {
                const userName = (await user()).name;
                const command = `${gitPath} config user.name "${userName}"`;
                await execute(command, source);
            } catch (err) {
                return dialogs.getErrorMessage('Error while configuring user.name', err);
            }
        }
    }
    if (!folderData.git.userEmail) {
        try {
            const command = `${gitPath} config user.email`;
            await execute(command, source);
        } catch (err) {
            try {
                const userEmail = (await user()).email.toLowerCase();
                const command = `${gitPath} config user.email "${userEmail}"`;
                await execute(command, source);
            } catch (err) {
                return dialogs.getErrorMessage('Error while configuring user.email', err);
            }
        }
    }
    if (address !== folderData.git.remote) {
        try {
            const command = `${gitPath} remote add origin ${address}`;
            await execute(command, source);
        } catch (err) {
            return dialogs.getErrorMessage('Error while adding remote repository url', err);
        }
        folderData.git.remote = address;
    }
    const forcedFiles = skipWorkTree && skipWorkTree.length > 0 ? skipWorkTree.join(' ') : undefined;
    if (!folderData.git.committed) {
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
        if (forcedFiles) {
            try {
                const command = `${gitPath} add -f ${forcedFiles}`;
                await execute(command, source);
            } catch (err) {
                return dialogs.getErrorMessage('Error while adding forced sources', err);
            }
        }
        try {
            const command = `${gitPath} commit -m "Initial commit from VS Code"`;
            await execute(command, source);
        } catch (err) {
            return dialogs.getErrorMessage('Error while commiting changes', err);
        }
        folderData.git.committed = true;
    }
    if (!folderData.git.pushed) {
        try {
            const command = `${gitPath} push`;
            await execute(command, source);
        } catch (err) {
            return dialogs.getErrorMessage('Error while pushing lacal changes to remote repository', err);
        }
        folderData.git.pushed = true;
    }
    if (forcedFiles && forcedFiles !== folderData.git.forcedFiles) {
        try {
            const command = `${gitPath} update-index --skip-worktree ${forcedFiles}`;
            await execute(command, source);
        } catch (err) {
            return dialogs.getErrorMessage('Error while registering files for skipping updates', err);
        }
        folderData.git.forcedFiles = forcedFiles;
    }
    return undefined;
}

export async function skipWorkTree(folder: string, entry: string): Promise<void> {
    logUtils.logInfo(`[git] Skip work tree of ${entry} in ${folder}`);
    const gitPath = getPath();
    if (!gitPath) {
        dialogs.showErrorMessage('Cannot access Git support.');
        return;
    }
    try {
        const command = `${gitPath} update-index --skip-worktree ${entry}`;
        await execute(command, folder);
    } catch (err) {
        const msg = dialogs.getErrorMessage(`Failed to skip work tree of  ${entry}`, err);
        logUtils.logWarning(`[git] ${msg}`);
        vscode.window.showWarningMessage(msg);
    }
}

async function execute(command: string, cwd: string): Promise<string> {
    logUtils.logInfo(`[git] ${cwd}>${command}`);
    return new Promise<string>((resolve, reject) => {
        cp.exec(command, { cwd: cwd }, (error, stdout, _stderr) => {
            if (error) {
                reject(error ?? new Error(_stderr));
            } else {
                resolve(stdout);
            }
        });
    });
}

export function addGitIgnoreEntry(folder: string, entry: string) {
    const gitIgnore = path.join(folder, '.gitignore');    
    logUtils.logInfo(`[git] Add '${entry}' to ${gitIgnore}`);
    entry = entry.replace(/\\/g, '/');
    if (fs.existsSync(gitIgnore)) {
        const content = fs.readFileSync(gitIgnore).toString();
        const lineEndRegExp = new RegExp('.*(\r?\n)');
        const match = lineEndRegExp.exec(content);
        const lineEnd = match && match[1] ? match[1] : getSystemLineEnd();
        const lines = content.length === 0 ? [] : content.split(lineEnd);
        for (const line of lines) {
            if (line.trim() === entry) {
                logUtils.logInfo(`[git] '${entry}' already present in ${gitIgnore}`);
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
