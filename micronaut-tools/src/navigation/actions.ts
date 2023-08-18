/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as logUtils from '../logUtils';
import * as nodes from './nodes';
import * as symbols from './symbols';
import * as targetAddress from './targetAddress';


export const COMMAND_GO_TO_DEFINITION = 'extension.micronaut-tools.navigation.goToDefinition';
export const COMMAND_NAME_GO_TO_DEFINITION = vscode.l10n.t('Go to Symbol');
export const COMMAND_OPEN_IN_BROWSER = 'extension.micronaut-tools.navigation.openInBrowser';
export const COMMAND_NAME_OPEN_IN_BROWSER = vscode.l10n.t('Open in Browser');

export function initialize(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.commands.registerCommand(COMMAND_GO_TO_DEFINITION, (node: nodes.SymbolNode<symbols.Symbol>) => {
        if (node) {
		    const symbol = node.getSymbol();
            revealInEditor(symbol);
        }
	}));
    context.subscriptions.push(vscode.commands.registerCommand(COMMAND_OPEN_IN_BROWSER, (nodeOrSymbol: nodes.EndpointNode | symbols.Endpoint) => {
        if (nodeOrSymbol instanceof nodes.EndpointNode) {
            const symbol = nodeOrSymbol.getSymbol();
            openInBrowser(symbol);
        } else if (nodeOrSymbol instanceof symbols.Endpoint) {
            openInBrowser(nodeOrSymbol);
        }
	}));
    logUtils.logInfo('[actions] Initialized');
}

async function revealInEditor(symbol: symbols.Symbol): Promise<vscode.TextEditor> {
    return vscode.window.showTextDocument(symbol.uri, {
        preview: false,
        selection: new vscode.Range(symbol.startPos, symbol.endPos)
    });
}

async function openInBrowser(symbol: symbols.Endpoint): Promise<boolean> {
    const address = await targetAddress.getEndpointAddress(symbol, COMMAND_NAME_OPEN_IN_BROWSER);
    if (address) {
        const uri = vscode.Uri.parse(address);
        return vscode.env.openExternal(uri);
    } else {
        return false;
    }
}
