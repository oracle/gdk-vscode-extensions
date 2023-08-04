/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';


const EXTENSION_ID_MICRONAUT = 'oracle-labs-graalvm.micronaut';
const EXTENSION_NAME_MICRONAUT = 'Micronaut Launch';
const COMMAND_PROJECT_CREATE_MICRONAUT = 'extension.micronaut.createProject';
const EXTENSION_ID_GCN = 'oracle-labs-graalvm.gcn';
const EXTENSION_NAME_GCN = 'Graal Cloud Native Tools';
const COMMAND_PROJECT_CREATE_GCN = 'gcn.createGcnProject';

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
            return false;
        }
    }
    return true;
}

async function invokeCommand(createCommandID: string, steps: number = 5): Promise<boolean> {
    try {
        await vscode.commands.executeCommand(createCommandID);
        return true;
    } catch (err) {
        if (--steps <= 0) {
            vscode.window.showErrorMessage(`${err}`);
            return false;
        } else {
            await new Promise(resolve => setTimeout(resolve, 500));
            return invokeCommand(createCommandID, steps);
        }
    }
}
