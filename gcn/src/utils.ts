/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';

const MICRONAUT_DO_NOT_SHOW_RECOMMENDATION = 'micronaut.doNotShowRecommendation';

export async function micronautProjectExists(): Promise<boolean> {
	return (await vscode.workspace.findFiles('**/micronaut-cli.yml', '**/node_modules/**')).length > 0;
}

export async function checkExtensions(context: vscode.ExtensionContext) {
	if (!context.globalState.get(MICRONAUT_DO_NOT_SHOW_RECOMMENDATION)
        && !vscode.extensions.getExtension('oracle-labs-graalvm.micronaut')
        && !vscode.extensions.getExtension('oracle-labs-graalvm.graal-cloud-native-pack')) {
		const INSTALL_OPTION = 'Install';
		const DO_NOT_ASK_OPTION = 'Do Not Ask Again';
		const option = await vscode.window.showInformationMessage(`Do you want to install the 'Graal Cloud Native Extensions Pack' recommended for work with Micronaut / Graal Cloud Native projects?`, INSTALL_OPTION, DO_NOT_ASK_OPTION);
		if (option === INSTALL_OPTION) {
			await vscode.commands.executeCommand('workbench.extensions.installExtension', 'oracle-labs-graalvm.graal-cloud-native-pack');
		} else if (option === DO_NOT_ASK_OPTION) {
			context.globalState.update(MICRONAUT_DO_NOT_SHOW_RECOMMENDATION, true);
		}
	}
}
