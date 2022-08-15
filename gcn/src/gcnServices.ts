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
import * as servicesView from './servicesView';


export type FolderData = {
    folder: vscode.WorkspaceFolder;
    configurations: model.ServicesConfiguration[];
    services: model.CloudServices[];
}

let folderData: FolderData[];

export async function build() {
    await vscode.commands.executeCommand('setContext', 'gcn.servicesInitialized', false);
    await vscode.commands.executeCommand('setContext', 'gcn.serviceFoldersCount', -1);

    folderData = [];
    await servicesView.build(folderData);

    const folders = vscode.workspace.workspaceFolders;
    if (folders) {
        for (const folder of folders) {
            let data: FolderData | undefined = undefined;
            const services = folderStorage.readStorage(folder);
            const configurations = services?.getConfigurations();
            if (configurations) {
                for (const configuration of configurations) {
                    const cloudSupport = getCloudSupport(configuration);
                    if (cloudSupport) {
                        const supportServices = cloudSupport.getServices(folder, configuration);
                        if (supportServices) {
                            if (data === undefined) {
                                data = {
                                    folder: folder,
                                    configurations: [],
                                    services: []
                                };
                                folderData.push(data);
                            }
                            data.configurations.push(configuration);
                            data.services.push(supportServices);
                        }
                    }
                }
            }
        }
    }

    await servicesView.build(folderData);

    await vscode.commands.executeCommand('setContext', 'gcn.serviceFoldersCount', folderData.length);
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

export function findFolderData(folder: string | vscode.Uri): FolderData | undefined {
    if (typeof folder === 'string') {
        folder = vscode.Uri.file(folder);
    }
    const path = (folder as vscode.Uri).fsPath;
    for (const data of folderData) {
        if (path === data.folder.uri.fsPath) { // TODO: is this the right comparison?
            return data;
        }
    }
    return undefined;
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
