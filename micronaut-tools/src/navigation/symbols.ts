/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as logUtils from '../../../common/lib/logUtils';


const COMMAND_RELOAD_ALL = 'extension.micronaut-tools.navigation.reloadAll';

const CONTEXT_RELOADING_BEANS = 'extension.micronaut-tools.navigation.reloadingBeans';
const CONTEXT_BEANS_INITIALIZED = 'extension.micronaut-tools.navigation.beansInitialized';
const CONTEXT_RELOADING_ENDPOINTS = 'extension.micronaut-tools.navigation.reloadingEndpoints';
const CONTEXT_ENDPOINTS_INITIALIZED = 'extension.micronaut-tools.navigation.endpointsInitialized';

const COMMAND_NBLS_ADD_EVENT_LISTENER = 'nbls.addEventListener';
const PARAM_EVENT_TYPE_SCAN_FINSIHED = 'nbls.scanFinished';
const COMMAND_NBLS_WORKSPACE_SYMBOLS = 'nbls.workspace.symbols';
const PREFIX_BEANS = '@+';
export const PREFIX_ENDPOINTS = '@/';

export function initialize(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.commands.registerCommand(COMMAND_RELOAD_ALL, () => {
        reloadAll();
	}));
    vscode.commands.executeCommand(COMMAND_NBLS_ADD_EVENT_LISTENER, PARAM_EVENT_TYPE_SCAN_FINSIHED, COMMAND_RELOAD_ALL);
    logUtils.logInfo('[symbols] Initialized');
}

export abstract class Symbol {
    static readonly NO_POSITION = new vscode.Position(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
    constructor(
        readonly def: string,
        readonly name: string,
        readonly description: string,
        readonly uri: vscode.Uri,
        readonly startPos: vscode.Position,
        readonly endPos: vscode.Position
    ) {}
}

export abstract class Bean extends Symbol {
    static KIND = 'BEAN';
}

class SourceBean extends Bean {

    constructor(def: string, uri: vscode.Uri, startPos: vscode.Position, endPos: vscode.Position) {
        super(def, SourceBean.nameFromDef(def), SourceBean.descriptionFromUri(uri), uri, startPos, endPos);
    }

    static nameFromDef(def: string): string {
        let namePart = def.substring('@+ \''.length);
        const nameEndIdx = namePart.indexOf('\'');
        return namePart.substring(0, nameEndIdx);
    }

    static descriptionFromUri(uri: vscode.Uri): string {
        return vscode.workspace.asRelativePath(uri, false);
    }

}

export enum EndpointType {
    TYPE_GET = 'GET',
    TYPE_HEAD = 'HEAD',
    TYPE_POST = 'POST',
    TYPE_PATCH = 'PATCH',
    TYPE_PUT = 'PUT',
    TYPE_DELETE = 'DELETE',
    TYPE_ERROR = 'ERROR',
    TYPE_UNKNOWN = 'UNKNOWN'
}

export abstract class Endpoint extends Symbol {
    
    static KIND = 'ENDPOINT';

    readonly type: EndpointType;

    constructor(def: string, name: string, description: string, type: string, uri: vscode.Uri, startPos: vscode.Position, endPos: vscode.Position) {
        super(def, name, description, uri, startPos, endPos);
        this.type = Endpoint.typeFromString(type);
    }

    public static typeFromString(type: string): EndpointType {
        switch (type.toUpperCase()) {
            case 'GET': return EndpointType.TYPE_GET;
            case 'HEAD': return EndpointType.TYPE_HEAD;
            case 'POST': return EndpointType.TYPE_POST;
            case 'PATCH': return EndpointType.TYPE_PATCH;
            case 'PUT': return EndpointType.TYPE_PUT;
            case 'DELETE': return EndpointType.TYPE_DELETE;
            case 'ERROR': return EndpointType.TYPE_ERROR;
        }
        return EndpointType.TYPE_UNKNOWN;
    }
    
}

export class SourceEndpoint extends Endpoint {

    constructor(def: string, uri: vscode.Uri, startPos: vscode.Position, endPos: vscode.Position) {
        super(def, SourceEndpoint.nameFromDef(def), SourceEndpoint.descriptionFromUri(uri), SourceEndpoint.typeFromDef(def), uri, startPos, endPos);
        // console.log('>>> DEF |' + def + '| -- NAME |' + this.name + '|')
    }

    static nameFromDef(def: string): string {
        const typeSeparator = ' -- ';
        const typeIdx = def.lastIndexOf(typeSeparator);
        const name = def.substring('@'.length, typeIdx);
        return name.endsWith('/') ? name.slice(0, -1) : name;
    }

    static descriptionFromUri(uri: vscode.Uri): string {
        return vscode.workspace.asRelativePath(uri, false);
    }

    static typeFromDef(def: string): string {
        const typeSeparator = ' -- ';
        const typeIdx = def.lastIndexOf(typeSeparator);
        const type = typeIdx >= 0 ? def.substring(typeIdx + typeSeparator.length) : def;
        return SourceEndpoint.typeFromString(type);
    }

}

export function isBeanKind(kind: string[]) {
    return kind.includes(Bean.KIND);
}

export function isEndpointKind(kind: string[]) {
    return kind.includes(Endpoint.KIND);
}

const beans: Bean[] = [];
const endpoints: Endpoint[] = [];

let beansInitialized: boolean = false;
export let endpointsInitialized: boolean = false;

export type OnUpdating = (kind: string[]) => void;
export type OnUpdated = (kind: string[], beans: Bean[], endpoints: Endpoint[]) => void;

export class Events {

    private readonly onUpdatingListeners: OnUpdating[] = [];
    private readonly onUpdatedListeners: OnUpdated[] = [];

    onUpdating(listener: OnUpdating) {
        this.onUpdatingListeners.push(listener);
    }
    onUpdated(listener: OnUpdated) {
        this.onUpdatedListeners.push(listener);
    }

    notifyUpdating(kind: string[]) {
        for (const listener of this.onUpdatingListeners) {
            listener(kind);
        }
    }
    
    notifyUpdated(kind: string[], beans: Bean[], endpoints: Endpoint[]) {
        for (const listener of this.onUpdatedListeners) {
            listener(kind, beans, endpoints);
        }
    }

}

const events = new Events();
export function onUpdating(listener: OnUpdating) { events.onUpdating(listener); }
export function onUpdated(listener: OnUpdated) { events.onUpdated(listener); }

export async function reloadBeans() {
    return reload([ Bean.KIND ]);
}

export async function reloadEndpoints() {
    return reload([ Endpoint.KIND ]);
}

export async function reloadAll() {
    return reload([ Bean.KIND, Endpoint.KIND ]);
}

let reloadInProgress = false;
const toReload = new Set<string>();

async function reload(kind: string[]) {
    if (reloadInProgress) {
        kind.forEach(toReload.add, toReload);
        return;
    }
    logUtils.logInfo(`[symbols] reloading workspace symbols: ${kind}`);
    reloadInProgress = true;
    if (isBeanKind(kind)) {
        await vscode.commands.executeCommand('setContext', CONTEXT_RELOADING_BEANS, true);
    }
    if (isEndpointKind(kind)) {
        await vscode.commands.executeCommand('setContext', CONTEXT_RELOADING_ENDPOINTS, true);
    }

    try {
        events.notifyUpdating(kind);
    } catch (err) {
        logUtils.logError(`[symbols] notifyUpdating ${kind}: ${err}`);
    }

    if (isBeanKind(kind)) {
        const newBeans = await readBeans();
        beans.length = 0;
        beans.push(...newBeans);
    }

    if (isEndpointKind(kind)) {
        const newEndpoints = await readEndpoints();
        endpoints.length = 0;
        endpoints.push(...newEndpoints);
    }

    try {
        events.notifyUpdated(kind, beans, endpoints);
    } catch (err) {
        logUtils.logError(`[symbols] notifyUpdated ${kind}: ${err}`);
    }

    setTimeout(async () => {
        if (isBeanKind(kind)) {
            await vscode.commands.executeCommand('setContext', CONTEXT_RELOADING_BEANS, false);
            if (!beansInitialized) {
                beansInitialized = true;
                await vscode.commands.executeCommand('setContext', CONTEXT_BEANS_INITIALIZED, true);
            }
        }
        if (isEndpointKind(kind)) {
            await vscode.commands.executeCommand('setContext', CONTEXT_RELOADING_ENDPOINTS, false);
            if (!endpointsInitialized) {
                endpointsInitialized = true;
                await vscode.commands.executeCommand('setContext', CONTEXT_ENDPOINTS_INITIALIZED, true);
            }
        }
        logUtils.logInfo(`[symbols] reloaded workspace symbols: ${kind}`);
        reloadInProgress = false;
        if (toReload.size > 0) {
            const kinds = [...toReload];
            toReload.clear();
            reload(kinds);
        }
    }, 1);
}

async function readBeans(): Promise<Bean[]> {
    return obtainWorkspaceSymbols(PREFIX_BEANS, SourceBean);
}

async function readEndpoints(): Promise<Endpoint[]> {
    return obtainWorkspaceSymbols(PREFIX_ENDPOINTS, SourceEndpoint);
}

async function obtainWorkspaceSymbols<T extends Symbol>(ENDPOINT: typeof PREFIX_ENDPOINTS | typeof PREFIX_BEANS, constructor: new (def: string, uri: vscode.Uri, startPos: vscode.Position, endPos: vscode.Position) => T): Promise<T[]> {
    const newSymbols: T[] = [];
    const logMessageType = ENDPOINT === PREFIX_ENDPOINTS ? 'endpoint' : 'bean';
    try {
        logUtils.logInfo(`[NBLS] obtaining workspace ${logMessageType}s.`);
        const symbols: any[] = await vscode.commands.executeCommand(COMMAND_NBLS_WORKSPACE_SYMBOLS, ENDPOINT);
        logUtils.logInfo(`[NBLS] obtained workspace ${logMessageType}s: ${symbols.length}`);
        for (const symbol of symbols) {
            try {
                const name: string = symbol.name;
                const uri: vscode.Uri = vscode.Uri.parse(symbol.location?.uri);
                const startPos: vscode.Position = new vscode.Position(symbol.location?.range?.start?.line, symbol.location?.range?.start?.character);
                const endPos: vscode.Position = new vscode.Position(symbol.location?.range?.end?.line, symbol.location?.range?.end?.character);
                newSymbols.push(new constructor(name, uri, startPos, endPos));
            } catch (err) {
                logUtils.logWarning(`[symbols] WorkspaceSymbols - failed to read ${logMessageType}: ${symbol.def}: ${err}`);
            }
        }
    } catch (err) {
        logUtils.logError(`[symbols] WorkspaceSymbols - failed to read ${logMessageType}s: ${err}`);
    }
    newSymbols.sort((o1, o2) => o1.def.localeCompare(o2.def));
    return newSymbols;
}

export function byWorkspaceFolder(symbols: Symbol[]): any {
    const byWorkspaceFolder: any = {};

    for (const symbol of symbols) {
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(symbol.uri);
        if (workspaceFolder) {
            const workspaceFolderPath = workspaceFolder.uri.fsPath;
            if (!byWorkspaceFolder[workspaceFolderPath]) {
                byWorkspaceFolder[workspaceFolderPath] = [];
            }
            byWorkspaceFolder[workspaceFolderPath].push(symbol);
        }
    }

    return byWorkspaceFolder;
}
