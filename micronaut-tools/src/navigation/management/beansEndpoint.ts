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


const RELATIVE_ADDRESS = '/beans';

export type OnBeansResolved = (beans: symbols.Bean[]) => void;

export function forApplication(application: applications.Application) {
    return new BeansEndpoint(application);
}

export class BeansEndpoint extends beanHandler.BeanHandler {

    constructor(application: applications.Application) {
        super(application, RELATIVE_ADDRESS)
    }

    protected async getData(): Promise<{ code: number | undefined; headers: any; data: any }> {
        return rest.getDataRetry(this.getAddress());
    }

    protected async processResponse(response: { code: number | undefined; headers: any; data: any }) {
        // console.log('>>> BEANS PROCESS RESPONSE')
        const beans = JSON.parse(response.data).beans;
        const resolved: symbols.Bean[] = [];
        for (const beanKey of Object.keys(beans)) {
            const bean = beans[beanKey];
            const beanType = bean.type;
            resolved.push(new RuntimeBean(beanKey, beanType, this.application));
            // if (('' + beanType).startsWith('com.example')) {
            //     console.log('>>> --- BEAN: ----------------------' + beanKey)
            //     console.log(bean)
            //     console.log(new RuntimeBean(beanKey, beanType, this.application))
            // }
        }
        // console.log('>>> BEANS notifyBeansResolved')
        this.notifyBeansResolved(resolved);
    }

    buildVmArgs(): string | undefined {
        // if (!this.isEnabled()) {
        //     return undefined;
        // }
        return '-Dendpoints.beans.enabled=true -Dendpoints.beans.sensitive=false';
    }

    private readonly onBeansResolvedListeners: OnBeansResolved[] = [];

    onBeansResolved(listener: OnBeansResolved) {
        this.onBeansResolvedListeners.push(listener);
    }

    private notifyBeansResolved(beans: symbols.Bean[]) {
        for (const listener of this.onBeansResolvedListeners) {
            listener(beans);
        }
    }

}

class RuntimeBean extends symbols.Bean {

    constructor(key: string, type: string, application: applications.Application) {
        super(
            RuntimeBean.defFromKeyType(key, type),
            RuntimeBean.nameFromType(type),
            RuntimeBean.descriptionFromTypeApplication(type, application),
            RuntimeBean.uriFromTypeApplication(type, application),
            RuntimeBean.NO_POSITION,
            RuntimeBean.NO_POSITION
        );
    }

    static defFromKeyType(key: string, type: string): string {
        return `${key}|${type}`;
    }

    static nameFromType(type: string): string {
        const parts = type.split('.');
        const name = parts[parts.length - 1];
        return name[0].toLowerCase() + name.slice(1);
    }

    static descriptionFromTypeApplication(type: string, application: applications.Application): string {
        const uri = RuntimeBean.uriFromTypeApplication(type, application);
        return vscode.workspace.asRelativePath(uri, false);
    }

    static uriFromTypeApplication(type: string, application: applications.Application): vscode.Uri {
        const parts = type.split('.');
        const controllerPath = path.join('src', 'main', 'java', ...parts) + '.java';
        // TODO: fake path, exact src location missing!
        return vscode.Uri.joinPath(application.getFolder().uri, controllerPath);
    }

}
