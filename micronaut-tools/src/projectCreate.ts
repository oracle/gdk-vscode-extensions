/*
 * Copyright (c) 2023, 2024, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as logUtils from '../../common/lib/logUtils';

const EXTENSION_ID_MICRONAUT = 'oracle-labs-graalvm.micronaut';
const EXTENSION_NAME_MICRONAUT = 'Launch for Micronaut® framework';
const COMMAND_PROJECT_CREATE_MICRONAUT = 'extension.micronaut.createProject';
const EXTENSION_ID_GCN = 'oracle-labs-graalvm.gcn';
const EXTENSION_NAME_GCN = 'Graal Development Kit for Micronaut Launcher';
const COMMAND_PROJECT_CREATE_GCN = 'gdk.createGdkProject';

export function createExternalMicronaut() {
    createOrInstall(EXTENSION_ID_MICRONAUT, EXTENSION_NAME_MICRONAUT, COMMAND_PROJECT_CREATE_MICRONAUT);
}

export function createExternalGCN() {
    createOrInstall(EXTENSION_ID_GCN, EXTENSION_NAME_GCN, COMMAND_PROJECT_CREATE_GCN);
}

async function createOrInstall(extensionID: string, extensionName: string, createCommandID: string) {
    if (await extensionReady(extensionID, extensionName)) {
        invokeCommand(createCommandID);
    }
}

async function extensionReady(extensionID: string, extensionName: string): Promise<boolean> {
    if (!vscode.extensions.getExtension(extensionID)) {
        const installOption = 'Install';
        const cancelOption = 'Cancel';
        const selectedOption = await vscode.window.showInformationMessage(`Do you want to install the ${extensionName} extension to create the project?`, installOption, cancelOption);
        if (selectedOption !== installOption) {
            return false;
        }
        try {
            await vscode.commands.executeCommand('workbench.extensions.installExtension', extensionID);
        } catch (err) {
            vscode.window.showErrorMessage(`${err}`);
            logUtils.logError(`[projectCreate] extension installation failed: ${err}`);
            return false;
        }
    }
    return true;
}

async function invokeCommand(createCommandID: string, steps: number = 5): Promise<boolean> {
    try {
        logUtils.logInfo(`[projectCreate] invocating command: ${createCommandID}`);
        await vscode.commands.executeCommand(createCommandID);
        logUtils.logInfo(`[projectCreate] command '${createCommandID}' successful.`);
        return true;
    } catch (err) {
        if (--steps <= 0) {
            logUtils.logError(`[projectCreate] command '${createCommandID}' failed: ${err}`);
            vscode.window.showErrorMessage(`${err}`);
            return false;
        } else {
            logUtils.logWarning(`[projectCreate] command '${createCommandID}' failed: ${err}`);
            await new Promise(resolve => setTimeout(resolve, 500));
            return invokeCommand(createCommandID, steps);
        }
    }
}
