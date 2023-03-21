/*
 * Copyright (c) 2022, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as devopsServices from './devopsServices';
import * as servicesView from './servicesView';
import * as dialogs from './dialogs';
import * as folderStorage from './folderStorage';
import * as undeployUtils from './oci/undeployUtils'; // TODO: include into CloudSupport API?


let importInProgress: boolean;
let deployInProgress: boolean;
let undeployInProgress: boolean;

export async function importDevopsProject() {
    if (!anotherOperationInProgress()) {
        importInProgress = true;
        await servicesView.showWelcomeView('oci.devops.importInProgress');
        let folders;
        try {
            const cloudSupport = await dialogs.selectCloudSupport('Import from OCI');
            if (!cloudSupport) {
                return;
            }

            const importResult = await cloudSupport.importFolders();
            if (!importResult) {
                return;
            }

            folders = importResult.folders;
            const servicesData = importResult.servicesData;
            folderStorage.storeCloudSupportData(cloudSupport, folders, servicesData);
        } finally {
            await servicesView.hideWelcomeView('oci.devops.importInProgress');
            importInProgress = false;
        }

        if (folders.length === 1 && !vscode.workspace.workspaceFolders) {
            vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(folders[0]), false);
        } else {
            const folderUris: { uri: vscode.Uri }[] = [];
            for (const folder of folders) {
                folderUris.push({ uri: vscode.Uri.file(folder) });
            }
            vscode.workspace.updateWorkspaceFolders(0, 0, ...folderUris);
        }
    }
}

export async function deployFolders(workspaceState: vscode.Memento, folders?: devopsServices.FolderData | devopsServices.FolderData[]) {
    if (!anotherOperationInProgress()) {
        if (!(await vscode.commands.getCommands()).includes('nbls.gcn.project.artifacts')) {
            vscode.window.showErrorMessage('Project inspection is not ready yet, please try again later.');
            return;
        }
        deployInProgress = true;
        await servicesView.showWelcomeView('oci.devops.deployInProgress');
        try {
            const supportedFolders: devopsServices.FolderData[] = [];
            if (folders === undefined) {
                const dumpedFolders = devopsServices.dumpedFolders(workspaceState);
                if (dumpedFolders) {
                    folders = [];
                    const folderData = await devopsServices.getFolderData();
                    for (let folder of folderData) {
                        if (dumpedFolders.includes(folder.folder.name)) {
                            folders.push(folder);
                        }
                    }
                } else {
                    const selected = await dialogs.selectFolders('Deploy to OCI', 'Select folders to deploy', false);
                    if (!selected) {
                        if (selected === null) {
                            vscode.window.showWarningMessage('All folders already deployed or no folders to deploy.');
                        }
                        return;
                    }
                    folders = selected;
                }
            } else if (!Array.isArray(folders)) {
                folders = [ folders ];
            } else if (folders.length === 0) {
                dialogs.showErrorMessage('No folders to deploy.');
                return;
            }
            for (const folder of folders) {
                try {
                    await vscode.window.withProgress({
                        location: vscode.ProgressLocation.Notification,
                        title: `Inspecting folder ${folder.folder.name}...`,
                        cancellable: false
                    }, (_progress, _token) => {
                        return vscode.commands.executeCommand('nbls.gcn.project.artifacts', folder.folder.uri);
                    });
                    supportedFolders.push(folder);
                } catch (err) {
                    dialogs.showErrorMessage(`Folder ${folder.folder.name} does not immediately contain a Java project, deploy to OCI not supported.`);
                }
            }
            if (!supportedFolders.length) {
                return;
            }
            const cloudSupport = await dialogs.selectCloudSupport('Deploy to OCI');
            if (!cloudSupport) {
                return;
            }
            if (!await dialogs.confirmDeployToOCI()) {
                return;
            }
            const workspaceFolders = devopsServices.folderDataToWorkspaceFolders(supportedFolders) as vscode.WorkspaceFolder[];
            const dump = devopsServices.dumpDeployData(workspaceState, workspaceFolders.map(f => f.name));
            try {
                const deployed = await cloudSupport.deployFolders(workspaceFolders, dump);
                if (deployed) {
                    await devopsServices.build(workspaceState);
                }
            } finally {
                if (dump(null)) {
                    await vscode.commands.executeCommand('setContext', 'oci.devops.deployFailed', true);
                    await devopsServices.build(workspaceState);
                } else {
                    await vscode.commands.executeCommand('setContext', 'oci.devops.deployFailed', false);
                }
            }
        } finally {
            await servicesView.hideWelcomeView('oci.devops.deployInProgress');
            deployInProgress = false;
        }
    }
}

export async function undeployFolders(workspaceState: vscode.Memento, folders?: devopsServices.FolderData | devopsServices.FolderData[]) {
    if (!anotherOperationInProgress()) {
        undeployInProgress = true;
        await servicesView.showWelcomeView('oci.devops.undeployInProgress');
        try {
            if (folders === undefined) {
                const dumpedFolders = devopsServices.dumpedFolders(workspaceState);
                if (dumpedFolders) {
                    folders = [];
                    const folderData = await devopsServices.getFolderData();
                    for (let folder of folderData) {
                        if (dumpedFolders.includes(folder.folder.name)) {
                            folders.push(folder);
                        }
                    }
                }
            }
            if (folders) {
                const dump = devopsServices.dumpDeployData(workspaceState, Array.isArray(folders) ? folders.map(f => f.folder.name) : folders.folder.name);
                const deployData = dump(null);
                if (deployData) {
                    try {
                        await undeployUtils.undeploy(Array.isArray(folders) ? folders : [ folders ], deployData, dump);
                    } finally {
                        if (dump(null)) {
                            await vscode.commands.executeCommand('setContext', 'oci.devops.deployFailed', true);
                        } else {
                            await vscode.commands.executeCommand('setContext', 'oci.devops.deployFailed', false);
                            await devopsServices.build(workspaceState);
                        }
                    }
                    return;
                }
            }
            const selected = await dialogs.selectFolders('Undeploy from OCI', 'Select folders to undeploy', true, false);
            if (!selected) {
                if (selected === null) {
                    vscode.window.showWarningMessage('No folders to undeploy.');
                }
                return;
            }
            await undeployUtils.undeployFolders(selected);
        } finally {
            await servicesView.hideWelcomeView('oci.devops.undeployInProgress');
            undeployInProgress = false;
        }
        await devopsServices.build(workspaceState);
    }
}

function anotherOperationInProgress(): boolean {
    if (importInProgress) {
        vscode.window.showWarningMessage('Another import is already in progress, try again later.');
        return true;
    }
    if (deployInProgress) {
        vscode.window.showWarningMessage('Another folder is already being deployed, try again later.');
        return true;
    }
    if (undeployInProgress) {
        vscode.window.showWarningMessage('Another folder is already being undeployed, try again later.');
        return true;
    }
    return false;
}
