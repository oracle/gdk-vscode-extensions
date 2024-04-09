/*
 * Copyright (c) 2022, 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as model from './model';
import * as devopsServices from './devopsServices';
import * as servicesView from './servicesView';
import * as welcome from './welcome';
import * as logUtils from '../../common/lib/logUtils';
import * as persistenceUtils from './persistenceUtils';

export const CLOUD_SUPPORTS: model.CloudSupport[] = [];

export function activate(context: vscode.ExtensionContext) {
	logUtils.registerExtensionForLogging(context);
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
	context.subscriptions.push(vscode.commands.registerCommand('oci.devops.openIssueReporter', () => {
		const logPath = path.join(context.logUri.fsPath, context.extension.packageJSON.displayName + '.log');
		const logContent = fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8') : '';
		const template = require('../resources/issue_template.handlebars');
		vscode.commands.executeCommand('vscode.openIssueReporter', {
			extensionId: 'oracle-labs-graalvm.oci-devops',
			issueBody: template({ logContent })
		});
	}));

	servicesView.initialize(context);

	context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(async () => {
		await devopsServices.build(context.workspaceState);
	}));

	devopsServices.build(context.workspaceState);

	logUtils.logInfo('[extension] Extension successfully activated');
}
