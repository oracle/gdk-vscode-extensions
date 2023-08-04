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
import * as settings from './settings';


const COMMAND_COMPOSE_REST_QUERY = 'extension.micronaut-tools.navigation.composeRestQuery';
const COMMAND_NAME_COMPOSE_REST_QUERY = vscode.l10n.t('Compose REST Query');
const COMMAND_DONT_SUGGEST_CLIENT_EXT = 'extension.micronaut-tools.navigation.dontSuggestClientExt';

const SETTING_DONT_SUGGEST_CLIENT_EXT_KEY = 'extension.micronaut-tools.navigation.targetAddress';
const SETTING_DONT_SUGGEST_CLIENT_EXT_DEFAULT = false;
const dontSuggestClientExt = new settings.BooleanSetting(SETTING_DONT_SUGGEST_CLIENT_EXT_KEY, SETTING_DONT_SUGGEST_CLIENT_EXT_DEFAULT, true);
const RECOMMENDED_EXT_CLIENT = 'humao.rest-client';
const RECOMMENDED_EXT_CLIENT_NAME = 'REST Client';
const SUPPORTED_EXT_CLIENTS = [ RECOMMENDED_EXT_CLIENT ];

export function initialize(context: vscode.ExtensionContext) {
    dontSuggestClientExt.initialize(context);
    context.subscriptions.push(vscode.commands.registerCommand(COMMAND_DONT_SUGGEST_CLIENT_EXT, () => {
        dontSuggestClientExt.set(context, true);
	}));
    context.subscriptions.push(vscode.commands.registerCommand(COMMAND_COMPOSE_REST_QUERY, (node: nodes.EndpointNode) => {
        if (node) {
            const symbol = node.getSymbol();
            composeRestQuery(symbol);
        }
	}));
    logUtils.logInfo('[restQueries] Initialized');
}

async function composeRestQuery(endpoint: symbols.Endpoint) {
    const query = await createRestQuery(endpoint);
    if (query) {
        const document = await getDocument();
        const documentText = document.getText();
        const editor = await vscode.window.showTextDocument(document, { preview: false });
        const existingQuery = documentText.indexOf(query);
        if (existingQuery === -1) {
            const addText = `${documentText.length ? getSeparator(document) : ''}${query}`;
            const addPos = new vscode.Position(document.lineCount, 0);
            editor.insertSnippet(new vscode.SnippetString(addText), addPos);
        } else {
            const existingPos = document.positionAt(existingQuery + query.length);
            editor.revealRange(new vscode.Range(existingPos, existingPos));
            editor.selection = new vscode.Selection(existingPos, existingPos);
        }
        checkExternalExt();
    }
}

async function createRestQuery(endpoint: symbols.Endpoint): Promise<string | undefined> {
    const type = endpoint.type;
    const address = await targetAddress.getEndpointAddress(endpoint, COMMAND_NAME_COMPOSE_REST_QUERY);
    if (address) {
        const httpVersion = 'HTTP/1.1';
        return `${type} ${address} ${httpVersion}`;
    } else {
        return undefined;
    }
}

let externalExtChecked: boolean = false;

async function checkExternalExt() {
    if (!dontSuggestClientExt.get() && !externalExtChecked) {
        externalExtChecked = true;
        for (const extension of vscode.extensions.all) {
            if (SUPPORTED_EXT_CLIENTS.includes(extension.id)) {
                return;
            }
        }
        const installOption = vscode.l10n.t('Install');
        const dnsaOption = vscode.l10n.t('Don\'t Ask Again');
        const cancelOption = vscode.l10n.t('Cancel');
        const msg = vscode.l10n.t('Do you want to install the recommended {0} extension to execute REST queries?', RECOMMENDED_EXT_CLIENT_NAME);
        const choice = await vscode.window.showInformationMessage(msg, installOption, dnsaOption, cancelOption);
        if (choice === installOption) {
            vscode.commands.executeCommand('workbench.extensions.installExtension', RECOMMENDED_EXT_CLIENT);
        } else if (choice === dnsaOption) {
            vscode.commands.executeCommand(COMMAND_DONT_SUGGEST_CLIENT_EXT);
        }
    }
}

let queryDocument: vscode.TextDocument | undefined;

async function getDocument(): Promise<vscode.TextDocument> {
    if (queryDocument) {
        const allDocuments = vscode.workspace.textDocuments;
        if (!allDocuments.includes(queryDocument)) {
            queryDocument = undefined;
        }
    }
    if (!queryDocument) {
        queryDocument = await vscode.workspace.openTextDocument({ language: 'http' });
    }
    return queryDocument;
}

function getEOL(document: vscode.TextDocument): string {
    switch (document.eol) {
        case vscode.EndOfLine.CRLF: return '\r\n';
        default: return '\n';
    }
}

function getSeparator(document: vscode.TextDocument): string {
    const eol = getEOL(document);
    const separator = '###';
    return `${eol}${eol}${separator}${eol}${eol}`;
}
