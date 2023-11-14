/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as applications from '../applications';
import * as rest from '../rest';


export type OnEnabledChanged = (enabled: boolean) => void;
export type OnAvailableChanged = (available: boolean | undefined) => void;

export abstract class BeanHandler {

    protected readonly application: applications.Application;

    protected readonly relativeAddress: string | undefined;
    protected readonly availableCode: number;

    private enabled: boolean = false;
    private available: boolean | undefined = false;

    protected constructor(application: applications.Application, relativeAddress: string | undefined = undefined, availableCode: number = 200) {
        this.application = application;
        this.relativeAddress = relativeAddress;
        this.availableCode = availableCode;
    }

    getAddress(): string {
        return this.application.getAddress() + (this.relativeAddress ? this.relativeAddress : '');
    }

    isEnabled(): boolean {
        return this.enabled;
    }

    setEnabled(enabled: boolean) {
        if (this.enabled !== enabled) {
            if (enabled) {
                this.doEnable();
            } else {
                this.doDisable();
            }
        }
    }

    protected doEnable() {
        this.enabled = true;
        this.notifyEnabledChanged();
    }

    protected doDisable() {
        this.enabled = false;
        this.notifyEnabledChanged();
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
        if (state !== applications.State.CONNECTED_LAUNCH && state !== applications.State.CONNECTED_ATTACH) {
            this.setAvailable(false);
            return false;
        }
        this.setAvailable(undefined);
        return new Promise(resolve => {
            this.getData().then(response => {
                // console.log('>>> PROCESS RESPONSE')
                // console.log(this)
                // console.log(response)
                const available = response.code === this.availableCode;
                this.setAvailable(available);
                resolve(available);
                if (available) {
                    this.processResponse(response);
                }
            }).catch(err => {
                console.log(err)
                this.setAvailable(false);
                resolve(false);
            });
        });
    }

    protected async getData(): Promise<{ code: number | undefined; headers: any; data: any }> {
        return rest.getDataRetry(this.getAddress());
    }

    protected async processResponse(response: { code: number | undefined; headers: any; data: any }) {}

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
                        console.log(err)
                        this.setAvailable(false);
                        resolve(false);
                    });
                }).catch(err => {
                    console.log(err)
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
