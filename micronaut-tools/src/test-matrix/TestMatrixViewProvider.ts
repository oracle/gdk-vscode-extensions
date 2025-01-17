/*
 * Copyright (c) 2020, 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import path = require('path');
import { shouldHideModule } from './vscodeUtils';
import * as Handlebars from 'handlebars/runtime';
import { FlattenTestCase, FlattenTestSuite, ClickableState, ModuleWithVisibility, TestSuite, TestCase, CurrentTestState } from './types';
import { checkLibTestExistence, fillModuleState, getMethodName, getModuleName, getModulesFrom, getParameterizedMethodName, getTestSuiteName, loadWorkspaceTests } from './testUtils';
import { delay } from './initializer';

const iconsPerState = {
	enqueued: 'codicon-history',
	loaded: 'codicon-circle-outline',
	started: 'codicon-history',
	passed: 'codicon-pass',
	failed: 'codicon-error',
	errored: 'codicon-error',
	skipped: 'codicon-debug-step-over'
};

const colorPerState = {
	loaded: 'grey',
	enqueued: 'yellow',
	started: 'yellow',
	passed: 'green',
	failed: 'red',
	errored: 'red',
	skipped: 'grey',
};

const PROJECT_WITH_PRIORITY = 'oci';
const PROJECT_WITH_LEAST_PRIORITY = 'lib';

Handlebars.registerHelper("shouldShowModule", (modules: ModuleWithVisibility[], testSuite: FlattenTestSuite) => {
	const hiddenModules = modules.filter(module => !module.show).map(module => module.name);
	const testModules = getModulesFrom(testSuite);

	return testModules.some(moduleName => !hiddenModules.includes(moduleName));
});

export class TestMatrixViewProvider implements vscode.WebviewViewProvider {

	public static readonly viewType = 'testMatrix.testMatrixView';
	private static readonly webviewsFolder: string = 'webviews';

	private tests: FlattenTestSuite[] = [];
	private modules: ModuleWithVisibility[] = [];
	private view?: vscode.WebviewView;

	constructor(
		private readonly extensionUri: vscode.Uri,
		private readonly worspaceFolders: vscode.WorkspaceFolder[]
	) { }

	public async resolveWebviewView(
		webviewView: vscode.WebviewView,
		context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken,
	) {
		this.view = webviewView;
		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [
				this.extensionUri
			]
		};
 
		this.tests = (context.state as {storedTests: FlattenTestSuite[]} | undefined)?.storedTests || [];
		const testSuites = await loadWorkspaceTests(this.worspaceFolders);
		this.checkTestsState(testSuites);
		testSuites.forEach(test => this.appendTestCase(test));
		this.refreshModuleList();
		
		webviewView.webview.html = await this.getHtmlForWebview(webviewView.webview);

		webviewView.webview.onDidReceiveMessage(async data => {
			switch (data.type) {
				case 'testCaseClick':
					{
						const state: ClickableState = JSON.parse(data["state"]);
						const uri = vscode.Uri.parse(state.file || "");
						const document = await vscode.workspace.openTextDocument(uri);
						const editor = await vscode.window.showTextDocument(document);

						const position = new vscode.Position(state.range?.start.line || 0, state.range?.start.character || 0);
						const selection = new vscode.Selection(position, position);
			
						editor.selection = selection;
						editor.revealRange(new vscode.Range(state.range?.start.line || 0, state.range?.start.character || 0, state.range?.end.line || 0, state.range?.end.character || 0));
						break;
					}
			}
		});
	}

	public async ensureWebview(): Promise<void> {
		if (!this.view) {
			await vscode.commands.executeCommand(`${TestMatrixViewProvider.viewType}.focus`);
		}

		// Need to explicitly check if html is rendered to avoid event colision between resolveWebviewView and testEvent methods
		for (let i = 0; i < 10; i++) {
			if (this.view?.webview.html) {
				return;
			}
			await delay(100);
		}
	}

	private checkTestsState(testsToLoad: TestSuite[]) {
		const newTestsState: FlattenTestSuite[] = [];

		this.tests.forEach(test => {
			const currentModules = getModulesFrom(test);
			const sameNameTestSuites = testsToLoad.filter(testSuite => testSuite.name === test.name);
			const newModuleState = sameNameTestSuites.map(ts => getModuleName(ts.moduleName));
			const modulesForDeletion = currentModules.filter(module => !newModuleState.includes(module));

			if (modulesForDeletion.length === 0) {
				newTestsState.push(test);
			} else if (modulesForDeletion.length !== currentModules.length) {
				const updatedTestSuite = this.deleteModuleFromTestSuite(test, modulesForDeletion);
				newTestsState.push(updatedTestSuite);
			}
		});
		this.tests = newTestsState;
	}

	private deleteModuleFromTestSuite(testSuite: FlattenTestSuite, modulesForDeletion: string[]): FlattenTestSuite {
		const newTestSuite: FlattenTestSuite = {
			...testSuite
		};
		modulesForDeletion.forEach(module => {
			delete newTestSuite[module];
		});
		newTestSuite.tests.forEach(testCase => {
			modulesForDeletion.forEach(module => {
				delete testCase[module];
			});
		});
		return newTestSuite;
	}

	public async moduleVisibilityChanged() {
		this.modules = this.getModuleList();
		if (this.view) {
			this.view.webview.html = await this.getHtmlForWebview(this.view?.webview);
		}
	}

	public async clearAllTestResults() {
		const initialState: ClickableState = {
			state :'loaded',
			stringify: '',
		};
		this.tests.forEach(test => {
			const testModules = getModulesFrom(test);
			testModules.forEach(module => {
				fillModuleState(test, initialState, module);
			});
			test.tests.forEach(testSuite => {
				const testSuiteModules = getModulesFrom(testSuite);
				testSuiteModules.forEach(module => {
					fillModuleState(testSuite, initialState, module);
				});
			});
		});
		if (this.view) {
			this.view.webview.html = await this.getHtmlForWebview(this.view?.webview);
			this.view.webview.postMessage({ type: 'updateTests', tests: this.tests });
		}
	}

	public async testEvent(event: TestSuite) {
		this.appendTestCase(event);

		if (this.view) {
			if (event.state !== 'loaded') {
				this.view.show?.(true);
			}
			this.view.webview.html = await this.getHtmlForWebview(this.view?.webview);
			this.view.webview.postMessage({ type: 'updateTests', tests: this.tests });
		}
	}

	private appendTestCase(testSuite: TestSuite) {
		testSuite.name = getTestSuiteName(testSuite.name);
		const existingTestSuite: FlattenTestSuite | undefined = this.tests.find(test => test.name === testSuite.name);
		if (existingTestSuite && testSuite.moduleName) {
			if (testSuite.state === 'loaded') {
				existingTestSuite.tests = this.processLoadedState(testSuite);
			} else {
				existingTestSuite.tests = this.processOtherStates(testSuite);
			}
			this.tests = this.tests.map(test => test.name === existingTestSuite.name ? existingTestSuite : test);
		} else if (testSuite.moduleName) {
			this.addNewTestSuite(testSuite);
			this.refreshModuleList();
		}
	}

	private refreshModuleList() {
		this.modules = this.getModuleList();
		const moduleNames = this.modules.map(module => module.name);
		checkLibTestExistence(moduleNames);
	}

	private processOtherStates(testSuite: TestSuite): FlattenTestCase[] {
		const existingTestSuite: FlattenTestSuite | undefined = this.tests.find(test => test.name === testSuite.name);
		if (!existingTestSuite) {
			return [];
		}
		const moduleName = getModuleName(testSuite.moduleName);
		fillModuleState(existingTestSuite, testSuite, moduleName);
		return existingTestSuite.tests.map(testCase => { 
			const testMethod = testSuite.tests?.find(test => getMethodName(test.name) === testCase.name);
			const parameterizedMethods = testSuite.tests?.filter(test => getParameterizedMethodName(test.name).includes(testCase.name));

			if (testMethod) {
				if (['enqueued', 'started'].includes(testMethod?.state)) {
					fillModuleState(existingTestSuite, testMethod, moduleName);
				}
				fillModuleState(testCase, testMethod, moduleName);
			} else if (parameterizedMethods?.length) {
				const newState = this.calculateStateFor(parameterizedMethods);
				fillModuleState(testCase, {state: newState}, moduleName);
			} else if (testCase[moduleName]?.state === 'enqueued') {
				fillModuleState(testCase, testSuite, moduleName);
			}
			return testCase;
		});
	}

	calculateStateFor(testCases: TestCase[]): CurrentTestState {
        let passed: number = 0;
		for(const item of testCases) {
			if (item.state === 'enqueued' || item.state === 'failed' || 
				item.state === 'started' || item.state === 'errored'
			) {
				return item.state;
			}
			if (item.state === 'passed') passed++;
        }
        if (passed > 0) return 'passed';
        return 'skipped';
    }
	
	private processLoadedState(testSuite: TestSuite): FlattenTestCase[] {
		const existingTestSuite: FlattenTestSuite | undefined = this.tests.find(test => test.name === testSuite.name);
		if (!existingTestSuite || !testSuite.tests) {
			return [];
		}
		return testSuite.tests.map(testCase => {
			const methodName = getMethodName(testCase.name);
			const moduleName = getModuleName(testSuite.moduleName);
			if (!existingTestSuite[moduleName]) {
				fillModuleState(existingTestSuite, testSuite, moduleName);
			} else {
				fillModuleState(existingTestSuite, {
					...testSuite,
					state: existingTestSuite[moduleName].state
				}, moduleName);
			}

			const existing = existingTestSuite.tests.find(test => test.name === methodName && test[moduleName]);
			if (existing) {
				fillModuleState(existing, {...testCase, state: existing[moduleName]?.state}, moduleName);
				return existing;
			}
	  
			const fallbackExisting = existingTestSuite.tests.find(test => test.name === methodName);
			const fltTestCase = fallbackExisting ? { ...fallbackExisting } : { name: methodName };
	  
			fillModuleState(fltTestCase, testCase, moduleName);
	  
			return fltTestCase;
		  });
	}

	private addNewTestSuite(testSuite: TestSuite) {
		if (!(testSuite.tests?.length && testSuite.tests?.every(test => test.name))) return;

		const testCases: FlattenTestCase[] = testSuite.tests.map(test => {
			const methodName = getMethodName(test.name);
			const fltTestCase: FlattenTestCase = { name: methodName };
			fillModuleState(fltTestCase, test, getModuleName(testSuite.moduleName));
			return fltTestCase;
		});
		
		const test: FlattenTestSuite = { 
			name: testSuite.name, 
			tests: testCases 
		};
		fillModuleState(test, testSuite, getModuleName(testSuite.moduleName));
		this.tests.push(test);
	}

	private async getHtmlForWebview(webview: vscode.Webview) {
        const template = require("../../webviews/testMatrix.handlebars");
        return template({
            ...this.getSources(webview),
			colors: colorPerState,
			icons: iconsPerState,
            modules: this.modules,
			testSuites: this.tests
		});
	}

	private getModuleList(): ModuleWithVisibility[] {
		let moduleList: string[] = [];
		this.tests.forEach(test => {
			moduleList = moduleList.concat(getModulesFrom(test));
		});
		const sortedModules = this.sortModulesByPriority([...new Set(moduleList)]);
		return sortedModules.map(moduleName => ({
			name: getModuleName(moduleName),
			show: !shouldHideModule(moduleName)
		}));
	}
	
	// Sort module list to have OCI project first, and LIB last
	private sortModulesByPriority(modules: string[]): string[] {
		return modules.sort((a, b) => {
			// Prioritize modules containing oci keyword
			if (a.includes(PROJECT_WITH_PRIORITY) && !b.includes(PROJECT_WITH_PRIORITY)) return -1;
			if (!a.includes(PROJECT_WITH_PRIORITY) && b.includes(PROJECT_WITH_PRIORITY)) return 1;
		  
			// Deprioritize modules containing lib keyword
			if (a.includes(PROJECT_WITH_LEAST_PRIORITY) && !b.includes(PROJECT_WITH_LEAST_PRIORITY)) return 1;
			if (!a.includes(PROJECT_WITH_LEAST_PRIORITY) && b.includes(PROJECT_WITH_LEAST_PRIORITY)) return -1;
		  
			// Otherwise, sort alphabetically
			return a.localeCompare(b);
		});
	}

	protected getSources(webview: vscode.Webview): any {
        return {
			cspSource: this.view?.webview.cspSource,
			codiconsUri: webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'node_modules', '@vscode', 'codicons', 'dist', 'codicon.css')),
            cssUri: webview.asWebviewUri(vscode.Uri.file(path.join(this.extensionUri.fsPath, TestMatrixViewProvider.webviewsFolder, "styles", "testMatrix.css"))),
            javascriptUri: webview.asWebviewUri(
                vscode.Uri.file(path.join(this.extensionUri.fsPath, TestMatrixViewProvider.webviewsFolder, "scripts", "testMatrix.js"))
            ),
        };
    }
}
