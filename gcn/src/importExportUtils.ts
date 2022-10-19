/*
 * Copyright (c) 2022, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as gcnServices from './gcnServices';
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
        await servicesView.showWelcomeView('gcn.importInProgress');
        let folders;
        try {
            const cloudSupport = await dialogs.selectCloudSupport();
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
            await servicesView.hideWelcomeView('gcn.importInProgress');
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

export async function deployFolders(workspaceState: vscode.Memento, folders?: gcnServices.FolderData | gcnServices.FolderData[]) {
    if (!anotherOperationInProgress()) {
        deployInProgress = true;
        await servicesView.showWelcomeView('gcn.deployInProgress');
        const dump = gcnServices.dumpDeployData(workspaceState);
        try {
            const deployData = dump(null) || {};
            if (deployData?.folders) {
                folders = [];
                for (let folder of gcnServices.getFolderData()) {
                    if (deployData.folders.includes(folder.folder.name)) {
                        folders.push(folder);
                    }
                }
            } else if (folders === undefined) {
                const selected = await dialogs.selectFolders('Select Folders to Deploy', false);
                if (!selected) {
                    if (selected === null) {
                        dialogs.showErrorMessage('No folders to deploy.');
                    }
                    return;
                }
                folders = selected;
            } else if (!Array.isArray(folders)) {
                folders = [ folders ];
            } else if (folders.length === 0) {
                dialogs.showErrorMessage('No folders to deploy.');
                return;
            }
            const cloudSupport = await dialogs.selectCloudSupport();
            if (!cloudSupport) {
                return;
            }
            const workspaceFolders = gcnServices.folderDataToWorkspaceFolders(folders) as vscode.WorkspaceFolder[];
            deployData.folders = workspaceFolders.map(folder => folder.name);
            dump(deployData);
            await cloudSupport.deployFolders(workspaceFolders, dump);
        } finally {
            await servicesView.hideWelcomeView('gcn.deployInProgress');
            if (dump(null)) {
                await servicesView.showWelcomeView('gcn.deployFailed');
            } else {
                await servicesView.hideWelcomeView('gcn.deployFailed');
            }
            deployInProgress = false;
        }
        await gcnServices.build(workspaceState);
    }
}

export async function undeployFolders(workspaceState: vscode.Memento) {
    if (!anotherOperationInProgress()) {
        undeployInProgress = true;
        await servicesView.showWelcomeView('gcn.undeployInProgress');
        const dump = gcnServices.dumpDeployData(workspaceState);
        try {
            const deployData = dump(null);
            if (deployData) {
                const folders = [];
                for (let folder of gcnServices.getFolderData()) {
                    if (deployData.folders.includes(folder.folder.name)) {
                        folders.push(folder);
                    }
                }
                await undeployUtils.undeploy(folders, deployData, dump);
            } else {
                const selected = await dialogs.selectFolders('Select Folders to Undeploy', true, false);
                if (!selected) {
                    if (selected === null) {
                        vscode.window.showErrorMessage('No folders to undeploy.');
                    }
                    return;
                }
                await undeployUtils.undeployFolders(selected);
            }
        } finally {
            await servicesView.hideWelcomeView('gcn.undeployInProgress');
            if (dump(null)) {
                await servicesView.showWelcomeView('gcn.deployFailed');
            } else {
                await servicesView.hideWelcomeView('gcn.deployFailed');
            }
            undeployInProgress = false;
        }
        await gcnServices.build(workspaceState);
    }
}

function anotherOperationInProgress(): boolean {
    if (importInProgress) {
        vscode.window.showWarningMessage('Another import is already in progress, try again later.')
        return true;
    }
    if (deployInProgress) {
        vscode.window.showWarningMessage('Another devops project is already being created, try again later.')
        return true;
    }
    if (undeployInProgress) {
        vscode.window.showWarningMessage('Another devops project is already being deleted, try again later.')
        return true;
    }
    return false;
}
