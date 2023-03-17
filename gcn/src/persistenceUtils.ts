/*
 * Copyright (c) 2022, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';


let workspaceState: vscode.Memento | undefined;

export function initialize(context: vscode.ExtensionContext) {
    workspaceState = context.workspaceState;
}

export function getWorkspaceObject<T>(key: string): T | undefined {
    return workspaceState?.get(key);
}

export async function setWorkspaceObject(key: string, value: any): Promise<void> {
    return workspaceState?.update(key, value);
}

export function getWorkspaceConfiguration(): vscode.WorkspaceConfiguration {
	return vscode.workspace.getConfiguration('gcn');
}
