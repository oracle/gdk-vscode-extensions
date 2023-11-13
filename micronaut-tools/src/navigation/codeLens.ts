/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as actions from './actions';
import * as restQueries from './restQueries';
import * as symbols from './symbols';
import * as views from './views';
import * as logUtils from '../../../common/lib/logUtils';

export function initialize(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.languages.registerCodeLensProvider({ language: 'java' }, new CodeLensProvider()));
    logUtils.logInfo(`[codeLens] initialized`);
}

class CodeLensProvider implements vscode.CodeLensProvider {

    private COMMAND_NBLS_DOCUMENT_SYMBOLS = 'nbls.document.symbols';
    private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    onDidChangeCodeLenses: vscode.Event<void> | undefined = this._onDidChangeCodeLenses.event;

    constructor() {
        symbols.onUpdated((kind) => {
            if (symbols.isEndpointKind(kind)) {
                this._onDidChangeCodeLenses.fire();
            }
        });
    }

    async provideCodeLenses(document: vscode.TextDocument, _token: vscode.CancellationToken): Promise<vscode.CodeLens[]> {
        const lenses = [];
        if (symbols.endpointsInitialized) {
            const endpoints = await this.readDocumentEndpoints(document.uri);
            if (endpoints) {
                for (const endpoint of endpoints) {
                    const range = new vscode.Range(endpoint.startPos, endpoint.endPos);
                    if (endpoint.type === symbols.EndpointType.TYPE_GET) {
                        lenses.push(new vscode.CodeLens(range, {
                            title: actions.COMMAND_NAME_OPEN_IN_BROWSER,
                            command: actions.COMMAND_OPEN_IN_BROWSER,
                            arguments: [ endpoint ]
                        }));
                    }
                    lenses.push(new vscode.CodeLens(range, {
                        title: restQueries.COMMAND_NAME_COMPOSE_REST_QUERY,
                        command: restQueries.COMMAND_COMPOSE_REST_QUERY,
                        arguments: [ endpoint ]
                    }));
                    lenses.push(new vscode.CodeLens(range, {
                        title: views.COMMAND_NAME_REVEAL_IN_ENDPOINTS,
                        command: views.COMMAND_REVEAL_IN_ENDPOINTS,
                        arguments: [ endpoint ]
                    }));
                }
            }
        }
        return lenses;
    }

    private async readDocumentEndpoints(uri: vscode.Uri): Promise<symbols.Endpoint[]> {
        logUtils.logInfo(`[codeLens] resolving Document Endpoints: ${uri}`);
        const newEndpoints: symbols.Endpoint[] = [];
        try {
            if ((await vscode.commands.getCommands()).find(cmd => cmd === this.COMMAND_NBLS_DOCUMENT_SYMBOLS)) {
                logUtils.logInfo(`[NBLS] obtain document endpoints: ${uri}`);
                const endpoints: any[] = await vscode.commands.executeCommand(this.COMMAND_NBLS_DOCUMENT_SYMBOLS, uri.toString(), symbols.PREFIX_ENDPOINTS);
                for (const endpoint of endpoints) {
                    try {
                        const name: string = endpoint.name;
                        const startPos: vscode.Position = new vscode.Position(endpoint.range?.start?.line, endpoint.range?.start?.character);
                        const endPos: vscode.Position = new vscode.Position(endpoint.range?.end?.line, endpoint.range?.end?.character);
                        newEndpoints.push(new symbols.SourceEndpoint(name, uri, startPos, endPos));
                    } catch (err) {
                        logUtils.logWarning(`[codeLens] readDocumentEndpoints - failed to read endpoint: ${err}`);
                    }
                }
            }
        } catch (err) {
            logUtils.logError(`[codeLens] readDocumentEndpoints - failed to read endpoints: ${err}`);
        }
        newEndpoints.sort((o1, o2) => o1.def.localeCompare(o2.def));
        logUtils.logInfo(`[codeLens] resolved Document Endpoints: ${newEndpoints.length}`);
        return newEndpoints;
    }
}
