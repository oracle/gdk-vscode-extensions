/*
 * Copyright (c) 2023, 2024, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as applications from '../applications';
import * as projectUtils from '../projectUtils';
import * as beanHandler from './beanHandler';


const SETTING_ENABLED_KEY = 'controlPanelEnabled';
const RELATIVE_ADDRESS = '/control-panel';

const REQUIRED_DEPENDENCIES: projectUtils.NbArtifactSpec[] = [
    { groupId: 'io.micronaut', artifactId: 'micronaut-management'}, // https://docs.micronaut.io/latest/guide/#management
    { groupId: 'io.micronaut.controlpanel', artifactId: 'micronaut-control-panel-ui'}, // https://micronaut-projects.github.io/micronaut-control-panel/snapshot/guide/#quickStart
    { groupId: 'io.micronaut.controlpanel', artifactId: 'micronaut-control-panel-management'} // https://micronaut-projects.github.io/micronaut-control-panel/snapshot/guide/#quickStart
];

export function forApplication(application: applications.Application) {
    return new ControlPanel(application);
}

export class ControlPanel extends beanHandler.BeanHandler {

    constructor(application: applications.Application) {
        super(application, SETTING_ENABLED_KEY, RELATIVE_ADDRESS);
        this.application.onStateChanged(state => {
            this.checkAvailable(state);
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
            title: 'Micronaut Control Panel Availability',
            placeHolder: 'Select Micronaut Control Panel availability for the launched application'
        }).then(selected => {
            if (selected) {
                this.setEnabled(selected === items[0], true);
            }
        });
    }

    protected doEnable(restoringPersisted: boolean) {
        projectUtils.dependencyCheckingAvailable().then(available => {
            if (available || !restoringPersisted) { // restoring persisted state on startup with NBLS ready to report the dependencies, or setting enabled later
                this.checkConfigured(!restoringPersisted).then(configured => { // will (intentionally) throw exception if NBLS not ready to report the dependencies
                    if (configured) {
                        if (this.application.getDefinedEnvironments().get()?.length) {
                            super.doEnable();
                        } else if (restoringPersisted) {
                            super.doDisable(); // silently disable when restoring persisted state and no environment is defined
                        } else {
                            // const useDevOption = 'Use \'dev\'';
                            const defineDevOption = 'Define Environments';
                            const cancelOption = 'Cancel';
                            vscode.window.showWarningMessage('Micronaut Control Panel requires at least one defined active environment.', /*useDevOption,*/ defineDevOption, cancelOption).then(selectedOption => {
                                /*if (selectedOption === useDevOption) {
                                    this.application.getDefinedEnvironments().set(['dev']);
                                    super.doEnable();
                                } else*/ if (selectedOption === defineDevOption) {
                                    this.application.getDefinedEnvironments().edit().then(editPerformed => {
                                        if (editPerformed) { // edit not canceled
                                            if (this.application.getDefinedEnvironments().get()?.length) {
                                                super.doEnable();
                                            }
                                        }
                                    });
                                }
                            });
                        }
                    } else {
                        super.doDisable(); // silently disable when (restoring persisted state and) dependencies not available
                    }
                }).catch(err => {
                    console.log('Failed to configure project for Micronaut Control Panel: ' + err);
                    console.log(err);
                });
            } else { // restoring persisted state on startup while NBLS not ready yet to report the dependencies
                super.doEnable();
            }
        });
    }

    private async checkConfigured(addMissing: boolean): Promise<boolean> {
        const moduleUri = this.application.getSelectedModule().getUri();
        return moduleUri ? projectUtils.checkConfigured(moduleUri, 'Micronaut Control Panel', addMissing, ...REQUIRED_DEPENDENCIES) : false;
    }

    buildVmArgs(): string[] | undefined {
        if (!this.isEnabled()) {
            return undefined;
        }
        const definedEnvironments = this.application.getDefinedEnvironments().get();
        if (!definedEnvironments?.length) {
            return undefined;
        }
        return ['-Dmicronaut.control-panel.enabled=true', `-Dmicronaut.control-panel.allowed-environments=${definedEnvironments.join(',')}`];
    }

}
