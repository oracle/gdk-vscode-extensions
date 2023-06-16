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
