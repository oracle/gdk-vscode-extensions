/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as applications from '../applications';
import * as symbols from '../symbols';
import * as beanHandler from './beanHandler';
import * as refreshEndpoint from './refreshEndpoint';
import * as serverStopEndpoint from './serverStopEndpoint';
import * as beansEndpoint from './beansEndpoint';
import * as routesEndpoint from './routesEndpoint';
import * as healthEndpoint from './healthEndpoint';
import * as metricsEndpoint from './metricsEndpoint';


export type OnFeaturesAvailableChanged = (refreshAvailable: boolean, serverStopAvailable: boolean) => void;

export function forApplication(application: applications.Application) {
    return new Management(application);
}

export class Management extends beanHandler.BeanHandler {

    private refreshEndpoint: refreshEndpoint.RefreshEndpoint;
    private serverStopEndpoint: serverStopEndpoint.ServerStopEndpoint;
    
    private beansEndpoint: beansEndpoint.BeansEndpoint;
    private routesEndpoint: routesEndpoint.RoutesEndpoint;

    private healthEndpoint: healthEndpoint.HealthEndpoint;
    private metricsEndpoint: metricsEndpoint.MetricsEndpoint;

    private symbolEvents: symbols.Events;

    constructor(application: applications.Application) {
        super(application);
        this.symbolEvents = new symbols.Events();
        this.refreshEndpoint = refreshEndpoint.forApplication(application);
        this.serverStopEndpoint = serverStopEndpoint.forApplication(application);
        this.beansEndpoint = beansEndpoint.forApplication(application);
        this.beansEndpoint.onBeansResolved(beans => {
            this.symbolEvents.notifyUpdated([symbols.Bean.KIND], beans, []);
        });
        this.routesEndpoint = routesEndpoint.forApplication(application);
        this.routesEndpoint.onEndpointsResolved(endpoints => {
            this.symbolEvents.notifyUpdated([symbols.Endpoint.KIND], [], endpoints);
        });
        this.healthEndpoint = healthEndpoint.forApplication(application);
        this.metricsEndpoint = metricsEndpoint.forApplication(application);
        application.onStateChanged(async (state, previousState) => {
            if (state === applications.State.CONNECTED_LAUNCH || state === applications.State.CONNECTED_ATTACH) {
                this.setAvailable(undefined);
                const available = [
                    this.refreshEndpoint.checkAvailable(),
                    this.serverStopEndpoint.checkAvailable(),
                    this.beansEndpoint.checkAvailable(),
                    this.routesEndpoint.checkAvailable(),
                    this.healthEndpoint.checkAvailable(),
                    this.metricsEndpoint.checkAvailable()
                ];
                Promise.all(available).then(available => {
                    const refreshEndpointAvailable = available[0];
                    // console.log('>>> refreshEndpointAvailable: ' + refreshEndpointAvailable)
                    const serverStopEndpointAvailable = available[1];
                    // console.log('>>> serverStopEndpointAvailable: ' + serverStopEndpointAvailable)
                    const beansEndpointAvailable = available[2];
                    // console.log('>>> beansEndpointAvailable: ' + beansEndpointAvailable)
                    const routesEndpointAvailable = available[3];
                    // console.log('>>> routesEndpointAvailable: ' + routesEndpointAvailable)
                    const healthEndpointAvailable = available[4];
                    // console.log('>>> healthEndpointAvailable: ' + healthEndpointAvailable)
                    const metricsEndpointAvailable = available[5];
                    // console.log('>>> metricsEndpointAvailable: ' + metricsEndpointAvailable)
                    this.setAvailable(
                        refreshEndpointAvailable ||
                        serverStopEndpointAvailable ||
                        beansEndpointAvailable ||
                        routesEndpointAvailable ||
                        healthEndpointAvailable ||
                        metricsEndpointAvailable
                    );
                    this.notifyFeaturesAvailableChanged(refreshEndpointAvailable, serverStopEndpointAvailable);
                });
            } else {
                this.refreshEndpoint.checkAvailable();
                this.serverStopEndpoint.checkAvailable();
                this.beansEndpoint.checkAvailable();
                this.routesEndpoint.checkAvailable();
                this.healthEndpoint.checkAvailable();
                this.metricsEndpoint.checkAvailable();
                this.setAvailable(false)
                if (previousState === applications.State.CONNECTED_LAUNCH || previousState === applications.State.CONNECTED_ATTACH) {
                    this.notifyFeaturesAvailableChanged(false, false);
                    this.symbolEvents.notifyUpdated([symbols.Bean.KIND, symbols.Endpoint.KIND], [], []);
                }
            }
        });
        application.onAliveTick(counter => {
            if (counter > 1) { // 1 handled by available check
                this.healthEndpoint.update();
                this.metricsEndpoint.update();
            }
        });
    }

    protected doEnable() {
        this.checkConfigured().then(configured => {
            if (configured) {
                super.doEnable();
            }
        }).catch(err => {
            console.log('Failed to configure project for Micronaut Control Panel:')
            console.log(err)
        });
    }

    getRefreshEndpoint(): refreshEndpoint.RefreshEndpoint {
        return this.refreshEndpoint;
    }

    getServerStopEndpoint(): serverStopEndpoint.ServerStopEndpoint {
        return this.serverStopEndpoint;
    }

    getHealthEndpoint(): healthEndpoint.HealthEndpoint {
        return this.healthEndpoint;
    }

    getMetricsEndpoint(): metricsEndpoint.MetricsEndpoint {
        return this.metricsEndpoint;
    }

    fakeConfiguredFlag: boolean = false;
    private async checkConfigured(): Promise<boolean> {
        // TODO:
        // https://micronaut-projects.github.io/micronaut-control-panel/snapshot/guide/#quickStart
        // --- Maven ---
        // check whether pom.xml contains these dependencies:
        // <dependency>
        //     <groupId>io.micronaut</groupId>
        //     <artifactId>micronaut-management</artifactId>
        //     <scope>runtime</scope> ??
        // </dependency>
        // <dependency>
        //     <groupId>io.micrometer</groupId>
        //     <artifactId>micrometer-core</artifactId>
        //     <scope>runtime</scope> ??
        // </dependency>
        // <dependency>
        //     <groupId>io.micronaut.micrometer</groupId>
        //     <artifactId>micronaut-micrometer-core</artifactId>
        //     <scope>runtime</scope> ??
        // </dependency>
        // --- Gradle ---
        // check whether ... TBD

        if (!this.fakeConfiguredFlag) {
            const updateDependenciesOption = 'Update Dependencies';
            const cancelOption = 'Cancel';
            const selected = await vscode.window.showWarningMessage('Project dependencies must be updated to enable this functionality.', updateDependenciesOption, cancelOption);
            if (selected === updateDependenciesOption) {
                this.fakeConfiguredFlag = true;
                return true;
            } else {
                return false;
            }
        } else {
            return true;
        }
    }

    buildVmArgs(): string | undefined {
        if (!this.isEnabled()) {
            return undefined;
        }
        const vmArgs: string[] = [];
        
        const refreshEndpointVmArgs = this.refreshEndpoint.buildVmArgs();
        if (refreshEndpointVmArgs) {
            vmArgs.push(refreshEndpointVmArgs);
        }

        const serverStopEndpointVmArgs = this.serverStopEndpoint.buildVmArgs();
        if (serverStopEndpointVmArgs) {
            vmArgs.push(serverStopEndpointVmArgs);
        }

        const beansEndpointVmArgs = this.beansEndpoint.buildVmArgs();
        if (beansEndpointVmArgs) {
            vmArgs.push(beansEndpointVmArgs);
        }

        const routesEndpointVmArgs = this.routesEndpoint.buildVmArgs();
        if (routesEndpointVmArgs) {
            vmArgs.push(routesEndpointVmArgs);
        }

        const healthEndpointVmArgs = this.healthEndpoint.buildVmArgs();
        if (healthEndpointVmArgs) {
            vmArgs.push(healthEndpointVmArgs);
        }

        const metricsEndpointVmArgs = this.metricsEndpoint.buildVmArgs();
        if (metricsEndpointVmArgs) {
            vmArgs.push(metricsEndpointVmArgs);
        }

        return vmArgs.length ? vmArgs.join(' ') : undefined;
    }

    private readonly onFeaturesAvailableChangedListeners: OnFeaturesAvailableChanged[] = [];

    onFeaturesAvailableChanged(listener: OnFeaturesAvailableChanged) {
        this.onFeaturesAvailableChangedListeners.push(listener);
    }

    private notifyFeaturesAvailableChanged(refreshAvailable: boolean, serverStopAvailable: boolean) {
        for (const listener of this.onFeaturesAvailableChangedListeners) {
            listener(refreshAvailable, serverStopAvailable);
        }
    }

    onRuntimeSymbolsUpdated(listener: symbols.OnUpdated) {
        this.symbolEvents.onUpdated(listener);
    }

}
