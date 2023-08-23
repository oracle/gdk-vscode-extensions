/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';


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
