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
import * as actions from './actions';
import * as logUtils from '../../common/lib/logUtils';


const VISUALVM_HOMEPAGE = 'https://visualvm.github.io';

const INITIALIZED_KEY = 'visualvm.initialized';
const NO_INSTALLATION_KEY = 'visualvm.noInstallation';

const INSTALLATION_PATH_KEY = 'visualvm.installationPath';

type VisualVMInstallation = {
    executable: string;
    // 1: VisualVM 2.1+
    featureSet: number;
};
let installation: VisualVMInstallation | undefined = undefined;

let interactiveChange: boolean = false;

export async function initialize(context: vscode.ExtensionContext) {
    resolve();
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration(INSTALLATION_PATH_KEY)) {
            logUtils.logInfo('[installation] Installation path changed');
            const interactive = interactiveChange;
            interactiveChange = false;
            resolve(interactive);
        }
    }));
}

export async function select() {
    logUtils.logInfo('[installation] Selecting VisualVM installation');
    const savedInstallationPath = vscode.workspace.getConfiguration().get<string>(INSTALLATION_PATH_KEY);
    const savedInstallationUri = savedInstallationPath ? vscode.Uri.file(savedInstallationPath) : undefined;
    const selectedInstallationUri = await vscode.window.showOpenDialog({
        title: actions.NAME_SELECT_INSTALLATION,
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        defaultUri: savedInstallationUri,
        openLabel: 'Select'
    });
    if (selectedInstallationUri?.length === 1) {
        const selectedInstallationPath = selectedInstallationUri[0].fsPath;
        if (selectedInstallationPath !== savedInstallationPath) {
            logUtils.logInfo('[installation] Selected new VisualVM installation, saving installation path');
            interactiveChange = true;
            vscode.workspace.getConfiguration().update(INSTALLATION_PATH_KEY, selectedInstallationPath, vscode.ConfigurationTarget.Global);
        } else {
            // Has to be handled separately, wouldn't trigger any notification from settings.json
            logUtils.logInfo('[installation] Selected current VisualVM installation, re-resolving');
            resolve(true);
        }
    } else {
        logUtils.logInfo('[installation] VisualVM installation selection canceled');
    }
}

async function resolve(interactive: boolean = false) {
    logUtils.logInfo('[installation] Searching for VisualVM installation');
    await vscode.commands.executeCommand('setContext', INITIALIZED_KEY, false);
    await vscode.commands.executeCommand('setContext', NO_INSTALLATION_KEY, false);
    installation = undefined;
    try {
        const savedInstallationPath = vscode.workspace.getConfiguration().get<string>(INSTALLATION_PATH_KEY);
        if (savedInstallationPath) {
            logUtils.logInfo(`[installation] Found defined installation path: ${savedInstallationPath}`);
            const savedInstallation = await forPath(savedInstallationPath, interactive);
            if (savedInstallation) {
                installation = savedInstallation;
                return;
            }
        } else {
            logUtils.logInfo('[installation] No installation path defined');
        }
    } finally {
        await vscode.commands.executeCommand('setContext', NO_INSTALLATION_KEY, !installation);
        await vscode.commands.executeCommand('setContext', INITIALIZED_KEY, true);
    }
}

async function forPath(installationPath: string, interactive: boolean = false): Promise<VisualVMInstallation | undefined> {
    if (!fs.existsSync(installationPath)) {
        logUtils.logError(`[installation] Installation path does not exist: ${installationPath}`);
        if (interactive) {
            vscode.window.showErrorMessage(`VisualVM installation directory does not exist: ${installationPath}`);
        }
        return undefined;
    }
    if (!fs.statSync(installationPath).isDirectory()) {
        logUtils.logError(`[installation] Installation path is not a directory: ${installationPath}`);
        if (interactive) {
            vscode.window.showErrorMessage(`VisualVM installation path is not a directory: ${installationPath}`);
        }
        return undefined;
    }

    const installationExecutable = path.join(installationPath, 'bin', process.platform === 'win32' ? 'visualvm.exe' : 'visualvm');
    if (!fs.existsSync(installationExecutable)) {
        logUtils.logError(`[installation] Installation executable does not exist: ${installationExecutable}`);
        if (interactive) {
            vscode.window.showErrorMessage(`VisualVM executable not found in the selected directory: ${installationExecutable}`);
        }
        return undefined;
    }
    if (!fs.statSync(installationExecutable).isFile()) {
        logUtils.logError(`[installation] Installation executable is not a file: ${installationExecutable}`);
        if (interactive) {
            vscode.window.showErrorMessage(`Invalid VisualVM executable found in the selected directory: ${installationExecutable}`);
        }
        return undefined;
    }
    logUtils.logInfo(`[installation] Found valid executable: ${installationExecutable}`);

    const installationGoToSourceJar = path.join(installationPath, 'visualvm', 'modules', 'org-graalvm-visualvm-gotosource.jar');
    if (!fs.existsSync(installationGoToSourceJar)) {
        logUtils.logError(`[installation] Installation org-graalvm-visualvm-gotosource.jar does not exist: ${installationGoToSourceJar}`);
        if (interactive) {
            vscode.window.showErrorMessage(`Unsupported VisualVM version found in the selected directory: ${installationPath}. Please install the latest VisualVM from [${VISUALVM_HOMEPAGE}](${VISUALVM_HOMEPAGE}).`);
        }
        return undefined;
    }
    if (!fs.statSync(installationGoToSourceJar).isFile()) {
        logUtils.logError(`[installation] Installation org-graalvm-visualvm-gotosource.jar is not a file: ${installationGoToSourceJar}`);
        if (interactive) {
            vscode.window.showErrorMessage(`The selected VisualVM installation is broken: ${installationPath}`);
        }
        return undefined;
    }
    logUtils.logInfo(`[installation] Found valid org-graalvm-visualvm-gotosource.jar: ${installationGoToSourceJar}`);
    
    return { executable: installationExecutable, featureSet: 1 };
}
