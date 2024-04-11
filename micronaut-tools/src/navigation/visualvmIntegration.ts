/*
 * Copyright (c) 2024, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';


const VISUALVM_EXTENSION_ID = 'oracle-labs-graalvm.visualvm-vscode';
const VISUALVM_EXTENSION_NAME = 'VisualVM for VS Code';
const VISUALVM_EXTENSION_COMMAND = 'visualvm.moveView';
const VISUALVM_EXTENSION_COMMAND_TIMEOUT = 60;
const VISUALVM_VIEW_ID = 'extension-micronaut-tools-visualvm';

export async function showView() {
    try {
        if (await resolveVisualVMExt()) {
            await waitForVisualVMCommand();
            await vscode.commands.executeCommand(VISUALVM_EXTENSION_COMMAND, VISUALVM_VIEW_ID);
        }
    } catch (err) {
        vscode.window.showErrorMessage(`${err}`);
    }
}

async function resolveVisualVMExt(): Promise<boolean> {
    const visualVM = vscode.extensions.getExtension(VISUALVM_EXTENSION_ID);
    if (!visualVM) {
        const installOption = vscode.l10n.t('Install');
        const cancelOption = vscode.l10n.t('Cancel');
        const msg = vscode.l10n.t('Do you want to install the {0} extension?', VISUALVM_EXTENSION_NAME);
        const choice = await vscode.window.showInformationMessage(msg, installOption, cancelOption);
        if (choice !== installOption) {
            return false;
        }
        await vscode.commands.executeCommand('workbench.extensions.installExtension', VISUALVM_EXTENSION_ID);
    }
    return true;
}

async function waitForVisualVMCommand() {
    for (let i = 0; i < VISUALVM_EXTENSION_COMMAND_TIMEOUT; i++) {
        // console.log('>>> Waiting for VisualVM command ' + i)
        const commands = await vscode.commands.getCommands();
        if (commands.includes(VISUALVM_EXTENSION_COMMAND)) {
            return;
        }
        await delay(1000);
    }
    throw new Error(`Timed out waiting for ${VISUALVM_EXTENSION_NAME} extension. Check whether the extension is active and initialized.`);
}

function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

