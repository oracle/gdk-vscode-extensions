/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import { launch } from './launch';
import { lspServerReady } from './utils';
import { ProjectDebugConfigurationProvider, InitialMicronautContinuousConfigurationProvider, FallbackToJDTConfigurationProvider } from './projectLaunchSupport';

const EXECUTE_WORKSPACE_COMMAND: string = 'java.execute.workspaceCommand';
const JAVA_CODE_LENS_COMMAND: string = 'extension.micronaut-tools.java.codeLens';
const LAUNCH_COMMAND: string = 'extension.micronaut-tools.launch.continuous';

export function activateLauncher(context: vscode.ExtensionContext) {
	context.subscriptions.push(vscode.languages.registerCodeLensProvider('java', new CodeLensesProvider()));
    context.subscriptions.push(vscode.commands.registerCommand(LAUNCH_COMMAND, (uriString: string, _noDebug: boolean) => 
        launch(context.extensionPath, uriString, _noDebug)));
    context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('java', new ProjectDebugConfigurationProvider(context)));
    context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('java+', new FallbackToJDTConfigurationProvider()));
    context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('java', new InitialMicronautContinuousConfigurationProvider(), vscode.DebugConfigurationProviderTriggerKind.Initial));
}

class CodeLensesProvider implements vscode.CodeLensProvider {
    async provideCodeLenses(document: vscode.TextDocument, _token: vscode.CancellationToken): Promise<vscode.CodeLens[]> {
        if (vscode.workspace.getConfiguration('micronaut-tools').get('buildsystemExecution') !== true) {
            return [];
        }
        if (await lspServerReady()) {        
            const arg = {textDocument: {uri: document.uri.toString()}};
            const codeLens = await vscode.commands.executeCommand(EXECUTE_WORKSPACE_COMMAND, JAVA_CODE_LENS_COMMAND, arg);
            if (codeLens) {
                return codeLens as vscode.CodeLens[];
            }
        }
        return [];
    }
}
