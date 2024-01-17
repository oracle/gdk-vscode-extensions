/*
 * Copyright (c) 2023, 2024, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as applications from '../applications';
import * as settings from '../settings';
import * as rest from '../rest';


export type OnEnabledChanged = (enabled: boolean) => void;
export type OnAvailableChanged = (available: boolean | undefined) => void;

export abstract class BeanHandler {

    private readonly settingsAvailableKey: string;
    protected readonly application: applications.Application;

    public readonly relativeAddress: string | undefined;
    protected readonly availableCode: number;

    private enabled: boolean = false;
    private available: boolean | undefined = false;

    protected constructor(application: applications.Application, settingsAvailableKey: string, relativeAddress: string | undefined = undefined, availableCode: number = 200) {
        this.application = application;
        this.settingsAvailableKey = settingsAvailableKey;
        this.relativeAddress = relativeAddress;
        this.availableCode = availableCode;

        // Restore the enabled state "later" as it calls doEnable() / doDisable() overriden by the subclasses
        setTimeout(() => {
            const moduleUri = application.getSelectedModule().getUri();
            this.loadFromUri(moduleUri); // primarily to update the UI - any dependency checks will be performed for 'onModuleChanged' below
            application.getSelectedModule().onModuleChanged((_singleModule, uri) => {
                this.loadFromUri(uri);
            });
        }, 0);
    }

    getAddress(): string {
        return this.application.getAddress() + (this.relativeAddress ? this.relativeAddress : '');
    }

    isEnabled(): boolean {
        return this.enabled;
    }

    setEnabled(enabled: boolean, forceSet: boolean = false) {
        if (this.enabled !== enabled || forceSet) {
            if (enabled) {
                this.doEnable();
            } else {
                this.doDisable();
            }
        }
    }

    private loadFromUri(moduleUri: vscode.Uri | undefined) {
        const persistedEnabled = moduleUri ? settings.getForUri<boolean>(moduleUri, this.settingsAvailableKey) === true : false;
        if (persistedEnabled) {
            this.doEnable(true);
        } else {
            this.doDisable(true);
        }
    }

    protected doEnable(_restoringPersisted: boolean = false) {
        this.enabled = true;
        this.notifyEnabledChanged();
        const moduleUri = this.application.getSelectedModule().getUri();
        if (moduleUri) {
            settings.setForUri(moduleUri, this.settingsAvailableKey, true);
        }
    }

    protected doDisable(_restoringPersisted: boolean = false) {
        this.enabled = false;
        this.notifyEnabledChanged();
        const moduleUri = this.application.getSelectedModule().getUri();
        if (moduleUri) {
            settings.setForUri(moduleUri, this.settingsAvailableKey, undefined);
        }
    }

    isAvailable(): boolean | undefined {
        return this.available;
    }

    protected setAvailable(available: boolean | undefined) {
        if (this.available !== available) {
            this.available = available;
            this.notifyAvailableChanged();
        }
    }

    async checkAvailable(state?: applications.State): Promise<boolean> {
        state = state || this.application.getState();
        if (!applications.isConnected(state)) {
            this.setAvailable(false);
            return false;
        }
        this.setAvailable(undefined);
        return new Promise(resolve => {
            this.getData().then(response => {
                const available = this.availableResp(response);
                this.setAvailable(available);
                resolve(available);
                if (available) {
                    this.processResponse(response);
                }
            }).catch(err => {
                console.log(err);
                this.setAvailable(false);
                resolve(false);
            });
        });
    }

    protected availableResp(response: { code: number | undefined; headers: any; data: any }): boolean {
        return response.code === this.availableCode;
    }

    protected async getData(): Promise<{ code: number | undefined; headers: any; data: any }> {
        return rest.getDataRetry(this.getAddress());
    }

    protected async processResponse(_response: { code: number | undefined; headers: any; data: any }) {}

    buildVmArgs(): string | undefined {
        return undefined;
    }

    private readonly onEnabledChangedListeners: OnEnabledChanged[] = [];
    private readonly onAvailableChangedListeners: OnAvailableChanged[] = [];

    onEnabledChanged(listener: OnEnabledChanged) {
        this.onEnabledChangedListeners.push(listener);
    }

    onAvailableChanged(listener: OnAvailableChanged) {
        this.onAvailableChangedListeners.push(listener);
    }

    private notifyEnabledChanged() {
        for (const listener of this.onEnabledChangedListeners) {
            listener(this.enabled);
        }
    }

    private notifyAvailableChanged() {
        for (const listener of this.onAvailableChangedListeners) {
            listener(this.available);
        }
    }

}

export type OnUpdated = (data: any) => void;

export abstract class UpdatableBeanHandler extends BeanHandler {

    async update(): Promise<boolean> {
        return new Promise(resolve => {
            if (!this.isAvailable()) {
                resolve(false);
            } else {
                this.getData().then(response => {
                    this.processResponse(response).then(() => {
                        resolve(true);
                    }).catch(err => {
                        console.log(err);
                        this.setAvailable(false);
                        resolve(false);
                    });
                }).catch(err => {
                    console.log(err);
                    this.setAvailable(false);
                    resolve(false);
                });
            }
        });
    }

    private readonly onUpdatedListeners: OnUpdated[] = [];

    onUpdated(listener: OnUpdated) {
        this.onUpdatedListeners.push(listener);
    }

    protected notifyUpdated(data: any) {
        if (this.isAvailable()) {
            for (const listener of this.onUpdatedListeners) {
                listener(data);
            }
        }
    }

}
