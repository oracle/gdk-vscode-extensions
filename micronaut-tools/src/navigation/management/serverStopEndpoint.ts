/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as applications from '../applications';
import * as rest from '../rest';
import * as beanHandler from './beanHandler';


const RELATIVE_ADDRESS = '/stop';
const AVAILABLE_CODE = 405; // Method Not Allowed (only POST supported)

export function forApplication(application: applications.Application) {
    return new ServerStopEndpoint(application);
}

export class ServerStopEndpoint extends beanHandler.BeanHandler {

    constructor(application: applications.Application) {
        super(application, RELATIVE_ADDRESS, AVAILABLE_CODE)
    }

    stopServer(): Promise<boolean> {
        return new Promise(resolve => {
            rest.postData(this.getAddress(), {}).then(response => {
                // console.log('>>> POST STOP')
                // console.log(response)
                if (response.code === 401) {
                    vscode.window.showErrorMessage('The user is not authorized to stop the application server.');
                }
                resolve(response.code === 200);
            }).catch(err => {
                console.log(err)
                resolve(false);
            });
        });
    }

    buildVmArgs(): string | undefined {
        // if (!this.isEnabled()) {
        //     return undefined;
        // }
        return '-Dendpoints.stop.enabled=true -Dendpoints.stop.sensitive=false';
    }

}
