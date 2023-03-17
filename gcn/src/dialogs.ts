/*
 * Copyright (c) 2022, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as gcnServices from './gcnServices';
import * as model from './model';
import * as logUtils from './logUtils';
import * as persistenceUtils from './persistenceUtils';
import { CLOUD_SUPPORTS } from './extension';


const GCN_TERMINAL = 'Graal Cloud Native';

export function getGCNTerminal(): vscode.Terminal {
    let terminal = vscode.window.terminals.find(t => t.name === GCN_TERMINAL);
    if (!terminal) {
        terminal = vscode.window.createTerminal({ name: GCN_TERMINAL });
    }
    return terminal;
}

export async function openInBrowser(address: string): Promise<boolean> {
	return vscode.env.openExternal(vscode.Uri.parse(address));
}

export function getErrorMessage(message: string | undefined, err?: any): string {
	if (err) {   
        if (err.message) {
            message = message ? `${message}: ${err.message}` : err.message;
        } else if (err.toString()) {
            message = message ? `${message}: ${err.toString()}` : err.toString();
        }
    }
	if (!message) {
		message = 'Unknown error.'
	} else if (!message.endsWith('.')) {
        message = `${message}.`;
    }
    return message;
}

export function showErrorMessage(message: string | undefined, err?: any, ...items: string[]): Thenable<string | undefined> {
    const msg = getErrorMessage(message, err);
	logUtils.logError(msg);
    return vscode.window.showErrorMessage(msg, ...items);
}

export function showError(err?: any, ...items: string[]): Thenable<string | undefined> {
	return showErrorMessage(undefined, err, ...items);
}

export async function selectName(title: string, currentName: string | undefined, forbiddenNames?: string[]): Promise<string | undefined> {
	if (!forbiddenNames) {
        forbiddenNames = [];
    }
    function validateName(name: string): string | undefined {
        if (!name || name.length === 0) {
            return 'Name cannot be empty.'
        }
        if (forbiddenNames?.indexOf(name) !== -1) {
            return 'Name already used.'
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

export async function selectFolder(actionName: string | undefined = undefined, hint: string | undefined = undefined, serviceFolder: boolean | null = true): Promise<gcnServices.FolderData | null | undefined> {
    const choices: QuickPickObject[] = [];
    const folderData = await gcnServices.getFolderData();
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
    })
    return selection?.object;
}

export async function selectFolders(actionName: string | undefined = undefined, hint: string | undefined = undefined, serviceFolders: boolean = true, autoSelectSingle: boolean = true): Promise<gcnServices.FolderData[] | null | undefined> {
    const choices: QuickPickObject[] = [];
    const folderData = await gcnServices.getFolderData();
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
        const folders: gcnServices.FolderData[] = [];
        for (const folder of selection) {
            folders.push(folder.object);
        }
        return folders;
    }
    return undefined;
}

export async function selectServices(folder: gcnServices.FolderData, actionName?: string): Promise<model.CloudServices | undefined> {
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
    })
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
    })
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
	const msg = 'Local sources will be pushed to a remote OCI code repository. Read [the documentation](https://graal-cloud-staging.us.oracle.com/getting-started/setting-oci-devops-pipeline-in-vscode/#6-deploy-to-oci) for more details. Confirm to proceed:';
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

export class QuickPickObject implements vscode.QuickPickItem {
    constructor(
        public readonly label: string,
        public readonly description : string | undefined,
        public readonly detail: string | undefined,
        public readonly object?: any
    ) {}
	static separator(label: string): QuickPickObject {
		const separator = new QuickPickObject(label, undefined, undefined);
		(separator as vscode.QuickPickItem).kind = vscode.QuickPickItemKind.Separator
		return separator;
	}
}

export function sortQuickPickObjectsByName(objects: QuickPickObject[]) {
	objects.sort((o1, o2) => o1.label.localeCompare(o2.label));
}

export interface QuickPickParameters<T extends vscode.QuickPickItem> {
	title: string;
	step: number;
	totalSteps: number;
	items: T[];
	activeItems?: T | T[];
	placeholder: string;
	canSelectMany?: boolean;
	buttons?: vscode.QuickInputButton[];
	shouldResume: () => Thenable<boolean>;
}

export interface InputBoxParameters {
	title: string;
	step: number;
	totalSteps: number;
	value: string;
	prompt: string;
	validate: (value: string) => Promise<string | undefined>;
	buttons?: vscode.QuickInputButton[];
	shouldResume: () => Thenable<boolean>;
}

export type InputStep = (input: MultiStepInput) => Thenable<InputStep | void>;

class InputFlowAction {
	static back = new InputFlowAction();
	static cancel = new InputFlowAction();
	static resume = new InputFlowAction();
}

export class MultiStepInput {

	static async run(start: InputStep) {
		const input = new MultiStepInput();
		return input.stepThrough(start);
	}

	private current?: vscode.QuickInput;
	private steps: InputStep[] = [];

	private async stepThrough(start: InputStep) : Promise<boolean> {
		let step: InputStep | void = start;
		let ok : boolean = false;
		while (step) {
			ok = false;
			this.steps.push(step);
			if (this.current) {
				this.current.enabled = false;
				this.current.busy = true;
			}
			try {
				step = await step(this);
				ok = true;
			} catch (err) {
				if (err === InputFlowAction.back) {
					this.steps.pop();
					step = this.steps.pop();
				} else if (err === InputFlowAction.resume) {
					step = this.steps.pop();
				} else if (err === InputFlowAction.cancel) {
					step = undefined;
				} else {
					throw err;
				}
			}
		}
		if (this.current) {
			this.current.dispose();
		}
		return ok;
	}

	async showQuickPick<T extends vscode.QuickPickItem, P extends QuickPickParameters<T>>({ title, step, totalSteps, items, activeItems, placeholder, canSelectMany, buttons, shouldResume }: P) {
		const disposables: vscode.Disposable[] = [];
		try {
			return await new Promise<T | readonly T[] | (P extends { buttons: (infer I)[] } ? I : never)>((resolve, reject) => {
				const input = vscode.window.createQuickPick<T>();
				input.title = title;
				input.step = step;
				input.totalSteps = totalSteps;
				input.placeholder = placeholder;
				input.items = items;
				if (canSelectMany) {
					input.canSelectMany = canSelectMany;
					if (activeItems) {
						input.selectedItems = Array.isArray(activeItems) ? activeItems : [activeItems];
					}
				} else if (activeItems) {
					input.activeItems = Array.isArray(activeItems) ? activeItems : [activeItems];
				}
				input.buttons = [
					...(this.steps.length > 1 ? [vscode.QuickInputButtons.Back] : []),
					...(buttons || [])
				];
				input.ignoreFocusOut = true;
				disposables.push(
					input.onDidTriggerButton(item => {
						if (item === vscode.QuickInputButtons.Back) {
							reject(InputFlowAction.back);
						} else {
							resolve(<any>item);
						}
					}),
					input.onDidAccept(() => {
						if (canSelectMany) {
							resolve(input.selectedItems);
						 } else {
							if (input?.selectedItems[0]) {
								resolve(input.selectedItems[0]);
							}
						 }
					}),
					input.onDidHide(() => {
						(async () => {
							reject(shouldResume && await shouldResume() ? InputFlowAction.resume : InputFlowAction.cancel);
						})()
							.catch(reject);
					})
				);
				if (this.current) {
					this.current.dispose();
				}
				this.current = input;
				this.current.show();
			});
		} finally {
			disposables.forEach(d => d.dispose());
		}
	}

	async showInputBox<P extends InputBoxParameters>({ title, step, totalSteps, value, prompt, validate, buttons, shouldResume }: P) {
		const disposables: vscode.Disposable[] = [];
		try {
			return await new Promise<string | (P extends { buttons: (infer I)[] } ? I : never)>((resolve, reject) => {
				const input = vscode.window.createInputBox();
				input.title = title;
				input.step = step;
				input.totalSteps = totalSteps;
				input.value = value || '';
				input.prompt = prompt;
				input.buttons = [
					...(this.steps.length > 1 ? [vscode.QuickInputButtons.Back] : []),
					...(buttons || [])
				];
				input.ignoreFocusOut = true;
				let validating = validate('');
				disposables.push(
					input.onDidTriggerButton(item => {
						if (item === vscode.QuickInputButtons.Back) {
							reject(InputFlowAction.back);
						} else {
							resolve(<any>item);
						}
					}),
					input.onDidAccept(async () => {
						const value = input.value;
						input.enabled = false;
						input.busy = true;
						if (!(await validate(value))) {
							resolve(value);
						}
						input.enabled = true;
						input.busy = false;
					}),
					input.onDidChangeValue(async text => {
						const current = validate(text);
						validating = current;
						const validationMessage = await current;
						if (current === validating) {
							input.validationMessage = validationMessage;
						}
					}),
					input.onDidHide(() => {
						(async () => {
							reject(shouldResume && await shouldResume() ? InputFlowAction.resume : InputFlowAction.cancel);
						})()
							.catch(reject);
					})
				);
				if (this.current) {
					this.current.dispose();
				}
				this.current = input;
				this.current.show();
			});
		} finally {
			disposables.forEach(d => d.dispose());
		}
	}
}
