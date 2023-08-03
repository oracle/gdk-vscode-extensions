/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import { creatorInit, createProject } from './projectCreate';

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(vscode.commands.registerCommand('extension.micronaut.createProject', () => {
		createProject(context);
	}));
	creatorInit();
	// TODO: set up the notification to suggest installing tools/pack ext. for a new micronaut project
}

export function deactivate() {}
