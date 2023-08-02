/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';

const MICRONAUT_DO_NOT_SHOW_RECOMMENDATION = 'micronaut.doNotShowRecommendation';

export async function checkGCNExtensions(context: vscode.ExtensionContext) {
	if (!context.globalState.get(MICRONAUT_DO_NOT_SHOW_RECOMMENDATION)
        && !vscode.extensions.getExtension('oracle-labs-graalvm.micronaut')
        && !vscode.extensions.getExtension('oracle-labs-graalvm.graal-cloud-native-pack')) {
		const INSTALL_OPTION = 'Install';
		const DO_NOT_ASK_OPTION = 'Do not Ask Again';
		const option = await vscode.window.showInformationMessage(`Do you want to install the 'Graal Cloud Native Extensions Pack' recommended for work with Micronaut / Graal Cloud Native projects?`, INSTALL_OPTION, DO_NOT_ASK_OPTION);
		if (option === INSTALL_OPTION) {
			await vscode.commands.executeCommand('workbench.extensions.installExtension', 'oracle-labs-graalvm.graal-cloud-native-pack');
		} else if (option === DO_NOT_ASK_OPTION) {
			context.globalState.update(MICRONAUT_DO_NOT_SHOW_RECOMMENDATION, true);
		}
	}
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