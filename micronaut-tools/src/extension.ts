/*
 * Copyright (c) 2020, 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import { getJavaHome, micronautProjectExists } from '../../common/lib/utils';
import { WelcomePanel } from './welcome';
import { builderInit, build } from './projectBuild';
import { createDeployment } from './kubernetes/kubernetesDeployment';
import { deployProject } from './kubernetes/kubernetesDeploy';
import { runProject, createService } from './kubernetes/kubernetesRun';
import { createExternalMicronaut, createExternalGCN } from './projectCreate';
import * as applications from './navigation/applications';
import * as symbols from './navigation/symbols';
import * as workspaceFolders from './navigation/workspaceFolders';
import * as views from './navigation/views';
import * as actions from './navigation/actions';
import * as settings from './navigation/settings';
import * as restQueries from './navigation/restQueries';
import * as codeLens from './navigation/codeLens';
import * as kubernetes from 'vscode-kubernetes-tools-api';
import * as launcher from './launcher/extension';
import * as dbSupport from './database/dbsupport';
import * as logUtils from '../../common/lib/logUtils';

export function activate(context: vscode.ExtensionContext) {
	logUtils.registerExtensionForLogging(context);
	logUtils.logInfo(`Activating Extension.`);
	
	applications.initialize(context);
	symbols.initialize(context);
	workspaceFolders.initialize(context);
	views.initialize(context);
	actions.initialize(context);
	settings.initialize(context);
	restQueries.initialize(context);
	codeLens.initialize(context);

	if (vscode.workspace.getConfiguration().get<boolean>('micronaut-tools.showWelcomePage')) {
		WelcomePanel.createOrShow(context);
	}
	context.subscriptions.push(vscode.commands.registerCommand('extension.micronaut-tools.showWelcomePage', () => {
		WelcomePanel.createOrShow(context);
	}));
	context.subscriptions.push(vscode.commands.registerCommand('extension.micronaut-tools.createMicronautProject', () => {
		createExternalMicronaut();
	}));
	context.subscriptions.push(vscode.commands.registerCommand('extension.micronaut-tools.createGcnProject', () => {
		createExternalGCN();
	}));
	context.subscriptions.push(vscode.commands.registerCommand('extension.micronaut-tools.build', (goal?: string) => {
		build(goal, 'build');
	}));
	context.subscriptions.push(vscode.commands.registerCommand('extension.micronaut-tools.deploy', (goal?: string) => {
		build(goal, 'deploy');
	}));
	context.subscriptions.push(vscode.commands.registerCommand('extension.micronaut-tools.buildNativeImage', () => {
		vscode.commands.executeCommand('extension.micronaut-tools.build', 'nativeImage');
	}));
	context.subscriptions.push(vscode.commands.registerCommand('extension.micronaut-tools.kubernetes.createDeploy', () => {
		createDeployment();
	}));
	context.subscriptions.push(vscode.commands.registerCommand('extension.micronaut-tools.kubernetes.deploy', () => {
		deployProject();
	}));
	context.subscriptions.push(vscode.commands.registerCommand('extension.micronaut-tools.kubernetes.createService', () => {
		createService();
	}));
	context.subscriptions.push(vscode.commands.registerCommand('extension.micronaut-tools.kubernetes.run', () => {
		runProject();
	}));
	context.subscriptions.push(vscode.commands.registerCommand('extension.micronaut-tools.oci.register', (ociNode) => {
		let id: string = ociNode.adbInstanceNodeProperties.adbInstanceID;
		let name: string = ociNode.adbInstanceNodeProperties.adbInstanceDisplayName;
		let info = {id, name};
		logUtils.logInfo(`[NBLS] Download Wallet action: name: ${name}; id: ${id}`);
		vscode.commands.executeCommand('nbls:Tools:org.netbeans.modules.cloud.oracle.actions.DownloadWalletAction', info);
	}));
	context.subscriptions.push(vscode.commands.registerCommand('extension.micronaut-tools.new.entity', (ctx) => {
		vscode.commands.executeCommand('nbls.workspace.new', ctx, 'Micronaut/Entity');
	}));
	context.subscriptions.push(vscode.commands.registerCommand('extension.micronaut-tools.new.repository', (ctx) => {
		vscode.commands.executeCommand('nbls.workspace.new', ctx, 'Micronaut/Repository');
	}));
	context.subscriptions.push(vscode.commands.registerCommand('extension.micronaut-tools.new.controller', (ctx) => {
		vscode.commands.executeCommand('nbls.workspace.new', ctx, 'Micronaut/Controller');
	}));
	context.subscriptions.push(vscode.commands.registerCommand('extension.micronaut-tools.new.controller.data', (ctx) => {
		vscode.commands.executeCommand('nbls.workspace.new', ctx, 'Micronaut/ControllerFromRepository');
	}));

	dbSupport.activate(context);

	const graalVmExt = vscode.extensions.getExtension('oracle-labs-graalvm.graalvm');
	if (graalVmExt) {
		if (!graalVmExt.isActive) {
			graalVmExt.activate();
		}
		vscode.commands.executeCommand('setContext', 'graalVMExt.available', true);
	}
	launcher.activateLauncher(context);
	micronautProjectExists().then(exists => {
		if (exists) {
			vscode.commands.executeCommand('setContext', 'micronautProjectExists', true);
			builderInit();
			const javaHome = getJavaHome();
			if (javaHome) {
				vscode.commands.executeCommand('setContext', 'javaHomeSet', true);
			}
			kubernetes.extension.kubectl.v1.then((kubectl => {
				if (kubectl.available) {
					vscode.commands.executeCommand('setContext', 'kubectl.available', true);
				}
				logUtils.logWarning(`[micronaut-project] Project exist: javaHome: ${javaHome}; kubectl: ${kubectl.available}.`);
			}));
		} else {
			logUtils.logWarning(`[micronaut-project] Project doesn't exist.`);
		}
	});
	logUtils.logInfo(`Activated Extension.`);
}

export function deactivate() {
	dbSupport.deactivate();
}
