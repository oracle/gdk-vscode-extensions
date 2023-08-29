/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import { registerDatabases } from './database-drivers';

export function activate(context: vscode.ExtensionContext) {
    const odtEnabledCheck = () =>
        vscode.commands.executeCommand('setContext', 'odt.extension.enabled', vscode.extensions.getExtension('oracle.oracledevtools') !== undefined);
    odtEnabledCheck();
    context.subscriptions.push(vscode.extensions.onDidChange(odtEnabledCheck));
    context.subscriptions.push(vscode.commands.registerCommand(
        "gcn-database-drivers.database.register", (dbNode) => {
            registerDatabases(dbNode);
        }));
}

export function deactivate() { }
