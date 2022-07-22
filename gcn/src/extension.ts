/*
 * Copyright (c) 2022, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as model from './model';
import * as servicesView from './servicesView';
import * as importExportUtils from './importExportUtils';

export const CLOUD_SUPPORTS: model.CloudSupport[] = [];

export function activate(context: vscode.ExtensionContext) {
	CLOUD_SUPPORTS.push(
		// require('./oci/ociSupport').create(context),
		require('./oci/ociSupport').create(context)
		// TODO: add another cloud implementations here
	);

	// context.subscriptions.push(vscode.commands.registerCommand('extension.gcn.importFromCloud', () => {
	// 	importUtils.importDevopsProject();
	// }));
	// context.subscriptions.push(vscode.commands.registerCommand('extension.gcn.selectTenancy', () => {
	// 	gcn.selectTenancy();
	// }));
	// context.subscriptions.push(vscode.commands.registerCommand('extension.gcn.selectCompartment', () => {
	// 	gcn.selectCompartment();
	// }));
	// context.subscriptions.push(vscode.commands.registerCommand('extension.gcn.selectRegion', () => {
	// 	gcn.selectRegion();
	// }));
	// context.subscriptions.push(vscode.commands.registerCommand('extension.gcn.selectProject', () => {
	// 	gcn.selectProject();
	// }));
	// context.subscriptions.push(vscode.commands.registerCommand('extension.gcn.showRootCause', () => {
	// 	gcn.notImplementedYet();
	// }));
	// context.subscriptions.push(vscode.commands.registerCommand('extension.gcn.runBuildPipeline', (...params: any[]) => {
	// 	gcn.runBuildPipeline(params);
	// }));
	// context.subscriptions.push(vscode.commands.registerCommand('extension.gcn.addCodeRepository', () => {
	// 	gcn.notImplementedYet();
	// }));
	// context.subscriptions.push(vscode.commands.registerCommand('extension.gcn.openCodeRepository', (...params: any[]) => {
	// 	gcn.handleSourceRepository(params);
	// }));
	// // context.subscriptions.push(vscode.commands.registerCommand('extension.gcn.runAudits', () => {
	// // 	gcn.notImplementedYet();
	// // }));
	// context.subscriptions.push(vscode.commands.registerCommand('extension.gcn.refreshBuilds', () => {
	// 	gcn.refreshBuilds();
	// }));
	// context.subscriptions.push(vscode.commands.registerCommand('extension.gcn.showBuildReport', (...params: any[]) => {
	// 	gcn.showBuildReport(params);
	// }));
	// context.subscriptions.push(vscode.commands.registerCommand('extension.gcn.showAuditReport', () => {
	// 	gcn.notImplementedYet();
	// }));
	// context.subscriptions.push(vscode.commands.registerCommand('extension.gcn.downloadArtifact', (...params: any[]) => {
	// 	gcn.downloadArtifact(params);
	// }));
	// // context.subscriptions.push(vscode.commands.registerCommand('extension.gcn.openCloudShell', () => {
	// // 	gcn.notImplementedYet();
	// // }));
	// context.subscriptions.push(vscode.commands.registerCommand('extension.gcn.refreshView', () => {
	// 	// gcn.simulateErrors();
	// 	gcn.refreshUI();
	// }));

	// context.subscriptions.push(vscode.commands.registerCommand('extension.gcn.notImplementedYet', () => {
	// 	vscode.window.showWarningMessage('Not implemented yet.');
	// }));
	// context.subscriptions.push(vscode.commands.registerCommand('extension.gcn.openWebConsole', (...params: any[]) => {
	// 	gcn.openWebConsole(params);
	// }));
	// context.subscriptions.push(vscode.commands.registerCommand('extension.gcn.importLocally', (...params: any[]) => {
	// 	gcn.importLocally(params);
	// }));
	// context.subscriptions.push(vscode.commands.registerCommand('extension.gcn.deployToCloud', () => {
	// 	gcn.deployWorkspaceToCloud(context.extensionPath);
	// }));
	// context.subscriptions.push(vscode.commands.registerCommand('extension.gcn.removeService', (...params: any[]) => {
	// 	gcn.removeService(params);
	// }));

	// // context.subscriptions.push(vscode.window.registerTreeDataProvider('gcn-context', gcn.contextNodeProvider));
	// context.subscriptions.push(vscode.window.registerTreeDataProvider('gcn-view', gcn.resourcesNodeProvider));

	// gcn.initializeWorkspace(context.workspaceState, context.globalState);
	// if (vscode.workspace.workspaceFolders) {
	// 	gcn.lazilyImportToWorkspace();
	// }


	// const statusBarItem = gcn.initializeStatusBarItem();
	// context.subscriptions.push(statusBarItem);
	// context.subscriptions.push(vscode.commands.registerCommand(statusBarItem.command as string, () => {
	// 	gcn.statusBarAction();
	// }));

	context.subscriptions.push(vscode.commands.registerCommand('extension.gcn.importFromCloud', () => {
		importExportUtils.importDevopsProject();
	}));
	context.subscriptions.push(vscode.commands.registerCommand('extension.gcn.deployToCloud', () => {
		importExportUtils.deployOpenedFolders();
	}));
	context.subscriptions.push(vscode.commands.registerCommand('extension.gcn.reloadServicesView', () => {
		servicesView.rebuild();
	}));
	context.subscriptions.push(vscode.commands.registerCommand('extension.gcn.notImplementedYet', () => {
		vscode.window.showWarningMessage('Not implemented yet.');
	}));

	servicesView.initialize(context);
	context.subscriptions.push(vscode.window.registerTreeDataProvider('gcn-services', servicesView.nodeProvider));

	context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(() => {
		servicesView.rebuild();
	}));

	servicesView.rebuild();

}
