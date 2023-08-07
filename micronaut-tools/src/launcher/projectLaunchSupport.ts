/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import { CancellationToken, DebugConfiguration, DebugConfigurationProvider, ProviderResult, WorkspaceFolder } from "vscode";
import * as path from "path";
import * as vscode from 'vscode';
import * as utils from './utils';

export class ProjectDebugConfigurationProvider implements DebugConfigurationProvider {
    readonly extensionPath : string;

    constructor(ctx : vscode.ExtensionContext) {
        this.extensionPath = ctx.extensionPath;
    }

    public provideDebugConfigurations?(_folder: WorkspaceFolder | undefined, _token?: CancellationToken): ProviderResult<DebugConfiguration[]> {
        return [];
    }

    public resolveDebugConfigurationWithSubstitutedVariables(folder: WorkspaceFolder | undefined, config: DebugConfiguration, token?: CancellationToken): ProviderResult<DebugConfiguration> {        
        if (vscode.workspace.getConfiguration('micronaut.jdt').get('buildsystemExecution') !== true) {
            return config;
        }
        if (config?.type !== 'java' || config?.request !== 'launch') {
            return config;
        }
        return resolveConfigurationAsync(folder?.uri, config, this.extensionPath, token);
    }
}


export async function resolveConfigurationAsync(folder: vscode.Uri | undefined, config: DebugConfiguration, extensionPath : string, _token?: CancellationToken): Promise<DebugConfiguration> {
    // exclude test runs from the redirection now:
    if (config?.mainClass && /org.eclipse.jdt.internal.junit.runner\.*/.test(config.mainClass)) {
        return config;
    }
    const uri = vscode.window.activeTextEditor?.document?.uri || folder;
    const arg = {
        projectName: config?.projectName,
        mainClass: config?.mainClass,
        location: uri?.toString()
    };
    const { type, projectDir, root, container } = await utils.executeJavaWorkspaceCommand('micronaut.java.project.type', arg);

    // support just maven and gradle projects.
    if (!root) {
        return config;
    }
    // redirect the java launch to a custom launcher script
    config['launcherScript'] = path.join(extensionPath, 'resources', 'launch-wrappers', 
        (process.platform === 'win32' ? 'launcher.cmd' : 'launcher.sh'));
    if (!config['env'])  {
        config['env'] = {};
    }

    if (config['cwd']) {
        config['env']['JDT_LAUNCHWRAP_CWD'] = config['cwd'];
    }

    config['env']['JDT_LAUNCHWRAP_PROJECT_SCRIPTS'] = path.join(extensionPath, 'resources', 'launch-wrappers');
    // project type; only maven and gradle is supported, case-insensitive.
    config['env']['JDT_LAUNCHWRAP_PROJECT_TYPE'] = type;
    // container used in the project. only micronaut (case-insensitive) is supported.
    config['env']['JDT_LAUNCHWRAP_PROJECT_CONTAINER'] = container;
    // project directory, where the (sub)project content starts, this will the buildsystem run at
    config['env']['JDT_LAUNCHWRAP_PROJECT_DIR'] = projectDir;
    // the project's root directory. This is where buildsystem launcher resides.
    config['env']['JDT_LAUNCHWRAP_PROJECT_ROOT'] = root;
    // full path to the launcher wrapper Java application, distributed with the extension.
    config['env']['JDT_LAUNCHWRAP_PROJECT_LAUNCHER'] = path.join(extensionPath, 'agent');
    return config;
}
