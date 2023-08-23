/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as logUtils from '../logUtils';


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
    constructor(
        readonly def: string,
        readonly uri: vscode.Uri,
        readonly startPos: vscode.Position,
        readonly endPos: vscode.Position
    ) {}
}

export class Bean extends Symbol {
    static KIND = 'BEAN';
}

export class Endpoint extends Symbol {
    static KIND = 'ENDPOINT';

    static TYPE_GET = 'GET';
    static TYPE_POST = 'POST';
    static TYPE_PATCH = 'PATCH';
    static TYPE_PUT = 'PUT';
    static TYPE_DELETE = 'DELETE';
    static TYPE_ERROR = 'ERROR';
    static TYPE_UNKNOWN = 'UNKNOWN';

    readonly name: string;
    readonly type: string;

    constructor(def: string, uri: vscode.Uri, startPos: vscode.Position, endPos: vscode.Position) {
        super(def, uri, startPos, endPos);
        this.name = Endpoint.nameFromDef(def);
        this.type = Endpoint.typeFromDef(def);
    }

    static nameFromDef(def: string): string {
        let name = def.substring('@'.length);
        const nameEndIdx = name.indexOf(' -- ');
        return name.substring(0, nameEndIdx);
    }

    static typeFromDef(def: string): string {
        if (def.endsWith(' -- GET')) {
            return Endpoint.TYPE_GET;
        }
        if (def.endsWith(' -- POST')) {
            return Endpoint.TYPE_POST;
        }
        if (def.endsWith(' -- PATCH')) {
            return Endpoint.TYPE_PATCH;
        }
        if (def.endsWith(' -- PUT')) {
            return Endpoint.TYPE_PUT;
        }
        if (def.endsWith(' -- DELETE')) {
            return Endpoint.TYPE_DELETE;
        }
        if (def.endsWith(' -- ERROR')) {
            return Endpoint.TYPE_ERROR;
        }
        return Endpoint.TYPE_UNKNOWN;
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
let endpointsInitialized: boolean = false;

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

async function reload(kind: string[]) {
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
                await vscode.commands.executeCommand('setContext', CONTEXT_ENDPOINTS_INITIALIZED, true);
            }
        }
    }, 1);
}

async function readBeans(): Promise<Bean[]> {
    const newBeans: Bean[] = [];
    try {
        const beans: any[] = await vscode.commands.executeCommand(COMMAND_NBLS_WORKSPACE_SYMBOLS, PREFIX_BEANS);
        for (const bean of beans) {
            try {
                const name: string = bean.name;
                const uri: vscode.Uri = vscode.Uri.parse(bean.location?.uri);
                const startPos: vscode.Position = new vscode.Position(bean.location?.range?.start?.line, bean.location?.range?.start?.character);
                const endPos: vscode.Position = new vscode.Position(bean.location?.range?.end?.line, bean.location?.range?.end?.character);
                newBeans.push(new Bean(name, uri, startPos, endPos));
            } catch (err) {
                logUtils.logWarning(`[symbols] readBeans - failed to read bean: ${err}`);
            }
        }
    } catch (err) {
        logUtils.logError(`[symbols] readBeans - failed to read beans: ${err}`);
    }
    newBeans.sort((o1, o2) => o1.def.localeCompare(o2.def));
    return newBeans;
}

async function readEndpoints(): Promise<Endpoint[]> {
    const newEndpoints: Endpoint[] = [];
    try {
        const endpoints: any[] = await vscode.commands.executeCommand(COMMAND_NBLS_WORKSPACE_SYMBOLS, PREFIX_ENDPOINTS);
        for (const endpoint of endpoints) {
            try {
                const name: string = endpoint.name;
                const uri: vscode.Uri = vscode.Uri.parse(endpoint.location?.uri);
                const startPos: vscode.Position = new vscode.Position(endpoint.location?.range?.start?.line, endpoint.location?.range?.start?.character);
                const endPos: vscode.Position = new vscode.Position(endpoint.location?.range?.end?.line, endpoint.location?.range?.end?.character);
                newEndpoints.push(new Endpoint(name, uri, startPos, endPos));
            } catch (err) {
                logUtils.logWarning(`[symbols] readEndpoints - failed to read endpoint: ${err}`);
            }
        }
    } catch (err) {
        logUtils.logError(`[symbols] readEndpoints - failed to read endpoints: ${err}`);
    }
    newEndpoints.sort((o1, o2) => o1.def.localeCompare(o2.def));
    return newEndpoints;
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
