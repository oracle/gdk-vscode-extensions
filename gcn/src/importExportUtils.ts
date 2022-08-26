/*
 * Copyright (c) 2022, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as gcnServices from './gcnServices';
import * as dialogs from './dialogs';
import * as folderStorage from './folderStorage';


export async function importDevopsProject() {
    const cloudSupport = await dialogs.selectCloudSupport();
    if (!cloudSupport) {
        return;
    }

    const importResult = await cloudSupport.importFolders();
    if (!importResult) {
        return;
    }

    const folders = importResult.folders;
    const servicesData = importResult.servicesData;
    folderStorage.storeCloudSupportData(cloudSupport, folders, servicesData);

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

export async function deployFolders(folders?: gcnServices.FolderData | gcnServices.FolderData[]) {
    if (folders === undefined) {
        const selected = await dialogs.selectFolders('Select Folders to Deploy', false);
        if (!selected) {
            if (selected === null) {
                vscode.window.showErrorMessage('No folders to deploy.');
            }
            return;
        }
        folders = selected;
    } else if (!Array.isArray(folders)) {
        folders = [ folders ];
    } else if (folders.length === 0) {
        vscode.window.showErrorMessage('No folders to deploy.');
        return;
    }
    const cloudSupport = await dialogs.selectCloudSupport();
    if (!cloudSupport) {
        return;
    }
    const workspaceFolders = gcnServices.folderDataToWorkspaceFolders(folders) as vscode.WorkspaceFolder[];
    await cloudSupport.deployFolders(workspaceFolders);
    await gcnServices.build();
}
