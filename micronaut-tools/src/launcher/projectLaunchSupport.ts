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
import * as logUtils from '../../../common/lib/logUtils';

export class InitialMicronautContinuousConfigurationProvider implements DebugConfigurationProvider {
    provideDebugConfigurations(folder: vscode.WorkspaceFolder | undefined, token?: vscode.CancellationToken): vscode.ProviderResult<vscode.DebugConfiguration[]> {
        if (vscode.workspace.getConfiguration('micronaut-tools').get('buildsystemExecution') !== true) {
            return [];
        }
        return this.doProvideDebugConfigurations(folder, token);
     }
 
     async doProvideDebugConfigurations(folder: vscode.WorkspaceFolder | undefined, _token?:  vscode.CancellationToken):  Promise<vscode.DebugConfiguration[]> {
        if (!folder) {
            return [];
        }
        logUtils.logInfo(`[launchSupport] providing debug configuration for: ${folder.name}`);
        const cfg : vscode.DebugConfiguration[] = [];
        try {
            const mainClasses : utils.IMainClassOption[] = await utils.executeJavaWorkspaceCommand('vscode.java.resolveMainClass', 
                folder ? folder.uri.toString() : undefined);
            const cache = {};

            const defaultLaunchConfig = {
                type: "java",
                name: vscode.l10n.t('Current File - Run Continuous'),
                request: "launch",
                mainClass: "${file}",
                env: {
                    'JDT_LAUNCHWRAP_MICRONAUT_CONTINUOUS': 'true'
                }
            };

            for (let item of mainClasses) {
                const { container } = await utils.executeJavaWorkspaceCommand('extension.micronaut-tools.java.project.type', {
                    projectName: item.projectName,
                    mainClass: item.mainClass,
                    location: item.filePath
                });
                if (container !== 'micronaut') {
                    continue;
                }
                cfg.push({
                    ...defaultLaunchConfig,
                    name: vscode.l10n.t('{0} - Continuous', constructLaunchConfigName(item.mainClass, cache)),
                    mainClass : item.mainClass,
                    projectName: item.projectName
                });
            }
            // if there's at least 1 Micronaut project, add the generic current-file based launch config; otherwise the provider returns an
            // empty list.
            if (cfg) {
                cfg.unshift(defaultLaunchConfig);
            }
        } catch (e) {
            logUtils.logError(`[launchSupport] providing debug configuration failed: ${e}`);
            console.log(e);
        }
        logUtils.logInfo(`[launchSupport] provided debug configuration for: ${folder.name}`);
        return cfg;
     }
}

function constructLaunchConfigName(mainClass: string, cache: { [key: string]: any }) {
    const name = `${mainClass.substr(mainClass.lastIndexOf(".") + 1)}`;
    if (cache[name] === undefined) {
        cache[name] = 0;
        return name;
    } else {
        cache[name] += 1;
        return `${name}(${cache[name]})`;
    }
}

class InterruptJavaLaunch implements DebugConfigurationProvider {
    launchConfig? : DebugConfiguration;

    resolveDebugConfigurationWithSubstitutedVariables?(_folder: WorkspaceFolder | undefined, debugConfiguration: DebugConfiguration, _token?: CancellationToken): ProviderResult<DebugConfiguration> {
        this.launchConfig = debugConfiguration;
        return undefined;
    }
}

export class FallbackToJDTConfigurationProvider implements DebugConfigurationProvider {

    resolveDebugConfiguration(folder: WorkspaceFolder | undefined, debugConfiguration: DebugConfiguration, token?: CancellationToken): ProviderResult<DebugConfiguration> {
        const nblsDebugEnabled = vscode.workspace.getConfiguration('netbeans')?.get('javaSupport.enabled') as boolean;
        if (folder === undefined || nblsDebugEnabled || debugConfiguration?.type !== 'java+') {
            return debugConfiguration;
        }
        return this.resolveConfigurationAsync(folder, debugConfiguration, token);
    }

    async resolveConfigurationAsync(folder: WorkspaceFolder | undefined, config: DebugConfiguration, _token?: CancellationToken): Promise<DebugConfiguration> {
        const stopper = new InterruptJavaLaunch();
        const unreg = vscode.debug.registerDebugConfigurationProvider('java', stopper);
        try {
            config.type = 'java';
            await vscode.debug.startDebugging(folder, config);
        } finally {
            unreg.dispose();
        }
        if (!stopper.launchConfig) {
            return config;
        }
        config = stopper.launchConfig;
        // Hack: detect NBLS configurations & convert into env var:
        if (!config.env) {
            config.env = {};
        }
        if (config.launchConfiguration === 'Micronaut: dev mode' || config.launchConfiguration === 'Continuous Mode') {
            config.env['JDT_LAUNCHWRAP_MICRONAUT_CONTINUOUS'] = 'true';
        } else {
            config.env['JDT_LAUNCHWRAP_MICRONAUT_CONTINUOUS'] = 'false';
        }
        return config;
    }
}

export class ProjectDebugConfigurationProvider implements DebugConfigurationProvider {
    readonly extensionPath : string;

    constructor(ctx : vscode.ExtensionContext) {
        this.extensionPath = ctx.extensionPath;
    }

    public provideDebugConfigurations?(_folder: WorkspaceFolder | undefined, _token?: CancellationToken): ProviderResult<DebugConfiguration[]> {
        return [];
    }

    public resolveDebugConfigurationWithSubstitutedVariables(folder: WorkspaceFolder | undefined, config: DebugConfiguration, token?: CancellationToken): ProviderResult<DebugConfiguration> {        
        if (vscode.workspace.getConfiguration('micronaut-tools').get('buildsystemExecution') !== true) {
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
    logUtils.logInfo(`[launchSupport] providing debug configuration for: ${folder}`);
    const uri = vscode.window.activeTextEditor?.document?.uri || folder;
    const arg = {
        projectName: config?.projectName,
        mainClass: config?.mainClass,
        location: uri?.toString()
    };
    const { type, projectDir, root, container } = await utils.executeJavaWorkspaceCommand('extension.micronaut-tools.java.project.type', arg);

    // support just maven and gradle projects.
    if (!root) {
        logUtils.logInfo(`[launchSupport] provided basic debug configuration for: ${folder}`);
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
    if (config['build-maven-dependencies'] !== undefined) {
        config['env']['JDT_LAUNCHWRAP_MAVEN_DEPENDENCIES'] = config['build-maven-dependencies'] as string;
    }
    if (!config['env']['JDT_LAUNCHWRAP_MICRONAUT_CONTINUOUS']) {
        config['env']['JDT_LAUNCHWRAP_MICRONAUT_CONTINUOUS'] = 'false';
    }
    logUtils.logInfo(`[launchSupport] provided debug configuration for: ${folder}: ${JSON.stringify({container, projectDir, root}, undefined, 2)}`);
    return config;
}
