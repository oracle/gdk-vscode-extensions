/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as logUtils from '../../../common/lib/logUtils';
import * as nodes from './nodes';
import * as symbols from './symbols';
import * as targetAddress from './targetAddress';
import * as settings from './settings';


export const COMMAND_COMPOSE_REST_QUERY = 'extension.micronaut-tools.navigation.composeRestQuery';
export const COMMAND_NAME_COMPOSE_REST_QUERY = vscode.l10n.t('Compose REST Query');

const COMMAND_NBLS_MICRONAUT_GET_ENDPOINT_REQUEST_BODY = 'nbls.micronaut.get.endpoint.request.body';
const SETTING_DONT_SUGGEST_CLIENT_EXT_KEY = 'extension.micronaut-tools.navigation.dontSuggestClientExt';
const SETTING_DONT_SUGGEST_CLIENT_EXT_DEFAULT = false;
const dontSuggestClientExt = new settings.BooleanSetting(SETTING_DONT_SUGGEST_CLIENT_EXT_KEY, SETTING_DONT_SUGGEST_CLIENT_EXT_DEFAULT, true);
const RECOMMENDED_EXT_CLIENT = 'humao.rest-client';
const RECOMMENDED_EXT_CLIENT_NAME = 'REST Client';
const SUPPORTED_EXT_CLIENTS = [ RECOMMENDED_EXT_CLIENT ];

// --- NOTE on tracking the query document --------------------------------------------------------------
// When saving a document, the destination document is opened, and the source document is closed - lost.
// The only reliable way to track the query document seems to be using the onDidCloseTextDocument event.
// This event is not fired only for an empty Untitled document, which is acceptable (empty not tracked).
// Otherwise on closing the query document, all other TextDocuments are searched by the last known text.
// The last known text is updated for every onDidChangeTextDocument event.
// Since closing a document reverts its text to the value when opened, updating the known text is delayed
// by UPDATE_QUERY_DOCUMENT_TEXT_DELAY to reliably detect the document.isClosed state and ignore the last
// change.
// ------------------------------------------------------------------------------------------------------
const UPDATE_QUERY_DOCUMENT_TEXT_DELAY = 250;

export function initialize(context: vscode.ExtensionContext) {
    dontSuggestClientExt.initialize(context);
    context.subscriptions.push(vscode.commands.registerCommand(COMMAND_COMPOSE_REST_QUERY, (nodeOrSymbol: nodes.EndpointNode | symbols.Endpoint) => {
        if (nodeOrSymbol instanceof nodes.EndpointNode) {
            const symbol = nodeOrSymbol.getSymbol();
            composeRestQuery(symbol, context);
        } else if (nodeOrSymbol instanceof symbols.Endpoint) {
            composeRestQuery(nodeOrSymbol, context);
        }
	}));
    context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(event => {
        if (event.document === queryDocument) {
            setTimeout(() => {
                if (event.document === queryDocument && !event.document.isClosed) {
                    queryDocumentText = queryDocument.getText();
                }
            }, UPDATE_QUERY_DOCUMENT_TEXT_DELAY);
        }
    }));
    context.subscriptions.push(vscode.workspace.onDidCloseTextDocument(document => {
        if (document.uri === queryDocument?.uri) {
            setTimeout(() => {
                const foundDocument = findDocumentByText(queryDocumentText);
                if (foundDocument) {
                    queryDocument = foundDocument;
                } else {
                    queryDocument = undefined;
                    queryDocumentText = undefined;
                }
            }, 0);
        }
    }));
    logUtils.logInfo('[restQueries] Initialized');
}

async function composeRestQuery(endpoint: symbols.Endpoint, context: vscode.ExtensionContext) {
    const query = await createRestQuery(endpoint);
    if (query) {
        const document = await getDocument();
        const documentText = document.getText();
        const editor = await getEditorForDocument(document);
        const existingQuery = documentText.indexOf(query);
        if (existingQuery === -1) {
            const addText = `${documentText.length ? getSeparator(document) : ''}${query}`;
            const addPos = document.positionAt(documentText.length);
            editor.insertSnippet(new vscode.SnippetString(addText), addPos);
        } else {
            const existingPos = document.positionAt(existingQuery + query.length);
            editor.revealRange(new vscode.Range(existingPos, existingPos));
            editor.selection = new vscode.Selection(existingPos, existingPos);
        }
        checkExternalExt(context);
    }
}

async function createRestQuery(endpoint: symbols.Endpoint): Promise<string | undefined> {
    const type = endpoint.type;
    const address = await targetAddress.getEndpointAddress(endpoint, COMMAND_NAME_COMPOSE_REST_QUERY);
    if (address) {
        const httpVersion = 'HTTP/1.1';
        const body = await getRequestBody(endpoint);
        return `${type} ${address} ${httpVersion}${body}`;
    } else {
        return undefined;
    }
}

async function getRequestBody(endpoint: symbols.Endpoint): Promise<string> {
    switch (endpoint.type) {
        case symbols.EndpointType.TYPE_POST:
        case symbols.EndpointType.TYPE_PUT:
            if ((await vscode.commands.getCommands()).includes(COMMAND_NBLS_MICRONAUT_GET_ENDPOINT_REQUEST_BODY)) {
                return (await vscode.commands.executeCommand(COMMAND_NBLS_MICRONAUT_GET_ENDPOINT_REQUEST_BODY, endpoint.uri.toString(), endpoint.type, endpoint.startPos)) || '';
            }
    }
    return '';
}

let externalExtChecked: boolean = false;

async function checkExternalExt(context: vscode.ExtensionContext) {
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
            dontSuggestClientExt.set(context, true);
        }
    }
}

let queryDocument: vscode.TextDocument | undefined;
let queryDocumentText: string | undefined;

async function getDocument(): Promise<vscode.TextDocument> {
    if (queryDocument) {
        const allDocuments = vscode.workspace.textDocuments;
        if (!allDocuments.includes(queryDocument)) {
            queryDocument = undefined;
            queryDocumentText = undefined;
        }
    }
    if (!queryDocument) {
        queryDocument = await vscode.workspace.openTextDocument({ language: 'http' });
        queryDocumentText = queryDocument.getText();
    }
    return queryDocument;
}

function findDocumentByText(text: string | undefined): vscode.TextDocument | undefined {
    let foundDocument: vscode.TextDocument | undefined = undefined;
    if (text) { // only search by actual text, skip empty documents
        const allDocuments = vscode.workspace.textDocuments;
        for (const document of allDocuments) {
            if (!document.isClosed) { // only search among opened documents
                if (document.getText() === text) {
                    if (foundDocument) { // report no result for multiple matches
                        return undefined;
                    } else {
                        foundDocument = document;
                    }
                }
            }
        }
    }
    return foundDocument;
}

async function getEditorForDocument(document: vscode.TextDocument): Promise<vscode.TextEditor> {
    const editor = vscode.window.visibleTextEditors.find(editor => editor.document === document);
    return editor ? editor : vscode.window.showTextDocument(document, { preview: false });
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
