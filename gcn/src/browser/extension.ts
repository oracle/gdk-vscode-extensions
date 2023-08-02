/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as gcnProjectCreate from './gcnProjectCreateWeb';
import * as logUtils from './../logUtils';


export function activate(context: vscode.ExtensionContext) {
    logUtils.logInfo('[extension] Activating extension');

	context.subscriptions.push(vscode.commands.registerCommand('gcn.createGcnProject', () => gcnProjectCreate.createProject(context)));

    logUtils.logInfo('[extension] Extension successfully activated');
}
