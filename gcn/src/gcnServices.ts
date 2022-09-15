/*
 * Copyright (c) 2022, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { CLOUD_SUPPORTS } from './extension';
import * as model from './model';
import * as folderStorage from './folderStorage';
import * as servicesView from './servicesView';
import * as projectUtils from './projectUtils';


export type FolderData = {
    folder: vscode.WorkspaceFolder;
    projectInfo?: projectUtils.ProjectInfo;
    configurations: model.ServicesConfiguration[];
    services: model.CloudServices[];
}

let folderData: FolderData[];

export async function build() {
    await vscode.commands.executeCommand('setContext', 'gcn.servicesInitialized', false);
    await vscode.commands.executeCommand('setContext', 'gcn.serviceFoldersCount', -1);

    await vscode.commands.executeCommand('setContext', 'gcn.globalDeployAction', false);

    folderData = [];
    await servicesView.build(folderData);

    let serviceFoldersCount = 0;
    let deployableFoldersCount = 0;

    const folders = vscode.workspace.workspaceFolders;
    if (folders) {
        for (const folder of folders) {
            const data: FolderData = {
                folder: folder,
                projectInfo: await projectUtils.getProjectInfo(folder),
                configurations: [],
                services: []
            };
            if (data.projectInfo) {
                deployableFoldersCount++;
            }
            const services = folderStorage.readStorage(folder);
            const configurations = services?.getConfigurations();
            if (configurations) {
                for (const configuration of configurations) {
                    const cloudSupport = getCloudSupport(configuration);
                    if (cloudSupport) {
                        const supportServices = cloudSupport.getServices(folder, configuration);
                        if (supportServices) {
                            if (data.configurations.length === 0) {
                                serviceFoldersCount++;
                            }
                            data.configurations.push(configuration);
                            data.services.push(supportServices);
                        }
                    }
                }
            }
            folderData.push(data);
        }
    }

    await servicesView.build(folderData);

    await vscode.commands.executeCommand('setContext', 'gcn.globalDeployAction', deployableFoldersCount - serviceFoldersCount > 1);

    await vscode.commands.executeCommand('setContext', 'gcn.deployableFoldersCount', deployableFoldersCount);
    await vscode.commands.executeCommand('setContext', 'gcn.serviceFoldersCount', serviceFoldersCount);
    await vscode.commands.executeCommand('setContext', 'gcn.servicesInitialized', true);
}

function getCloudSupport(configuration: model.ServicesConfiguration): model.CloudSupport | undefined {
    for (const cloudSupport of CLOUD_SUPPORTS) {
        if (cloudSupport.getType() === configuration.getType()) {
            return cloudSupport;
        }
    }
    return undefined;
}

export function getFolderData(): FolderData[] {
    return folderData;
}

export function findFolderData(folder: vscode.Uri): FolderData | undefined {
    for (const data of folderData) {
        // TODO: is there a more robust normalization in VS Code / Node.js?
        const f1 = normalize(folder.fsPath);
        const f2 = normalize(data.folder.uri.fsPath);
        if (f1 === f2) {
            return data;
        }
    }
    return undefined;
}

function normalize(fsPath: string): string {
    if (fsPath.endsWith(path.sep)) {
        fsPath = fsPath.slice(0, -1);
    }
    return fsPath;
}

export function folderDataToWorkspaceFolders(folderData: FolderData | FolderData[]): vscode.WorkspaceFolder | vscode.WorkspaceFolder[] {
    if (Array.isArray(folderData)) {
        const folders: vscode.WorkspaceFolder[] = [];
        for (const folder of folderData) {
            folders.push(folder.folder);
        }
        return folders;
    } else {
        return folderData.folder;
    }
}

// export function getCloudServices(type: string, folder: string | vscode.Uri): model.CloudServices[] | undefined {
//     const folderData = findFolderData(folder);
//     if (!folderData) {
//         return undefined;
//     }
//     const cloudServices: model.CloudServices[] = [];
//     for (let idx = 0; idx < folderData.configurations.length; idx++)
//     for (const configuration of folderData.configurations) {
//         if (configuration.getType() === type) {
//             cloudServices.push(folderData.services[idx]);
//         }
//     }
//     return cloudServices;
// }
