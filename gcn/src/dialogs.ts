/*
 * Copyright (c) 2022, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as gcnServices from './gcnServices';
import * as model from './model';
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

export function getErrorMessage(message: string, err: any): string {
    if (err) {   
        if (err.message) {
            message = `${message}: ${err.message}`;
        } else if (err.toString()) {
            message = `${message}: ${err.toString()}`;
        }
    }
    if (!message.endsWith('.')) {
        message = `${message}.`;
    }
    return message;
}

export function showErrorMessage(message: string, err: any, ...items: string[]): Thenable<string | undefined> {
    const msg = getErrorMessage(message, err);
    return vscode.window.showErrorMessage(msg, ...items);
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

export async function selectFolder(caption: string | undefined = undefined, serviceFolder: boolean = true): Promise<gcnServices.FolderData | null | undefined> {
    const choices: QuickPickObject[] = [];
    const folderData = gcnServices.getFolderData();
    for (const folder of folderData) {
        if (serviceFolder && folder.services.length > 0 || !serviceFolder && folder.services.length === 0) {
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
        placeHolder: caption ? caption : 'Select Folder'
    })
    return selection?.object;
}

export async function selectFolders(caption: string | undefined = undefined, serviceFolders: boolean = true, autoSelectSingle: boolean = true): Promise<gcnServices.FolderData[] | null | undefined> {
    const choices: QuickPickObject[] = [];
    const folderData = gcnServices.getFolderData();
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
        placeHolder: caption ? caption : 'Select Folders',
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

export async function selectServices(folder: gcnServices.FolderData): Promise<model.CloudServices | undefined> {
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
        placeHolder: 'Select Cloud Context'
    })
    return selection?.object;
}

export async function selectCloudSupport(): Promise<model.CloudSupport | undefined> {
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

export class QuickPickObject implements vscode.QuickPickItem {
    constructor(
        public readonly label: string,
        public readonly description : string | undefined,
        public readonly detail: string | undefined,
        public readonly object?: any,
    ) {}
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
						resolve(canSelectMany ? input.selectedItems : input.selectedItems[0]);
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
