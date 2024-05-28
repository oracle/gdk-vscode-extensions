/*
 * Copyright (c) 2022, 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as gcnProjectCreate from './gcnProjectCreateWeb';
import * as logUtils from '../../../common/lib/logUtils';
import { micronautProjectExists } from '../../../common/lib/utils';
import { checkGCNExtensions } from '../../../common/lib/dialogs';


export function activate(context: vscode.ExtensionContext) {
	logUtils.registerExtensionForLogging(context);
    logUtils.logInfo('[extension] Activating extension');

	context.subscriptions.push(vscode.commands.registerCommand('gdk.createGdkProject', () => gcnProjectCreate.createProject(context)));
	micronautProjectExists().then(exists => {
		if (exists) {
			checkGCNExtensions(context);
		}
	});

    logUtils.logInfo('[extension] Extension successfully activated');
}
