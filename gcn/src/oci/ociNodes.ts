/*
 * Copyright (c) 2022, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as dialogs from '../dialogs';


export interface OciResource {
    getId(): string;
    getResource(): Promise<any>; // OCI resource represented by the node, like devops.models.BuildPipeline instance, may throw Error
}

export interface CloudConsoleItem {
    getAddress(): string | Promise<string>;
}

const OPEN_IN_CONSOLE_NODES: string[] = [];

export async function registerOpenInConsoleNode(context: string | string[]) {
    if (typeof context === 'string' || context instanceof String) {
        OPEN_IN_CONSOLE_NODES.push(context as string);
    } else {
        OPEN_IN_CONSOLE_NODES.push(...context);
    }
    await vscode.commands.executeCommand('setContext', 'gcn.oci.openInConsoleNodes', OPEN_IN_CONSOLE_NODES);
}

export function openInConsole(item: CloudConsoleItem) {
    const address = item.getAddress();
    if (typeof address === 'string') {
        dialogs.openInBrowser(address);
    } else if (address instanceof Promise) {
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Resolving item address...',
            cancellable: false
        }, async (_progress, _token) => {
            try {
                return await address;
            } catch (err) {
                return new Error(dialogs.getErrorMessage('Failed to resolve item address', err));
            }
        }).then(result => {
            if (result instanceof Error) {
                vscode.window.showErrorMessage(result.message);
            } else {
                dialogs.openInBrowser(result);
            }
        })
    }
}
