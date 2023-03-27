/*
 * Copyright (c) 2022, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as model from './model';
import * as devopsServices from './devopsServices';
import * as servicesView from './servicesView';
import * as welcome from './welcome';
import * as gcnProjectCreate from './gcnProjectCreate';
import * as logUtils from './logUtils';
import * as persistenceUtils from './persistenceUtils';

export const CLOUD_SUPPORTS: model.CloudSupport[] = [];

export async function activate(context: vscode.ExtensionContext) : Promise<vscode.ExtensionContext> {
	logUtils.logInfo('[extension] Activating extension');

	persistenceUtils.initialize(context);

	CLOUD_SUPPORTS.push(
		require('./oci/ociSupport').create(context)
		// NOTE: support for another cloud implementations might be registered here
	);
	
	if (persistenceUtils.getWorkspaceConfiguration().get<boolean>('showToolsPage')) {
		welcome.WelcomePanel.createOrShow(context);
	}
	context.subscriptions.push(vscode.commands.registerCommand('oci.devops.showToolsPage', () => {
		welcome.WelcomePanel.createOrShow(context);
	}));

	servicesView.initialize(context);

	context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(async () => {
		await devopsServices.build(context.workspaceState);
	}));

	context.subscriptions.push(vscode.commands.registerCommand('gcn.createGcnProject', () => gcnProjectCreate.createProject(context)));

	devopsServices.build(context.workspaceState);

	logUtils.logInfo('[extension] Extension successfully activated');

	return context;
}
