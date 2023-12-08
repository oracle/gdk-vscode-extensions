/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';


const SETTINGS_MICRONAUT_TOOLS_CONFIG = 'micronaut-tools';

let storage: vscode.Memento;

export function initialize(context: vscode.ExtensionContext) {
    storage = context.globalState;
}

export function getForUri<T>(uri: vscode.Uri, key: string): T | undefined {
    const uriKey = buildUriKey(uri, key);
    return storage.get(uriKey);
}

export function setForUri(uri: vscode.Uri, key: string, value: any): Thenable<void> {
    const uriKey = buildUriKey(uri, key);
    return storage.update(uriKey, value);
}

function buildUriKey(uri: vscode.Uri, key: string): string {
    // NOTE: workspaceFolder.uri.path sometimes returns /c: and sometimes /C: for the same folder!
    return `${SETTINGS_MICRONAUT_TOOLS_CONFIG}::${uri.fsPath}::${key}`;
}

// Represents a persistent global/workspace boolean setting, also sets a runtime context value
export class BooleanSetting {

    private readonly key: string;
    private value: boolean;
    private readonly global: boolean;

    constructor(key: string, defaultValue: boolean, global: boolean) {
        this.key = key;
        this.value = defaultValue;
        this.global = global;
    }

    async initialize(context: vscode.ExtensionContext) {
        const memento = this.global ? context.globalState : context.workspaceState;
        const persistedValue: string = memento.get(this.key, String(this.value));
        await this.apply(undefined, persistedValue === 'true');
    }
    
    async set(context: vscode.ExtensionContext, value: boolean) {
        await this.apply(context, value);
    }

    get(): boolean {
        return this.value;
    }
    
    private async apply(context: vscode.ExtensionContext | undefined, value: boolean) {
        this.value = value;
        await vscode.commands.executeCommand('setContext', this.key, this.value);
        if (context) {
            const memento = this.global ? context.globalState : context.workspaceState;
            await memento.update(this.key, String(this.value));
        }
    }

}
