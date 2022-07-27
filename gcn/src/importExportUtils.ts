/*
 * Copyright (c) 2022, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import { CLOUD_SUPPORTS } from './extension';
import * as model from './model';
import * as folderStorage from './folderStorage';

export async function importDevopsProject() {
    const cloudSupport = await selectCloudSupport();
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

export async function deployOpenedFolders() {
    const cloudSupport = await selectCloudSupport();
    if (!cloudSupport) {
        return;
    }

    await cloudSupport.deployFolders();

    vscode.commands.executeCommand('extension.gcn.reloadServicesView');
}

export async function undeploySelectedFolder(folder : vscode.WorkspaceFolder)  {
    const cloudSupport = await selectCloudSupport();
    if (!cloudSupport) {
        return;
    }
    return cloudSupport.undeployFolder(folder.uri);
}

async function selectCloudSupport(): Promise<model.CloudSupport | undefined> {
    if (CLOUD_SUPPORTS.length === 1) {
        return CLOUD_SUPPORTS[0];
    }
    const choices: QuickPickObject[] = [];
    for (const cloudSupport of CLOUD_SUPPORTS) {
        const choice = new QuickPickObject(cloudSupport.getName(), undefined, cloudSupport.getDescription(), cloudSupport);
        choices.push(choice);
    }
    const selection = await vscode.window.showQuickPick(choices, {
        placeHolder: 'Select Cloud Service'
    })
    return selection?.object;
}

class QuickPickObject implements vscode.QuickPickItem {
    constructor(
        public readonly label: string,
        public readonly description : string | undefined,
        public readonly detail: string | undefined,
        public readonly object?: any,
    ) {}
}