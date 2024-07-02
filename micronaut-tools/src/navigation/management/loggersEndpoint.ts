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


const SETTING_ENABLED_KEY = 'loggersEndpointEnabled';
const RELATIVE_ADDRESS = '/loggers';

const LEVEL_NOT_SPECIFIED = 'NOT_SPECIFIED';

export function forApplication(application: applications.Application) {
    return new LoggersEndpoint(application);
}

export class LoggersEndpoint extends beanHandler.UpdatableBeanHandler {

    constructor(application: applications.Application) {
        super(application, SETTING_ENABLED_KEY, RELATIVE_ADDRESS);
    }

    editLoggers() {
        // type QuickPickItemWithContent<T> = vscode.QuickPickItem & { content: T };
        // function asQuickPicks<T>(parts: T[], title: (part: T) => string): QuickPickItemWithContent<T>[] {
        //     return parts.map((p) => asQuickPick(p, title));
        // }
        // function asQuickPick<T>(part: T, title: (part: T) => string): QuickPickItemWithContent<T> {
        //     return { label: title(part), content: part };
        // }
        const CREATE_NEW_LOGGER = '$(add) Create New Logger';
        const CONFIGURED_PREFIX = '$(circle-filled) ';
        const NOT_CONFIGURED_PREFIX = '$(circle) ';
        let levels: string[] | undefined;
        const items = new Promise<vscode.QuickPickItem[]>(resolve => {
            this.getLoggers().then(data => {
                if (data) {
                    this.notifyUpdated(data);
                    levels = getLevels(data);
                    const configured = getConfigured(data);
                    const notConfigured = getNotConfigured(data);
                    const items = [];
                    items.push({
                        label: 'New Logger',
                        kind: vscode.QuickPickItemKind.Separator
                    });
                    items.push({
                        label: CREATE_NEW_LOGGER
                    });
                    items.push({
                        label: 'Configured Loggers',
                        kind: vscode.QuickPickItemKind.Separator
                    });
                    if (configured.length) {
                        for (const logger of configured) {
                            items.push({
                                label: `${CONFIGURED_PREFIX}${logger.name}`,
                                description: `configured level: ${logger.configuredLevel}`
                            });
                        }
                    } else {
                        items.push({
                            label: '',
                            description: 'No loggers currently configured'
                        });
                    }
                    if (notConfigured.length) {
                        items.push({
                            label: 'Not Configured Loggers',
                            kind: vscode.QuickPickItemKind.Separator
                        });
                        for (const logger of notConfigured) {
                            items.push({
                                label: `${NOT_CONFIGURED_PREFIX}${logger.name}`,
                                description: `effective level: ${logger.effectiveLevel}`
                            });
                        }
                    }
                    resolve(items);
                } else {
                    resolve([]);
                }
            });
        });
        vscode.window.showQuickPick(items, {
            title: 'Configure Loggers',
            placeHolder: 'Select the logger to be configured or create a new logger'
            // ignoreFocusOut: true
        }).then(selected => {
            if (selected && levels) {
                let logger: string | undefined = selected.label;
                if (!logger || logger === CREATE_NEW_LOGGER) {
                    logger = undefined;
                } else {
                    if (logger.startsWith(CONFIGURED_PREFIX)) {
                        logger = logger.substring(CONFIGURED_PREFIX.length);
                    } else if (logger.startsWith(NOT_CONFIGURED_PREFIX)) {
                        logger = logger.substring(NOT_CONFIGURED_PREFIX.length);
                    }
                }
                this.editLogger(logger, levels).then(success => {
                    if (success) {
                        this.update();
                    }
                });
            }
        });
    }

    async editLogger(logger: string | undefined, levels: string[]): Promise<boolean> {
        let title = 'Configure Logger';
        if (!logger) {
            title = 'Create New Logger';
            logger = await vscode.window.showInputBox({
                title: `${title}: Define Logger Name`,
                ignoreFocusOut: true
            });
            if (!logger) {
                return false;
            }
        }
        const levelItems = [];
        for (const level of levels) {
            levelItems.push({
                label: level
            });
        }
        const level = await vscode.window.showQuickPick(levelItems, {
            title: `${title}: Select Logging Level`,
            placeHolder: `Select logging level for logger '${logger}'`,
            ignoreFocusOut: true
        });
        if (level) {
            return this.postLogger(logger, level.label);
        }
        return false;
    }

    private postLogger(logger: string, level: string): Promise<boolean> {
        return new Promise(resolve => {
            rest.postData(`${this.getAddress()}/${logger}`, { configuredLevel: level }).then(response => {
                // console.log('>>> POST STOP')
                // console.log(response)
                if (response.code === 401) {
                    vscode.window.showErrorMessage('The user is not authorized to configure loggers.');
                }
                resolve(response.code === 200);
            }).catch(err => {
                console.log(err);
                resolve(false);
            });
        });
    }

    private async getLoggers(): Promise<any | undefined> {
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
        // console.log('>>> LOGGERS <<<')
        // console.log(response.data)
        this.notifyUpdated(JSON.parse(response.data));
    }

    // async getData(): Promise<{ code: number | undefined; headers: any; data: any }> {
    //     return super.getData();
    // }

    // refresh(): Promise<boolean> {
    //     return new Promise(resolve => {
    //         rest.postData(this.getAddress(), { 'force': true }).then(response => {
    //             // console.log('>>> POST REFRESH')
    //             // console.log(response)
    //             if (response.code === 401) {
    //                 vscode.window.showErrorMessage('The user is not authorized to refresh the application state.');
    //             } else if (response.code === 200) {
    //                 vscode.window.showInformationMessage('Application state has been refreshed.');
    //             }
    //             resolve(response.code === 200);
    //         }).catch(err => {
    //             console.log(err)
    //             resolve(false);
    //         });
    //     });
    // }

    buildVmArgs(): string[] | undefined {
        // if (!this.isEnabled()) {
        //     return undefined;
        // }
        return ['-Dendpoints.loggers.enabled=true', '-Dendpoints.loggers.sensitive=false', '-Dendpoints.loggers.write-sensitive=false'];
    }

}

export function getLevels(data: any): string[] {
    return data.levels || [];
}

export function getConfigured(data: any): { name: string; configuredLevel: string }[] {
    const configured = [];
    for (const loggerName of Object.keys(data.loggers)) {
        const logger = data.loggers[loggerName];
        if (logger.configuredLevel !== LEVEL_NOT_SPECIFIED) {
            configured.push({
                name: loggerName,
                configuredLevel: logger.configuredLevel
            });
        }
    }
    return configured;
}

export function getNotConfigured(data: any): { name: string; effectiveLevel: string }[] {
    const configured = [];
    for (const loggerName of Object.keys(data.loggers)) {
        const logger = data.loggers[loggerName];
        if (logger.configuredLevel === LEVEL_NOT_SPECIFIED) {
            configured.push({
                name: loggerName,
                effectiveLevel: logger.effectiveLevel
            });
        }
    }
    return configured;
}
