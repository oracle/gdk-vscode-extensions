/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as symbols from './symbols';
import * as nodes from './nodes';


const COMMAND_EDIT_TARGET_ADDRESS_GLOBAL = 'extension.micronaut-tools.navigation.editTargetAddressGlobal';
const COMMAND_EDIT_TARGET_ADDRESS_FOLDER = 'extension.micronaut-tools.navigation.editTargetAddressFolder';
const COMMAND_NAME_EDIT_TARGET_ADDRESS = vscode.l10n.t('Edit Target Application Address');

const SETTINGS_MICRONAUT_TOOLS_CONFIG = 'micronaut-tools';
const SETTING_TARGET_ADDRESS_KEY = 'targetApplicationAddress';
const SETTING_TARGET_ADDRESS_DEFAULT = 'http://localhost:8080';

export function initialize(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.commands.registerCommand(COMMAND_EDIT_TARGET_ADDRESS_GLOBAL, async () => {
        const folders = vscode.workspace.workspaceFolders;
        let folder: vscode.WorkspaceFolder | undefined;
        if (folders?.length === 1) {
            folder = folders[0];
        } else {
            folder = await vscode.window.showWorkspaceFolderPick({
                placeHolder: vscode.l10n.t('Pick workspace folder for which to edit the target address')
            });
        }
        if (!folder) {
            return;
        }
        const address = await editTargetAddress(folder);
        if (address) {
            await saveTargetAddress(folder, address);
        }
	}));
    context.subscriptions.push(vscode.commands.registerCommand(COMMAND_EDIT_TARGET_ADDRESS_FOLDER, async (node: nodes.EndpointsFolderNode) => {
        const folder = node.getFolderData().getWorkspaceFolder();
        const address = await editTargetAddress(folder);
        if (address) {
            await saveTargetAddress(folder, address);
        }
	}));
}

export function getBaseAddress(uri: vscode.Uri): string {
    const targetAddress = vscode.workspace.getConfiguration(SETTINGS_MICRONAUT_TOOLS_CONFIG, uri).get<string>(SETTING_TARGET_ADDRESS_KEY) || SETTING_TARGET_ADDRESS_DEFAULT;
    return targetAddress;
}

export async function getEndpointAddress(endpoint: symbols.Endpoint, actionName: string | undefined = undefined, defineParameters: boolean = true): Promise<string | undefined> {
    let address = getBaseAddress(endpoint.uri) + endpoint.name;
    let paramIdx = !defineParameters ? -1 : address.indexOf('{');
    while (paramIdx !== -1) {
        let paramEndIdx = address.indexOf('}');
        if (paramEndIdx === -1) {
            paramEndIdx = paramIdx;
        }
        const newAddress = await vscode.window.showInputBox({
            title: vscode.l10n.t('{0}Provide Parameter Values', actionName ? actionName + ': ' : ''),
            placeHolder: vscode.l10n.t('Provide values of the endpoint {parameters}'),
            value: address,
            valueSelection: [paramIdx, paramEndIdx + 1]
        });
        if (newAddress) {
            address = newAddress;
            paramIdx = address.indexOf('{');
        } else {
            return undefined;
        }
    }
    return address;
}

async function editTargetAddress(folder: vscode.WorkspaceFolder): Promise<string | undefined> {
    return vscode.window.showInputBox({
        title: COMMAND_NAME_EDIT_TARGET_ADDRESS,
        placeHolder: vscode.l10n.t('Provide address of the target application ({0})', SETTING_TARGET_ADDRESS_DEFAULT),
        value: getBaseAddress(folder.uri)
    });
}

async function saveTargetAddress(folder: vscode.WorkspaceFolder, address: string) {
    const value = address === SETTING_TARGET_ADDRESS_DEFAULT ? undefined : address;
    return vscode.workspace.getConfiguration(SETTINGS_MICRONAUT_TOOLS_CONFIG, folder.uri).update(SETTING_TARGET_ADDRESS_KEY, value, vscode.ConfigurationTarget.WorkspaceFolder);
}
