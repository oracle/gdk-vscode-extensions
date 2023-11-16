/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as applications from '../applications';
// import * as rest from '../rest';
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

    protected async processResponse(response: { code: number | undefined; headers: any; data: any }) {
        // console.log('>>> BEANS PROCESS RESPONSE')
        // console.log(JSON.parse(response.data))
        const resolved: symbols.Bean[] = [];
        const data = JSON.parse(response.data);
        const available = data.beans;
        for (const beanKey of Object.keys(available)) {
            const bean = available[beanKey];
            const beanType = bean.type;
            resolved.push(new RuntimeBean(beanKey, beanType, undefined, this.application));
        }
        const disabled = data.disabled;
        for (const bean of disabled) {
            const beanType = bean.type;
            const disabledReasons = bean.reasons;
            resolved.push(new RuntimeBean(beanType, beanType, disabledReasons, this.application));
        }
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

    readonly disabledReasons: string[] | undefined;

    constructor(key: string, type: string, disabledReasons: string[] | undefined, application: applications.Application) {
        super(
            RuntimeBean.defFromKeyType(key, type),
            RuntimeBean.nameFromType(type),
            RuntimeBean.descriptionFromTypeApplication(type, application),
            RuntimeBean.uriFromTypeApplication(type, application),
            RuntimeBean.NO_POSITION,
            RuntimeBean.NO_POSITION
        );
        this.disabledReasons = disabledReasons;
    }

    static defFromKeyType(key: string, type: string): string {
        return `${key}|${type}`;
    }

    static nameFromType(type: string): string {
        const parts = type.split('.');
        let name = parts[parts.length - 1];
        const definitionIdx = name.indexOf('$Definition');
        if (definitionIdx > 0 && name.startsWith('$')) {
            name = name.substring('$'.length, definitionIdx);
        }
        return name[0].toLowerCase() + name.slice(1);
    }

    static descriptionFromTypeApplication(type: string, application: applications.Application): string {
        const uri = RuntimeBean.uriFromTypeApplication(type, application);
        return vscode.workspace.asRelativePath(uri, false);
    }

    static uriFromTypeApplication(type: string, application: applications.Application): vscode.Uri {
        const parts = type.split('.');
        const name = parts[parts.length - 1];
        const definitionIdx = name.indexOf('$Definition');
        if (definitionIdx > 0 && name.startsWith('$')) {
            parts[parts.length - 1] = name.substring('$'.length, definitionIdx);
        }
        const controllerPath = path.join('src', 'main', 'java', ...parts) + '.java';
        // TODO: fake path, exact src location missing!
        return vscode.Uri.joinPath(application.getFolder().uri, controllerPath);
    }

}
