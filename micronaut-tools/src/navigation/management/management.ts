/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as applications from '../applications';
import * as projectUtils from '../projectUtils';
import * as beanHandler from './beanHandler';
import * as refreshEndpoint from './refreshEndpoint';
import * as serverStopEndpoint from './serverStopEndpoint';
import * as environmentEndpoint from './environmentEndpoint';
import * as beansEndpoint from './beansEndpoint';
import * as routesEndpoint from './routesEndpoint';
import * as healthEndpoint from './healthEndpoint';
import * as metricsEndpoint from './metricsEndpoint';
import * as loggersEndpoint from './loggersEndpoint';
import * as cachesEndpoint from './cachesEndpoint';


const SETTING_ENABLED_KEY = 'managementMonitoringEnabled';

const REQUIRED_DEPENDENCIES: projectUtils.NbArtifactSpec[] = [
    { groupId: 'io.micronaut', artifactId: 'micronaut-management'}, // https://docs.micronaut.io/latest/guide/#management
    { groupId: 'io.micronaut.cache', artifactId: 'micronaut-cache-management'}, // https://micronaut-projects.github.io/micronaut-cache/latest/guide/index.html#endpoint
    { groupId: 'io.micrometer', artifactId: 'micrometer-core'}, // https://micrometer.io/docs/concepts#_dependencies
    { groupId: 'io.micronaut.micrometer', artifactId: 'micronaut-micrometer-core'} // https://micronaut-projects.github.io/micronaut-micrometer/latest/guide/#metricsEndpoint
]

export type OnFeaturesAvailableChanged = (refreshAvailable: boolean, serverStopAvailable: boolean) => void;

export function forApplication(application: applications.Application) {
    return new Management(application);
}

export class Management extends beanHandler.BeanHandler {

    private refreshEndpoint: refreshEndpoint.RefreshEndpoint;
    private serverStopEndpoint: serverStopEndpoint.ServerStopEndpoint;

    private environmentEndpoint: environmentEndpoint.EnvironmentEndpoint;
    
    private beansEndpoint: beansEndpoint.BeansEndpoint;
    private routesEndpoint: routesEndpoint.RoutesEndpoint;

    private healthEndpoint: healthEndpoint.HealthEndpoint;
    private metricsEndpoint: metricsEndpoint.MetricsEndpoint;

    private loggersEndpoint: loggersEndpoint.LoggersEndpoint;
    private cachesEndpoint: cachesEndpoint.CachesEndpoint;

    constructor(application: applications.Application) {
        super(application, SETTING_ENABLED_KEY);
        this.refreshEndpoint = refreshEndpoint.forApplication(application);
        this.serverStopEndpoint = serverStopEndpoint.forApplication(application);
        this.environmentEndpoint = environmentEndpoint.forApplication(application);
        this.beansEndpoint = beansEndpoint.forApplication(application);
        this.routesEndpoint = routesEndpoint.forApplication(application);
        this.healthEndpoint = healthEndpoint.forApplication(application);
        this.metricsEndpoint = metricsEndpoint.forApplication(application);
        this.loggersEndpoint = loggersEndpoint.forApplication(application);
        this.cachesEndpoint = cachesEndpoint.forApplication(application);
        application.onStateChanged(async (state, previousState) => {
            if (applications.isConnected(state)) {
                this.setAvailable(undefined);
                const available = [
                    this.refreshEndpoint.checkAvailable(),
                    this.serverStopEndpoint.checkAvailable(),
                    this.environmentEndpoint.checkAvailable(),
                    this.beansEndpoint.checkAvailable(),
                    this.routesEndpoint.checkAvailable(),
                    this.healthEndpoint.checkAvailable(),
                    this.metricsEndpoint.checkAvailable(),
                    this.loggersEndpoint.checkAvailable(),
                    this.cachesEndpoint.checkAvailable()
                ];
                Promise.all(available).then(available => {
                    const refreshEndpointAvailable = available[0];
                    const serverStopEndpointAvailable = available[1];
                    const environmentEndpoint = available[2];
                    const beansEndpointAvailable = available[3];
                    const routesEndpointAvailable = available[4];
                    const healthEndpointAvailable = available[5];
                    const metricsEndpointAvailable = available[6];
                    const loggersEndpointAvailable = available[7];
                    const cachesEndpointAvailable = available[8];
                    this.setAvailable(
                        refreshEndpointAvailable ||
                        serverStopEndpointAvailable ||
                        environmentEndpoint ||
                        beansEndpointAvailable ||
                        routesEndpointAvailable ||
                        healthEndpointAvailable ||
                        metricsEndpointAvailable ||
                        loggersEndpointAvailable ||
                        cachesEndpointAvailable
                    );
                    this.notifyFeaturesAvailableChanged(refreshEndpointAvailable, serverStopEndpointAvailable);
                });
            } else {
                this.refreshEndpoint.checkAvailable();
                this.serverStopEndpoint.checkAvailable();
                this.environmentEndpoint.checkAvailable();
                this.beansEndpoint.checkAvailable();
                this.routesEndpoint.checkAvailable();
                this.healthEndpoint.checkAvailable();
                this.metricsEndpoint.checkAvailable();
                this.loggersEndpoint.checkAvailable();
                this.cachesEndpoint.checkAvailable();
                this.setAvailable(false)
                if (applications.isConnected(previousState)) {
                    this.notifyFeaturesAvailableChanged(false, false);
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

    editEnabled() {
        const items: vscode.QuickPickItem[] = [];
        items.push({
            label: 'Enabled',
            detail: 'Always enabled, independent on the current project configuration.'
        });
        items.push({
            label: 'By Project',
            detail: 'Enabled or not available, based on the current the project configuration.'
        });
        vscode.window.showQuickPick(items, {
            title: 'Monitoring & Management Availability',
            placeHolder: 'Select Monitoring & Management availability for the launched application'
        }).then(selected => {
            if (selected) {
                this.setEnabled(selected === items[0]);
            }
        })
    }

    protected doEnable(restoringPersisted: boolean) {
        projectUtils.dependencyCheckingAvailable().then(available => {
            if (available || !restoringPersisted) { // restoring persisted state on startup with NBLS ready to report the dependencies, or setting enabled later
                this.checkConfigured(!restoringPersisted).then(configured => { // will (intentionally) throw exception if NBLS not ready to report the dependencies
                    if (configured) {
                        super.doEnable();
                    } else {
                        super.doDisable(); // silently disable when (restoring persisted state and) dependencies not available
                    }
                }).catch(err => {
                    console.log('Failed to configure project for Monitoring & Management: ' + err)
                    console.log(err)
                });
            } else { // restoring persisted state on startup while NBLS not ready yet to report the dependencies
                super.doEnable();
            }
        });
    }

    private async checkConfigured(addMissing: boolean): Promise<boolean> {
        const moduleUri = this.application.getSelectedModule().getUri();
        return moduleUri ? projectUtils.checkConfigured(moduleUri, 'Monitoring & Management', addMissing, ...REQUIRED_DEPENDENCIES) : false;
    }

    getRefreshEndpoint(): refreshEndpoint.RefreshEndpoint {
        return this.refreshEndpoint;
    }

    getServerStopEndpoint(): serverStopEndpoint.ServerStopEndpoint {
        return this.serverStopEndpoint;
    }

    getEnvironmentEndpoint(): environmentEndpoint.EnvironmentEndpoint {
        return this.environmentEndpoint;
    }

    getBeansEndpoint(): beansEndpoint.BeansEndpoint {
        return this.beansEndpoint;
    }

    getRoutesEndpoint(): routesEndpoint.RoutesEndpoint {
        return this.routesEndpoint;
    }

    getHealthEndpoint(): healthEndpoint.HealthEndpoint {
        return this.healthEndpoint;
    }

    getMetricsEndpoint(): metricsEndpoint.MetricsEndpoint {
        return this.metricsEndpoint;
    }

    getLoggersEndpoint(): loggersEndpoint.LoggersEndpoint {
        return this.loggersEndpoint;
    }

    getCachesEndpoint(): cachesEndpoint.CachesEndpoint {
        return this.cachesEndpoint;
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

        const environmentEndpointVmArgs = this.environmentEndpoint.buildVmArgs();
        if (environmentEndpointVmArgs) {
            vmArgs.push(environmentEndpointVmArgs);
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

        const loggersEndpointVmArgs = this.loggersEndpoint.buildVmArgs();
        if (loggersEndpointVmArgs) {
            vmArgs.push(loggersEndpointVmArgs);
        }

        const cachesEndpointVmArgs = this.cachesEndpoint.buildVmArgs();
        if (cachesEndpointVmArgs) {
            vmArgs.push(cachesEndpointVmArgs);
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

}
