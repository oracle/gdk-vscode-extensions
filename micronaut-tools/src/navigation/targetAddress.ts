/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as symbols from './symbols';


const SETTINGS_MICRONAUT_TOOLS_CONFIG = 'micronaut-tools';
const SETTING_TARGET_ADDRESS_KEY = 'targetApplicationAddress';
export const SETTING_TARGET_ADDRESS_DEFAULT = 'http://localhost:8080';

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

export async function saveAddress(uri: vscode.Uri, address: string) {
    const value = address === SETTING_TARGET_ADDRESS_DEFAULT ? undefined : address;
    return vscode.workspace.getConfiguration(SETTINGS_MICRONAUT_TOOLS_CONFIG, uri).update(SETTING_TARGET_ADDRESS_KEY, value, vscode.ConfigurationTarget.WorkspaceFolder);
}

export function normalizeAddress(address: string): string {
    address = address.trim();
    if (address.length === 0 || address === 'localhost') {
        return SETTING_TARGET_ADDRESS_DEFAULT;
    }
    if (address.startsWith(':')) {
        const port = parseInt(address.substring(1));
        if (!isNaN(port)) {
            return `http://localhost:${port}`;
        }
    }
    if (!address.includes('://')) {
        address = `http://${address}`;
    }
    const maskedProtocol = address.replace('://', '~~~');
    if (!maskedProtocol.includes(':')) {
        address = `${address}:8080`;
    }
    return address;
}

export function getProtocol(address: string): string {
    const protocolIdx = address.indexOf('://');
    return protocolIdx < 0 ? 'http' : address.substring(0, protocolIdx);
}

export function getPlainAddress(address: string): string {
    const protocolIdx = address.indexOf('://');
    return protocolIdx < 0 ? address : address.substring(protocolIdx + 3);
}

export function getPort(address: string): number {
    const portIdx = address.lastIndexOf(':');
    return portIdx < 0 ? Number.NaN : Number.parseInt(address.substring(portIdx + 1));
}

export function isLocal(address: string): boolean {
    return address.endsWith('://localhost') || address.includes('://localhost:');
}
