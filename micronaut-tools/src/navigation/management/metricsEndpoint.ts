/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as rest from '../rest';
import * as applications from '../applications';
import * as beanHandler from './beanHandler';

const RELATIVE_ADDRESS = '/metrics';

export const MEMORY_MAX_HEAP = 'jvm.memory.max?tag=area:heap';
export const MEMORY_USED_HEAP = 'jvm.memory.used?tag=area:heap';
export const MEMORY_MAX_NONHEAP = 'jvm.memory.max?tag=area:nonheap';
export const MEMORY_USED_NONHEAP = 'jvm.memory.used?tag=area:nonheap';
export const PROCESS_UPTIME = 'process.uptime';
export const PROCESS_CPU = 'process.cpu.usage';
export const SYSTEM_CPU = 'system.cpu.usage';

const MONITORED_METRICS = [
    MEMORY_MAX_HEAP,
    MEMORY_USED_HEAP,
    MEMORY_MAX_NONHEAP,
    MEMORY_USED_NONHEAP,
    PROCESS_UPTIME,
    PROCESS_CPU,
    SYSTEM_CPU
]

export function forApplication(application: applications.Application) {
    return new MetricsEndpoint(application);
}

export class MetricsEndpoint extends beanHandler.UpdatableBeanHandler {

    constructor(application: applications.Application) {
        super(application, RELATIVE_ADDRESS)
    }

    // protected async processResponse(response: { code: number | undefined; headers: any; data: any }) {
    //     console.log('-------- METRICS ---------------------')
    //     const data = JSON.parse(response.data);
    //     this.notifyUpdated(data);
    //     console.log(data)
    // }

    protected async getData(metric?: string): Promise<{ code: number | undefined; headers: any; data: any }> {
        return rest.getDataRetry(this.getAddress() + (metric ? `/${metric}` : ''));
    }

    async update(): Promise<boolean> {
        return new Promise(resolve => {
            if (!this.isAvailable()) {
                resolve(false);
            } else {
                const promises = [];
                for (const metric of MONITORED_METRICS) {
                    promises.push(this.getData(metric));
                }
                Promise.all(promises).then(responses => {
                    const data: any = {};
                    for (let i = 0; i < MONITORED_METRICS.length; i++) {
                        data[MONITORED_METRICS[i]] = JSON.parse(responses[i].data);
                    }
                    this.notifyUpdated(data);
                    // console.log('>>> --- METRICS --- <<<')
                    // console.log(data)
                    resolve(true);
                }).catch(err => {
                    console.log(err)
                    this.setAvailable(false);
                    resolve(false);
                });
                // this.getData().then(response => {
                //     this.processResponse(response).then(() => {
                //         resolve(true);
                //     }).catch(err => {
                //         console.log(err)
                //         this.setAvailable(false);
                //         resolve(false);
                //     });
                // }).catch(err => {
                //     console.log(err)
                //     this.setAvailable(false);
                //     resolve(false);
                // });
            }
        });
    }

    buildVmArgs(): string | undefined {
        // if (!this.isEnabled()) {
        //     return undefined;
        // }
        return '-Dendpoints.metrics.enabled=true -Dendpoints.metrics.sensitive=false -Dmicronaut.metrics.enabled=true -Dmicronaut.metrics.binders.jvm.enabled=true';
    }

}