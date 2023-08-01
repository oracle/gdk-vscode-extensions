/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as settings from './settings';
import * as symbols from './symbols';


const COMMAND_EDIT_TARGET_ADDRESS = 'extension.micronaut-gcn.navigation.editTargetAddress';
const COMMAND_NAME_EDIT_TARGET_ADDRESS = vscode.l10n.t('Edit Target Application Address');

const SETTING_TARGET_ADDRESS_KEY = 'extension.micronaut-gcn.navigation.targetAddress';
const SETTING_TARGET_ADDRESS_DEFAULT = 'http://localhost:8080';
const targetAddress = new settings.StringSetting(SETTING_TARGET_ADDRESS_KEY, SETTING_TARGET_ADDRESS_DEFAULT, false);

export function initialize(context: vscode.ExtensionContext) {
    targetAddress.initialize(context);
    context.subscriptions.push(vscode.commands.registerCommand(COMMAND_EDIT_TARGET_ADDRESS, () => {
        editTargetAddress().then(address => {
            if (address) {
                targetAddress.set(context, address);
            }
        });
	}));
}

export function getBaseAddress(): string {
    return targetAddress.get();
}

export async function getEndpointAddress(endpoint: symbols.Endpoint, actionName: string | undefined = undefined, defineParameters: boolean = true): Promise<string | undefined> {
    let address = getBaseAddress() + endpoint.name;
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

async function editTargetAddress(): Promise<string | undefined> {
    return vscode.window.showInputBox({
        title: COMMAND_NAME_EDIT_TARGET_ADDRESS,
        placeHolder: vscode.l10n.t('Provide address of the target application ({0})', SETTING_TARGET_ADDRESS_DEFAULT),
        value: getBaseAddress()
    });
}
