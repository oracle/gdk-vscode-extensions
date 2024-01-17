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


const SETTING_ENABLED_KEY = 'cachesEndpointEnabled';
const RELATIVE_ADDRESS = '/caches';

export function forApplication(application: applications.Application) {
    return new CachesEndpoint(application);
}

export class CachesEndpoint extends beanHandler.UpdatableBeanHandler {

    constructor(application: applications.Application) {
        super(application, SETTING_ENABLED_KEY, RELATIVE_ADDRESS);
    }

    clearCaches() {
        const items = new Promise<vscode.QuickPickItem[]>(resolve => {
            this.getCaches().then(data => {
                if (data) {
                    this.notifyUpdated(data);
                    const names = getNames(data);
                    const items = [];
                    if (names.length) {
                        for (const name of names) {
                            items.push({
                                label: name
                            });
                        }
                    } else {
                        items.push({
                            label: '',
                            description: 'No caches currently available'
                        });
                    }
                    resolve(items);
                } else {
                    resolve([]);
                }
            });
        });
        vscode.window.showQuickPick(items, {
            title: 'Invalidate Caches',
            placeHolder: 'Select the caches to be invalidated',
            canPickMany: true
            // ignoreFocusOut: true
        }).then(async selected => {
            if (selected?.length && selected[0].label) { // do not handle the 'No caches currently available' item
                const caches = [];
                if (selected.length === 1 || selected.length < (await items).length) {
                    for (const cache of selected) {
                        caches.push(cache.label);
                    }
                }
                const subject = caches.length === 0 ? 'All caches' : (caches.length === 1 ?  `Cache '${caches[0]}'` : `${caches.length} caches`);
                const invalidateOption = 'Invalidate';
                const cancelOption = 'Cancel';
                const selectedOption = await vscode.window.showInformationMessage(`${subject} will be invalidated. Confirm to proceed:`, invalidateOption, cancelOption);
                if (selectedOption === invalidateOption) {
                    this.deleteCaches(caches).then(success => {
                        if (success) {
                            this.update();
                            vscode.window.showInformationMessage(`${subject} ${selected.length === 1 ? 'has' : 'have'} been invalidated.`);
                        }
                    });
                }
            }
        });
    }

    private async deleteCaches(caches?: string[]): Promise<boolean> {
        if (caches?.length) {
            const cache = caches.pop();
            const deleted = await this.deleteCache(cache);
            if (!deleted) { // fails if not authorized
                return false;
            }
            const deletes = [];
            for (const cache of caches) {
                deletes.push(this.deleteCache(cache));
            }
            const success = await Promise.all(deletes);
            return success.every(Boolean);
        } else {
            return this.deleteCache();
        }
    }

    private async deleteCache(cache?: string): Promise<boolean> {
        return new Promise(resolve => {
            rest.postData(`${this.getAddress()}${cache ? '/' + cache : ''}`, {}, { method: 'DELETE' }).then(response => {
                // console.log('>>> DELETE CACHES')
                // console.log(response)
                if (response.code === 401) {
                    vscode.window.showErrorMessage('The user is not authorized to invalidate caches.');
                }
                resolve(response.code === 200);
            }).catch(err => {
                console.log(err);
                resolve(false);
            });
        });
    }

    private async getCaches(): Promise<any | undefined> {
        return new Promise(resolve => {
            if (this.isAvailable()) {
                this.getData().then(response => {
                    if (response.code === this.availableCode) {
                        const data = JSON.parse(response.data);
                        resolve(data);
                    } else {
                        this.setAvailable(false);
                        resolve(undefined);
                    }
                }).catch(err => {
                    console.log(err);
                    this.setAvailable(false);
                    resolve(undefined);
                });
            } else {
                resolve(undefined);
            }
        });
    }

    protected async processResponse(response: { code: number | undefined; headers: any; data: any }) {
        // console.log('>>> CACHES <<<')
        // console.log(JSON.parse(response.data))
        this.notifyUpdated(JSON.parse(response.data));
    }

    buildVmArgs(): string | undefined {
        // if (!this.isEnabled()) {
        //     return undefined;
        // }
        return '-Dendpoints.caches.enabled=true -Dendpoints.caches.sensitive=false -Dendpoints.caches.write-sensitive=false';
        // return '-Dendpoints.caches.enabled=true -Dendpoints.caches.sensitive=false';
    }

}

export function getNames(data: any): string[] {
    const caches = data.caches;
    return Object.keys(caches);
}
