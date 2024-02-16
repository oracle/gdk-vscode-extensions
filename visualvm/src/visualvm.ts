/*
 * Copyright (c) 2024, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as process from 'process';
import * as cp from 'child_process';
import * as view from './view';
import * as parameters from './parameters';
import * as logUtils from '../../common/lib/logUtils';


const VISUALVM_HOMEPAGE = 'https://visualvm.github.io';

const COMMAND_SELECT_INSTALLATION = 'visualvm.selectInstallation';
const NAME_SELECT_INSTALLATION = 'Select Local VisualVM Installation Folder';
const COMMAND_START_VISUALVM = 'visualvm.start';

const INITIALIZED_KEY = 'visualvm.initialized';
const NO_INSTALLATION_KEY = 'visualvm.noInstallation';

const INSTALLATION_PATH_KEY = 'visualvm.installation.visualvmPath';

type VisualVMInstallation = {
    executable: string;
    // 1: VisualVM 2.1+
    featureSet: number;
};
let installation: VisualVMInstallation | undefined = undefined;

let interactiveChange: boolean = false;

export async function initialize(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.commands.registerCommand(COMMAND_SELECT_INSTALLATION, () => {
        select();
	}));
    context.subscriptions.push(vscode.commands.registerCommand(COMMAND_START_VISUALVM, () => {
        show();
	}));
    resolve();
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration(INSTALLATION_PATH_KEY)) {
            logUtils.logInfo('[visualvm] Installation path changed');
            const interactive = interactiveChange;
            interactiveChange = false;
            resolve(interactive);
        }
    }));
}

export async function select() {
    logUtils.logInfo('[visualvm] Selecting VisualVM installation');
    const savedVisualVMPath = vscode.workspace.getConfiguration().get<string>(INSTALLATION_PATH_KEY);
    const savedVisualVMUri = savedVisualVMPath ? vscode.Uri.file(savedVisualVMPath) : undefined;
    const selectedVisualVMUri = await vscode.window.showOpenDialog({
        title: NAME_SELECT_INSTALLATION,
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        defaultUri: savedVisualVMUri,
        openLabel: 'Select'
    });
    if (selectedVisualVMUri?.length === 1) {
        const selectedVisualVMPath = selectedVisualVMUri[0].fsPath;
        if (selectedVisualVMPath !== savedVisualVMPath) {
            logUtils.logInfo('[visualvm] Selected new VisualVM installation, saving installation path');
            interactiveChange = true;
            vscode.workspace.getConfiguration().update(INSTALLATION_PATH_KEY, selectedVisualVMPath, vscode.ConfigurationTarget.Global);
        } else {
            // Has to be handled separately, wouldn't trigger any notification from settings.json
            logUtils.logInfo('[visualvm] Selected current VisualVM installation, re-resolving');
            resolve(true);
        }
    } else {
        logUtils.logInfo('[visualvm] VisualVM installation selection canceled');
    }
}

async function resolve(interactive: boolean = false) {
    logUtils.logInfo('[visualvm] Searching for VisualVM installation');
    view.hideNodes();
    await vscode.commands.executeCommand('setContext', INITIALIZED_KEY, false);
    await vscode.commands.executeCommand('setContext', NO_INSTALLATION_KEY, false);
    installation = undefined;
    try {
        const savedVisualVMPath = vscode.workspace.getConfiguration().get<string>(INSTALLATION_PATH_KEY);
        if (savedVisualVMPath) {
            logUtils.logInfo(`[visualvm] Found defined installation path: ${savedVisualVMPath}`);
            const savedInstallation = await forPath(savedVisualVMPath, interactive);
            if (savedInstallation) {
                installation = savedInstallation;
                return;
            }
        } else {
            logUtils.logInfo('[visualvm] No installation path defined');
        }
    } finally {
        await vscode.commands.executeCommand('setContext', NO_INSTALLATION_KEY, !installation);
        await vscode.commands.executeCommand('setContext', INITIALIZED_KEY, true);
        if (installation) {
            view.showNodes();
        }
    }
}

async function forPath(visualVMPath: string, interactive: boolean = false): Promise<VisualVMInstallation | undefined> {
    if (!fs.existsSync(visualVMPath)) {
        logUtils.logError(`[visualvm] Installation path does not exist: ${visualVMPath}`);
        if (interactive) {
            vscode.window.showErrorMessage(`VisualVM installation directory does not exist: ${visualVMPath}`);
        }
        return undefined;
    }
    if (!fs.statSync(visualVMPath).isDirectory()) {
        logUtils.logError(`[visualvm] Installation path is not a directory: ${visualVMPath}`);
        if (interactive) {
            vscode.window.showErrorMessage(`VisualVM installation path is not a directory: ${visualVMPath}`);
        }
        return undefined;
    }

    const visualVMExecutable = path.join(visualVMPath, 'bin', process.platform === 'win32' ? 'visualvm.exe' : 'visualvm');
    if (!fs.existsSync(visualVMExecutable)) {
        logUtils.logError(`[visualvm] Installation executable does not exist: ${visualVMExecutable}`);
        if (interactive) {
            vscode.window.showErrorMessage(`VisualVM executable not found in the selected directory: ${visualVMExecutable}`);
        }
        return undefined;
    }
    if (!fs.statSync(visualVMExecutable).isFile()) {
        logUtils.logError(`[visualvm] Installation executable is not a file: ${visualVMExecutable}`);
        if (interactive) {
            vscode.window.showErrorMessage(`Invalid VisualVM executable found in the selected directory: ${visualVMExecutable}`);
        }
        return undefined;
    }
    logUtils.logInfo(`[visualvm] Found valid executable: ${visualVMExecutable}`);

    const visualVMGoToSourceJar = path.join(visualVMPath, 'visualvm', 'modules', 'org-graalvm-visualvm-gotosource.jar');
    if (!fs.existsSync(visualVMGoToSourceJar)) {
        logUtils.logError(`[visualvm] Installation org-graalvm-visualvm-gotosource.jar does not exist: ${visualVMGoToSourceJar}`);
        if (interactive) {
            vscode.window.showErrorMessage(`Unsupported VisualVM version found in the selected directory: ${visualVMPath}. Please install the latest VisualVM from [${VISUALVM_HOMEPAGE}](${VISUALVM_HOMEPAGE}).`);
        }
        return undefined;
    }
    if (!fs.statSync(visualVMGoToSourceJar).isFile()) {
        logUtils.logError(`[visualvm] Installation org-graalvm-visualvm-gotosource.jar is not a file: ${visualVMGoToSourceJar}`);
        if (interactive) {
            vscode.window.showErrorMessage(`The selected VisualVM installation is broken: ${visualVMPath}`);
        }
        return undefined;
    }
    logUtils.logInfo(`[visualvm] Found valid org-graalvm-visualvm-gotosource.jar: ${visualVMGoToSourceJar}`);
    
    return { executable: visualVMExecutable, featureSet: 1 };
}

export async function show(pid?: number): Promise<boolean> {
    let params = parameters.windowToFront();
    if (pid !== undefined) {
        params += ` ${parameters.openPid(pid)}`;
    }
    return invoke(params);
}

export async function perform(params: string): Promise<boolean> {
    const windowToFront = parameters.windowToFrontConditional();
    if (windowToFront) {
        params += ` ${windowToFront}`;
    }
    return invoke(params);
}

async function invoke(params?: string): Promise<boolean> {
    logUtils.logInfo('[visualvm] Starting VisualVM');
    
    if (!installation) {
        // Should not happen - shouldn't be called if no installation available
        logUtils.logError('[visualvm] No VisualVM installation available');
        return false;
    }

    const command: string[] = [];

    // VisualVM executable -----
    command.push(parameters.executable(installation.executable));

    // Required parameters -----
    // Increase commandline length for jvmstat
    command.push(parameters.perfMaxStringConstLength());

    // Configurable pararameters
    // --jdkhome
    try {
        const jdkHome = await parameters.jdkHome();
        if (jdkHome) {
            command.push(jdkHome);
        }
    } catch (err) {
        logUtils.logError('[visualvm] Cannot start with --jdkhome, no JDK available');
        return false;
    }

    // User-defined parameters
    const userParams = parameters.userDefinedParameters();;
    if (userParams) {
        command.push(userParams);
    }

    // Provided parameters -----
    if (params) {
        command.push(params);
    }
    
    const commandString = command.join(' ');
    logUtils.logInfo(`[visualvm] Command: ${commandString}`);
    cp.exec(commandString);

    return true;
}
