/*
 * Copyright (c) 2022, 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as devopsServices from './devopsServices';
import * as model from './model';
import * as persistenceUtils from './persistenceUtils';
import { CLOUD_SUPPORTS } from './extension';
import { QuickPickObject } from '../../common/lib/dialogs';

export async function selectName(title: string, currentName: string | undefined, forbiddenNames?: string[]): Promise<string | undefined> {
	if (!forbiddenNames) {
        forbiddenNames = [];
    }
    function validateName(name: string): string | undefined {
        if (!name || name.length === 0) {
            return 'Name cannot be empty.';
        }
        if (forbiddenNames?.indexOf(name) !== -1) {
            return 'Name already used.';
        }
        return undefined;
    }
    const selected = await vscode.window.showInputBox({
        title: title,
        value: currentName,
        validateInput: input => validateName(input)
    });
    return selected;
}

export async function showSaveFileDialog(title: string, filename?: string, lastdirKey?: string): Promise<vscode.Uri | undefined> {
	let defaultPath: string | undefined;
	if (lastdirKey) {
		const lastdir: string | undefined = persistenceUtils.getWorkspaceObject(lastdirKey);
		if (lastdir) {
			defaultPath = lastdir;
		}
	}
	if (!defaultPath) {
		defaultPath = require('os').homedir();
	}
	if (filename) {
		defaultPath = defaultPath ? path.join(defaultPath, filename) : filename;
	}
	const selected = await vscode.window.showSaveDialog({
		defaultUri: defaultPath ? vscode.Uri.file(defaultPath) : undefined,
		title: title
	});
	if (selected && lastdirKey) {
		const selectedPath = selected.fsPath;
		await persistenceUtils.setWorkspaceObject(lastdirKey, path.dirname((selectedPath)));
	}
	return selected;
}

export async function selectDirectory(options?: string[], actionName?: string, title: string = 'Select Directory', openLabel: string | undefined = 'Select'): Promise<string | undefined> {
    async function selectUsingDialog(): Promise<string | undefined> {
		const target = await vscode.window.showOpenDialog({
			canSelectFiles: false,
			canSelectFolders: true,
			canSelectMany: false,
			title: actionName ? `${actionName}: ${title}` : title,
			openLabel: openLabel
		});
		return target && target.length === 1 ? target[0].fsPath : undefined;
	}
	if (!options || !options.length) {
		return selectUsingDialog();
	}
	const choices: QuickPickObject[] = [];
	for (const option of options) {
		const choice = new QuickPickObject(option, undefined, undefined, option);
		choices.push(choice);
	}
	const choice = new QuickPickObject('Select Other...', undefined, undefined, selectUsingDialog);
	choices.push(choice);

	const selected = await vscode.window.showQuickPick(choices, {
        title: actionName ? `${actionName}: ${title}` : title,
        placeHolder: 'Select directory'
    });

    if (selected) {
        if (typeof selected.object === 'function') {
            return await selected.object();
        } else {
            return selected.object;
        }
    }
    return undefined;
}

export async function selectFolder(actionName: string | undefined = undefined, hint: string | undefined = undefined, serviceFolder: boolean | null = true): Promise<devopsServices.FolderData | null | undefined> {
    const choices: QuickPickObject[] = [];
    const folderData = await devopsServices.getFolderData();
    for (const folder of folderData) {
        if (serviceFolder === null || serviceFolder && folder.services.length > 0 || !serviceFolder && folder.services.length === 0) {
            const choice = new QuickPickObject(folder.folder.name, undefined, undefined, folder);
            choices.push(choice);
        }
    }
    if (choices.length === 0) {
        return null;
    }
    if (choices.length === 1) {
        return choices[0].object;
    }
    const selection = await vscode.window.showQuickPick(choices, {
		title: actionName ? `${actionName}: Select Folder` : 'Select Folder',
        placeHolder: hint ? hint : 'Select folder'
    });
    return selection?.object;
}

export async function selectFolders(actionName: string | undefined = undefined, hint: string | undefined = undefined, serviceFolders: boolean = true, autoSelectSingle: boolean = true): Promise<devopsServices.FolderData[] | null | undefined> {
    const choices: QuickPickObject[] = [];
    const folderData = await devopsServices.getFolderData();
    for (const folder of folderData) {
        if (serviceFolders && folder.services.length > 0 || !serviceFolders && folder.services.length === 0) {
            const choice = new QuickPickObject(folder.folder.name, undefined, undefined, folder);
            choices.push(choice);
        }
    }
    if (choices.length === 0) {
        return null;
    }
    if (autoSelectSingle && choices.length === 1) {
        return [ choices[0].object ];
    }
    const selection = await vscode.window.showQuickPick(choices, {
		title: actionName ? `${actionName}: Select Folders` : 'Select Folders',
        placeHolder: hint ? hint : 'Select folders',
        canPickMany: true
    });
    if (selection && selection.length > 0) {
        const folders: devopsServices.FolderData[] = [];
        for (const folder of selection) {
            folders.push(folder.object);
        }
        return folders;
    }
    return undefined;
}

export async function selectServices(folder: devopsServices.FolderData, actionName?: string): Promise<model.CloudServices | undefined> {
    const services = folder.services;
    if (services.length === 0) {
        return undefined;
    }
    if (services.length === 1) {
        return services[0];
    }
    const choices: QuickPickObject[] = [];
    for (let i = 0; i < services.length; i++) {
        const service = services[i];
        const configuration = folder.configurations[i];
        const choice = new QuickPickObject(configuration.getName(), undefined, undefined, service);
        choices.push(choice);
    }
    const selection = await vscode.window.showQuickPick(choices, {
		title: actionName ? `${actionName}: Select Cloud Context` : 'Select Cloud Context',
        placeHolder: 'Select cloud context'
    });
    return selection?.object;
}

export async function selectCloudSupport(actionName?: string): Promise<model.CloudSupport | undefined> {
    if (CLOUD_SUPPORTS.length === 1) {
        return CLOUD_SUPPORTS[0];
    }
    const choices: QuickPickObject[] = [];
    for (const cloudSupport of CLOUD_SUPPORTS) {
        const choice = new QuickPickObject(cloudSupport.getName(), undefined, cloudSupport.getDescription(), cloudSupport);
        choices.push(choice);
    }
    const selection = await vscode.window.showQuickPick(choices, {
        title: actionName ? `${actionName}: Select Cloud Service` : 'Select Cloud Service',
        placeHolder: 'Select cloud service'
    });
    return selection?.object;
}

const PUSH_SOURCES_TO_OCI_CONFIRMATION = 'pushLocalSourcesToOciConfirmedPermanently';

function isConfirmDeployToOCI(): boolean {
	return persistenceUtils.getWorkspaceConfiguration().get<boolean>(PUSH_SOURCES_TO_OCI_CONFIRMATION, false) === true;
}

export async function confirmDeployToOCI(): Promise<boolean> {
	if (isConfirmDeployToOCI()){
		return true;
	}
	const confirm = 'Confirm';
	const confirmPermanently = 'Confirm Permanently';
	const cancel = 'Cancel';
	const msg = 'Local sources will be pushed to a remote OCI code repository. Read [the documentation](https://www.graal.cloud/gcn/get-started/setting-oci-devops-pipeline-in-vscode/#6-deploy-to-oci) for more details. Confirm to proceed:';
	const choice = await vscode.window.showInformationMessage(msg, confirm, confirmPermanently, cancel);
	if (!choice || choice === cancel) {
		return false;
	}
	if (choice === confirmPermanently) {
		persistenceUtils.getWorkspaceConfiguration().update(PUSH_SOURCES_TO_OCI_CONFIRMATION, true, vscode.ConfigurationTarget.Global);
	}
	return true;
}

const BUILD_PIPELINE_CUSTOM_SHAPE_CONFIRMATION = 'startBuildPipelineUsingCustomShapeConfirmedPermanently';

export function isRunBuildPipelineCustomShapeConfirmedPermanently(): boolean {
	return persistenceUtils.getWorkspaceConfiguration().get<boolean>(BUILD_PIPELINE_CUSTOM_SHAPE_CONFIRMATION, false) === true;
}

export async function confirmRunBuildPipelineCustomShape(): Promise<boolean> {
	const confirm = 'Confirm';
	const confirmPermanently = 'Confirm Permanently';
	const cancel = 'Cancel';
	const msg = 'This pipeline uses a custom build runner shape and running it may impose additional costs. Confirm to proceed:';
	const choice = await vscode.window.showInformationMessage(msg, confirm, confirmPermanently, cancel);
	if (!choice || choice === cancel) {
		return false;
	}
	if (choice === confirmPermanently) {
		persistenceUtils.getWorkspaceConfiguration().update(BUILD_PIPELINE_CUSTOM_SHAPE_CONFIRMATION, true, vscode.ConfigurationTarget.Global);
	}
	return true;
}