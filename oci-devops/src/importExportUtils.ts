/*
 * Copyright (c) 2022, 2024, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as devopsServices from './devopsServices';
import * as servicesView from './servicesView';
import * as dialogs from './dialogs';
import { showErrorMessage } from '../../common/lib/dialogs';
import * as folderStorage from './folderStorage';
import * as undeployUtils from './oci/undeployUtils'; // TODO: include into CloudSupport API?
import { DeployOptions } from './oci/deployUtils';
import { logError } from '../../common/lib/logUtils';


let importInProgress: boolean;
let importFoldersInProgress: boolean;
let deployInProgress: boolean;
let addInProgress: boolean;
let undeployInProgress: boolean;

export async function importDevopsProject(getFromExisting: boolean) {
    if (!anotherOperationInProgress()) {
        if (getFromExisting) {
            importFoldersInProgress = true;
            await servicesView.showWelcomeView('oci.devops.importFoldersInProgress');
        } else {
            importInProgress = true;
            await servicesView.showWelcomeView('oci.devops.importInProgress');
        }
        let folders;
        try {
            const cloudSupport = await dialogs.selectCloudSupport('Import OCI DevOps Project');
            if (!cloudSupport) {
                return;
            }

            const importResult = await cloudSupport.importFolders(getFromExisting);
            if (!importResult) {
                return;
            }

            folders = importResult.folders;
            const servicesData = importResult.servicesData;
            folderStorage.storeCloudSupportData(cloudSupport, folders, servicesData);
        } finally {
            if (getFromExisting) {
                await servicesView.hideWelcomeView('oci.devops.importFoldersInProgress');
                importFoldersInProgress = false;
            } else {
                await servicesView.hideWelcomeView('oci.devops.importInProgress');
                importInProgress = false;
            }
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

export async function deployFolders(workspaceState: vscode.Memento, addToExisting: boolean, folders?: devopsServices.FolderData | devopsServices.FolderData[], deployOptions? : DeployOptions) {
    if (!anotherOperationInProgress()) {
        if (!(await vscode.commands.getCommands()).includes('nbls.project.artifacts')) {
            vscode.window.showErrorMessage('Project inspection is not ready yet, please try again later.');
            return;
        }
        if (addToExisting) {
            addInProgress = true;
            await servicesView.showWelcomeView('oci.devops.addInProgress');
        } else {
            deployInProgress = true;
            await servicesView.showWelcomeView('oci.devops.deployInProgress');
        }
        const actionName = addToExisting ? 'Add Folder(s) to OCI DevOps Project' : 'Create OCI DevOps Project';
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
                    const selected = await dialogs.selectFolders(actionName, 'Select folders to add', false);
                    if (!selected) {
                        if (selected === null) {
                            vscode.window.showWarningMessage('All folders already added to an OCI DevOps project or no folders available.');
                        }
                        return;
                    }
                    folders = selected;
                }
            } else if (!Array.isArray(folders)) {
                folders = [ folders ];
            } else if (folders.length === 0) {
                showErrorMessage('No folders available.');
                return;
            }
            for (const folder of folders) {
                try {
                    await vscode.window.withProgress({
                        location: vscode.ProgressLocation.Notification,
                        title: `Inspecting folder ${folder.folder.name}...`,
                        cancellable: false
                    }, (_progress, _token) => {
                        return vscode.commands.executeCommand('nbls.project.artifacts', folder.folder.uri);
                    });
                    supportedFolders.push(folder);
                } catch (err) {
                    showErrorMessage(`Folder ${folder.folder.name} does not immediately contain a Java project, cannot create OCI DevOps project.`);
                }
            }
            if (!supportedFolders.length) {
                return;
            }
            const cloudSupport = await dialogs.selectCloudSupport('Create OCI DevOps Project');
            if (!cloudSupport) {
                return;
            }
            if ( !(deployOptions && deployOptions.autoConfirmDeploy) && !await dialogs.confirmDeployToOCI()) {
                return;
            }
            const workspaceFolders = devopsServices.folderDataToWorkspaceFolders(supportedFolders) as vscode.WorkspaceFolder[];
            const dump = devopsServices.dumpDeployData(workspaceState, workspaceFolders.map(f => f.name));
            try {
                const deployed = await cloudSupport.deployFolders(workspaceFolders, addToExisting, dump, deployOptions);
                if (deployed) {
                    await devopsServices.build(workspaceState);
                }
            } catch (err : any) {
                logError(`Error deploing: ${JSON.stringify(err)}`);
                throw err;
            } finally {
                if (dump(null)) {
                    await vscode.commands.executeCommand('setContext', 'oci.devops.deployFailed', true);
                    await devopsServices.build(workspaceState);
                } else {
                    await vscode.commands.executeCommand('setContext', 'oci.devops.deployFailed', false);
                }
            }
        } finally {
            if (addToExisting) {
                await servicesView.hideWelcomeView('oci.devops.addInProgress');
                addInProgress = false;
            } else {
                await servicesView.hideWelcomeView('oci.devops.deployInProgress');
                deployInProgress = false;
            }
        }
    }
}

export async function undeployFolders(workspaceState: vscode.Memento, folders?: devopsServices.FolderData | devopsServices.FolderData[], undeployOptions? : undeployUtils.UndeployOptions) {
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
            const selected = await dialogs.selectFolders('Delete Folder(s) from OCI DevOps Project', 'Select folders to delete', true, (undeployOptions && undeployOptions.autoSelectSingleFolder)  );
            if (!selected) {
                if (selected === null) {
                    vscode.window.showWarningMessage('No folders to delete.');
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
        vscode.window.showWarningMessage('Another OCI DevOps project is already being imported, try again later.');
        return true;
    }
    if (importFoldersInProgress) {
        vscode.window.showWarningMessage('Another folder is already being imported from OCI DevOps project, try again later.');
        return true;
    }
    if (deployInProgress) {
        vscode.window.showWarningMessage('Another OCI DevOps project is already being created, try again later.');
        return true;
    }
    if (addInProgress) {
        vscode.window.showWarningMessage('Another folder is already being added to OCI DevOps project, try again later.');
        return true;
    }
    if (undeployInProgress) {
        vscode.window.showWarningMessage('Another folder is already being deleted from OCI DevOps project, try again later.');
        return true;
    }
    return false;
}
