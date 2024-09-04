/*
 * Copyright (c) 2024, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';


export const EXTENSION_NAME = 'Tools for Micronaut® framework';
const EXTENSION_ID = 'oracle-labs-graalvm.micronaut-tools';

export function canCheckExtensionInstalled(configurationSection: string): boolean {
    return vscode.workspace.getConfiguration(configurationSection).get<boolean>('checkToolsExtension', true);
}

export function neverCheckExtensionInstalled(configurationSection: string): Thenable<void> {
    return vscode.workspace.getConfiguration(configurationSection).update('checkToolsExtension', false, true);
}

export function isExtensionInstalled(): boolean {
    return !!vscode.extensions.getExtension(EXTENSION_ID);
}

export async function installExtension(): Promise<boolean> {
    try {
        await vscode.commands.executeCommand('workbench.extensions.installExtension', EXTENSION_ID);
        return true;
    } catch (err) {
        vscode.window.showErrorMessage(`Failed to install ${EXTENSION_NAME} extension: ${err}`);
        return false;
    }
}
