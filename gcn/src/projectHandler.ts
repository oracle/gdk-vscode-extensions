/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';


const OPEN_IN_NEW_WINDOW = 'Open in new window';
const OPEN_IN_CURRENT_WINDOW = 'Open in current window';
const ADD_TO_CURRENT_WORKSPACE = 'Add to current workspace';

/**
 * Handles the creation of a new GCN project.
 *
 * @param {vscode.Uri} uri - The URI of the newly created project.
 * @returns {Promise<void>}
 */
export async function handleNewGCNProject(uri:vscode.Uri) {
    if (vscode.workspace.workspaceFolders) {
        const value = await vscode.window.showInformationMessage('New GCN project created', OPEN_IN_NEW_WINDOW, ADD_TO_CURRENT_WORKSPACE);
        if (value === OPEN_IN_NEW_WINDOW) {
            await vscode.commands.executeCommand('vscode.openFolder', uri, true);
        } else if (value === ADD_TO_CURRENT_WORKSPACE) {
            vscode.workspace.updateWorkspaceFolders(vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders.length : 0, undefined, { uri });
        }
    } else if (vscode.window.activeTextEditor) {
        const value = await vscode.window.showInformationMessage('New GCN project created', OPEN_IN_NEW_WINDOW, OPEN_IN_CURRENT_WINDOW);
        if (value) {
            await vscode.commands.executeCommand('vscode.openFolder', uri, OPEN_IN_NEW_WINDOW === value);
        }
    } else {
        await vscode.commands.executeCommand('vscode.openFolder', uri, false);
    }
}