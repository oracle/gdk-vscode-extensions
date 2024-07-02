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


const SETTING_ENABLED_KEY = 'refreshEndpointEnabled';
const RELATIVE_ADDRESS = '/refresh';
const AVAILABLE_CODE = 405; // Method Not Allowed (only POST supported)

export function forApplication(application: applications.Application) {
    return new RefreshEndpoint(application);
}

export class RefreshEndpoint extends beanHandler.BeanHandler {

    constructor(application: applications.Application) {
        super(application, SETTING_ENABLED_KEY, RELATIVE_ADDRESS, AVAILABLE_CODE);
    }

    async refresh(): Promise<boolean> {
        const refreshOption = 'Refresh';
        const forceRefreshOption = 'Force Refresh';
        const cancelOption = 'Cancel';
        const selectedOption = await vscode.window.showInformationMessage('Refreshing the application state will cause all Refreshable beans in the context to be destroyed and re-instantiated upon further requests. Confirm to proceed:', refreshOption, forceRefreshOption, cancelOption);
        if (selectedOption === refreshOption || selectedOption === forceRefreshOption) {
            return new Promise(resolve => {
                const data: any = {};
                if (selectedOption === forceRefreshOption) {
                    data.force = true;
                }
                rest.postData(this.getAddress(), data).then(response => {
                    // console.log('>>> POST REFRESH')
                    // console.log(response)
                    if (response.code === 401) {
                        vscode.window.showErrorMessage('The user is not authorized to refresh the application state.');
                    } else if (response.code === 200) {
                        vscode.window.showInformationMessage('Application state has been refreshed.');
                    }
                    resolve(response.code === 200);
                }).catch(err => {
                    console.log(err);
                    resolve(false);
                });
            });
        } else {
            return false;
        }
    }

    buildVmArgs(): string[] | undefined {
        // if (!this.isEnabled()) {
        //     return undefined;
        // }
        return ['-Dendpoints.refresh.enabled=true', '-Dendpoints.refresh.sensitive=false'];
    }

}
