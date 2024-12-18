/*
 * Copyright (c) 2023, 2024, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as net from 'net';
import * as process from 'process';
import * as logUtils from '../../../common/lib/logUtils';


export type OnReachable = (reachableCount: number) => void;
export type OnUnreachable = (unreachableCount: number) => void;

export function forAddress(plainAddress: string): Host {
    const portIdx = plainAddress.lastIndexOf(':');
    const hostAddr = plainAddress.substring(0, portIdx);
    const hostPort = Number.parseInt(plainAddress.substring(portIdx + 1));
    return new Host(hostAddr, hostPort);
}

async function touchHost(hostString: string, hostPort: number, timeout: number): Promise<number | undefined | null> {
    return new Promise(resolve => {
        logUtils.logInfo(`[hosts] Touching host ${hostString}:${hostPort}...`);
        const socket = new net.Socket();
        socket.setTimeout(timeout);
        socket.on('connect', () => {
            const time = process.hrtime(start);
            logUtils.logInfo(`[hosts] Touched ${hostString}:${hostPort}`);
            resolve(time[0] * 1000000000 + time[1]);
            socket.destroy();
        });
        socket.on('error', () => {
            logUtils.logInfo(`[hosts] Error touching host ${hostString}:${hostPort}`);
            resolve(null);
        });
        socket.on('timeout', () => {
            logUtils.logInfo(`[hosts] Timeout touching host ${hostString}:${hostPort}`);
            resolve(undefined);
        });
        const start = process.hrtime();
        socket.connect(hostPort, hostString);
    });
}

export class Host {
    
    public readonly addr: string;
    public readonly port: number;

    private counter: number = 0;
    private rate: number = 1000;
    private timeout: number = 1000;

    private monitoringId: number = 0;

    constructor(addr: string, port: number) {
        if (port < 0 || port > 65535) {
            throw new Error(`Host port is out of range: ${port}`);
        }

        this.addr = addr;
        this.port = port;
    }

    public startMonitoring(rate: number, timeout: number) {
        this.rate = rate;
        this.timeout = timeout;
        if (this.monitoringId === 0) {
            this.counter = 0;
            this.monitoringId = Date.now();
            this.monitor(this.monitoringId);
        }
    }

    public stopMonitoring() {
        this.monitoringId = 0;
    }

    public onReachable(listener: OnReachable) {
        this.onReachableListeners.push(listener);
    }

    public onUnreachable(listener: OnUnreachable) {
        this.onUnreachableListeners.push(listener);
    }

    public async isReachable(timeout: number): Promise<boolean> {
        return new Promise(resolve => {
            touchHost(this.addr, this.port, timeout).then(response => {
                resolve(response !== undefined && response !== null);
            });
        });
    }

    private readonly onReachableListeners: OnReachable[] = [];
    private readonly onUnreachableListeners: OnUnreachable[] = [];

    wasReachable() {
        this.counter = this.counter <= 0 ? 1 : this.counter + 1;
        for (const listener of this.onReachableListeners) {
            listener(this.counter);
        }
    }

    wasUnreachable() {
        this.counter = this.counter >= 0 ? -1 : this.counter - 1;
        for (const listener of this.onUnreachableListeners) {
            listener(-this.counter);
        }
    }

    monitor(monitoringId: number) {
        if (this.monitoringId === monitoringId) {
            this.isReachable(this.timeout).then(reachable => {
                if (this.monitoringId === monitoringId) {
                    if (reachable) {
                        this.wasReachable();
                    } else {
                        this.wasUnreachable();
                    }
                    setTimeout(() => {
                        this.monitor(monitoringId);
                    }, this.rate);
                }
            });
            // touchHost(this.addr, this.port, this.timeout).then(response => {
            //     if (this.monitoringId === monitoringId) {
            //         if (response === undefined || response === null) {
            //             this.wasUnreachable();
            //         } else {
            //             this.wasReachable();
            //         }
            //         setTimeout(() => {
            //             this.touch(monitoringId);
            //         }, this.rate);
            //     }
            // });
        }
    }

}
