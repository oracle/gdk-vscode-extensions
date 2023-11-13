/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as applications from '../applications';
import * as rest from '../rest';
import * as symbols from '../symbols';
import * as beanHandler from './beanHandler';


const RELATIVE_ADDRESS = '/routes';

export type OnEndpointsResolved = (beans: symbols.Endpoint[]) => void;

export function forApplication(application: applications.Application) {
    return new RoutesEndpoint(application);
}

export class RoutesEndpoint extends beanHandler.BeanHandler {

    constructor(application: applications.Application) {
        super(application, RELATIVE_ADDRESS)
    }

    protected async getData(): Promise<{ code: number | undefined; headers: any; data: any }> {
        return rest.getDataRetry(this.getAddress());
    }

    protected async processResponse(response: { code: number | undefined; headers: any; data: any }) {
        const routes = JSON.parse(response.data);
        const resolved: symbols.Endpoint[] = [];
        for (const routeKey of Object.keys(routes)) {
            const route = routes[routeKey];
            const routeMethod = route.method;
            resolved.push(new RuntimeEndpoint(routeKey, routeMethod, this.application));
            // if (('' + routeMethod).includes('com.example')) {
            //     console.log('>>> --- ROUTE: ----------------------' + routeKey)
            //     console.log(route)
            //     console.log(new RuntimeEndpoint(routeKey, routeMethod, this.application))
            // }
        }
        this.notifyEndpointsResolved(resolved);
    }

    buildVmArgs(): string | undefined {
        // if (!this.isEnabled()) {
        //     return undefined;
        // }
        return '-Dendpoints.routes.enabled=true -Dendpoints.routes.sensitive=false';
    }

    private readonly onEndpointsResolvedListeners: OnEndpointsResolved[] = [];

    onEndpointsResolved(listener: OnEndpointsResolved) {
        this.onEndpointsResolvedListeners.push(listener);
    }

    private notifyEndpointsResolved(endpoints: symbols.Endpoint[]) {
        for (const listener of this.onEndpointsResolvedListeners) {
            listener(endpoints);
        }
    }

}

class RuntimeEndpoint extends symbols.Endpoint {

    constructor(key: string, method: string, application: applications.Application) {
        super(
            RuntimeEndpoint.defFromKeyMethod(key, method),
            RuntimeEndpoint.nameFromKey(key),
            RuntimeEndpoint.descriptionFromMethodApplication(method, application),
            RuntimeEndpoint.typeFromKey(key),
            RuntimeEndpoint.uriFromMethodApplication(method, application),
            RuntimeEndpoint.NO_POSITION,
            RuntimeEndpoint.NO_POSITION
        );
    }

    static defFromKeyMethod(key: string, type: string): string {
        return `${key}|${type}`;
    }

    static nameFromKey(key: string): string {
        const parts = key.split(',');
        return parts[0].substring('{['.length, parts[0].length - 1);
    }

    static descriptionFromMethodApplication(method: string, application: applications.Application): string {
        const uri = RuntimeEndpoint.uriFromMethodApplication(method, application);
        return vscode.workspace.asRelativePath(uri, false);
    }

    static typeFromKey(key: string): string {
        const parts = key.split(',');
        return parts[1].substring('method=['.length, parts[1].length - 1);
    }

    static uriFromMethodApplication(method: string, application: applications.Application): vscode.Uri {
        const methodParts = method.split(' ');
        const methodNameParts = methodParts[1].split('.');
        methodNameParts.pop(); // remove method
        const controllerPath = path.join('src', 'main', 'java', ...methodNameParts) + '.java';
        // TODO: fake path, exact src location missing!
        return vscode.Uri.joinPath(application.getFolder().uri, controllerPath);
    }

}
