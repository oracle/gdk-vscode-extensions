/*
 * Copyright (c) 2019, 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as logUtils from './logUtils';

export type ProjectType = "GDK" | "Micronaut";

/**
 * Handles the creation of a new GDK project.
 *
 * @param {vscode.Uri} uri - The URI of the newly created project.
 * @param {ProjectType} projectType - Project type name.
 * @returns {Promise<void>}
 */
export async function handleNewGCNProject(context: vscode.ExtensionContext, uri:vscode.Uri, projectType: ProjectType) {
	const OPEN_IN_NEW_WINDOW = 'Open in New Window';
	const OPEN_IN_CURRENT_WINDOW = 'Open in Current Window';
	const ADD_TO_CURRENT_WORKSPACE = 'Add to Current Workspace';
    if (vscode.workspace.workspaceFolders) {
        const value = await vscode.window.showInformationMessage(`New ${projectType} project created`, OPEN_IN_NEW_WINDOW, ADD_TO_CURRENT_WORKSPACE);
        if (value === OPEN_IN_NEW_WINDOW) {
            await vscode.commands.executeCommand('vscode.openFolder', uri, true);
        } else if (value === ADD_TO_CURRENT_WORKSPACE) {
            vscode.workspace.updateWorkspaceFolders(vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders.length : 0, undefined, { uri });
            checkGCNExtensions(context);
        }
    } else if (vscode.window.activeTextEditor) {
        const value = await vscode.window.showInformationMessage(`New ${projectType} project created`, OPEN_IN_NEW_WINDOW, OPEN_IN_CURRENT_WINDOW);
        if (value) {
            await vscode.commands.executeCommand('vscode.openFolder', uri, OPEN_IN_NEW_WINDOW === value);
        }
    } else {
        await vscode.commands.executeCommand('vscode.openFolder', uri, false);
    }
}

export async function checkGCNExtensions(context: vscode.ExtensionContext) {
	const MICRONAUT_DO_NOT_SHOW_RECOMMENDATION = 'micronaut.doNotShowRecommendation';
	if (!context.globalState.get(MICRONAUT_DO_NOT_SHOW_RECOMMENDATION)
        && !vscode.extensions.getExtension('oracle-labs-graalvm.micronaut')
        && !vscode.extensions.getExtension('oracle-labs-graalvm.graal-cloud-native-pack')) {
		const INSTALL_OPTION = 'Install';
		const DO_NOT_ASK_OPTION = 'Do not Ask Again';
		const option = await vscode.window.showInformationMessage(`Do you want to install the 'Graal Development Kit for Micronaut Extension Pack' recommended for work with Micronaut / Graal Development Kit for Micronaut projects?`, INSTALL_OPTION, DO_NOT_ASK_OPTION);
		if (option === INSTALL_OPTION) {
			await vscode.commands.executeCommand('workbench.extensions.installExtension', 'oracle-labs-graalvm.graal-cloud-native-pack');
		} else if (option === DO_NOT_ASK_OPTION) {
			context.globalState.update(MICRONAUT_DO_NOT_SHOW_RECOMMENDATION, true);
		}
	}
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
		message = 'Unknown error.';
	} else if (!message.endsWith('.')) {
        message = `${message}.`;
    }
    return message;
}

export function showErrorMessageWithReportIssueCommand(message: string | undefined, command: string, err?: any, ...items: string[]): Thenable<string | undefined> {
	const reportIssue = 'Report Issue';
	items.push(reportIssue);
	return showErrorMessage(message, err, ...items).then(val => {
		if (val === reportIssue) {
			vscode.commands.executeCommand(command);
			return undefined;
		}
		return val;
	});
}

export function showErrorMessage(message: string | undefined, err?: any, ...items: string[]): Thenable<string | undefined> {
    const msg = getErrorMessage(message, err);
	logUtils.logError(msg);
    return vscode.window.showErrorMessage(msg, ...items);
}

export function showError(err?: any, ...items: string[]): Thenable<string | undefined> {
	return showErrorMessage(undefined, err, ...items);
}

export function simpleProgress<T>(message: string, task: () => Thenable<T>): Thenable<T> {
	return vscode.window.withProgress({
		location: vscode.ProgressLocation.Notification,
		title: message,
		cancellable: false
	}, (_progress, _token) => {
		return task();
	});
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
		(separator as vscode.QuickPickItem).kind = vscode.QuickPickItemKind.Separator;
		return separator;
	}
}

export function sortQuickPickObjectsByName(objects: QuickPickObject[]) {
	objects.sort((o1, o2) => o1.label.localeCompare(o2.label));
}

class InputFlowAction {
	static back = new InputFlowAction();
	static cancel = new InputFlowAction();
	static resume = new InputFlowAction();
}

export type InputStep = (input: MultiStepInput) => Thenable<InputStep | void>;

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

	/**
	 * Runs a prepared QuickPick as a part of multi-step input. This allows to prepare a QuickPick with custom event handlers. The method
	 * just configures the QuickPick with the parameters passed as options; only the filled options will be placed into the quick pick to avoid
	 * possible other customizations. The QuickPick is not shown, but just configured and decorated with handlers. The caller is responsible to
	 * call show() on the quickpick, after it is done with post-customizations.
	 * <p/>
	 * The returned value is a Promise for QuickPick's results. It can be await-ed on or returned as async result.
	 * 
	 * @param input a created and possibly pre-configured vscode.QuickPick
	 * @param param1 options 
	 * @returns promise for Quickpick's results.
	 */
	async setupQuickPick<T extends vscode.QuickPickItem, P extends QuickPickParameters<T>>(input : vscode.QuickPick<T>, { title, step, totalSteps, items, activeItems, placeholder, canSelectMany, buttons, shouldResume }: P) {
		const disposables: vscode.Disposable[] = [];
		const promise = new Promise<T | readonly T[] | (P extends { buttons: (infer I)[] } ? I : never)>((resolve, reject) => {
			if (input.title) {
				input.title = title;
			}
			if (step >= 0) {
				input.step = step;
			}
			if (totalSteps > 0) {
				input.totalSteps = totalSteps;
			}
			if (placeholder) {
				input.placeholder = placeholder;
			}
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
		});
		return promise.finally(() => {
			disposables.forEach(d => d.dispose());
		});
	}

	async showQuickPick<T extends vscode.QuickPickItem, P extends QuickPickParameters<T>>({ title, step, totalSteps, items, activeItems, placeholder, canSelectMany, buttons, shouldResume }: P) {
		const input = vscode.window.createQuickPick<T>();
		const promise = this.setupQuickPick(input, { title, step, totalSteps, items, activeItems, placeholder, canSelectMany, buttons, shouldResume });
		input.show();
		return promise;
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