/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import { resolveConfigurationAsync } from './projectLaunchSupport';

export async function launch(extensionPath : string, uriString: string, _noDebug: boolean) {
    const uri = uriString ? vscode.Uri.parse(uriString) : vscode.window.activeTextEditor?.document?.uri;
    if (!uri) {
        return false;
    }
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
    if (workspaceFolder) {
        const launchConfig = {
            type: 'java',
            request: 'launch',
            noDebug: true,
            name: `Run Continuous`,
            env: {
                'JDT_LAUNCHWRAP_MICRONAUT_CONTINUOUS': 'true'
            }
        };
        try {
            return await vscode.debug.startDebugging(workspaceFolder, 
                await resolveConfigurationAsync(uri, launchConfig, extensionPath));
        } catch (err) {
            console.log(err);
        }
    }
    return false;
}
