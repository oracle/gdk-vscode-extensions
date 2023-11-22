/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as applications from '../applications';
import * as beanHandler from './beanHandler';


const RELATIVE_ADDRESS = '/control-panel';

export function forApplication(application: applications.Application) {
    return new ControlPanel(application);
}

export class ControlPanel extends beanHandler.BeanHandler {

    constructor(application: applications.Application) {
        super(application, RELATIVE_ADDRESS);
        this.application.onStateChanged(state => {
            this.checkAvailable(state);
            // if (state === applications.State.CONNECTED_LAUNCH || state === applications.State.CONNECTED_ATTACH) {
            //     this.setAvailable(undefined);
            //     this.checkAvailable();
            // } else {
            //     this.setAvailable(false)
            // }
        });
    }

    protected doEnable() {
        this.checkConfigured().then(configured => {
            if (configured) {
                if (this.application.getDefinedEnvironments()?.length) {
                    super.doEnable();
                } else {
                    const useDevOption = 'Use \'dev\'';
                    const setCustomOption = 'Define Custom';
                    const cancelOption = 'Cancel';
                    vscode.window.showWarningMessage('Micronaut Control Panel requires at least one defined environment. Which environment should be used?', useDevOption, setCustomOption, cancelOption).then(selectedOption => {
                        if (selectedOption === useDevOption) {
                            this.application.setDefinedEnvironments(['dev']);
                            super.doEnable();
                        } else if (selectedOption === setCustomOption) {
                            this.application.editDefinedEnvironments();
                        }
                    });
                }
            }
        }).catch(err => {
            console.log('Failed to configure project for Micronaut Control Panel:')
            console.log(err)
        });
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
        //     <groupId>io.micronaut.controlpanel</groupId>
        //     <artifactId>micronaut-control-panel-ui</artifactId>
        //     <scope>runtime</scope> ??
        // </dependency>
        // <dependency>
        //     <groupId>io.micronaut.controlpanel</groupId>
        //     <artifactId>micronaut-control-panel-management</artifactId>
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
        const definedEnvironments = this.application.getDefinedEnvironments();
        if (!definedEnvironments?.length) {
            return undefined;
        }
        return `-Dmicronaut.control-panel.enabled=true -Dmicronaut.control-panel.allowed-environments=${definedEnvironments.join(',')}`;
        // return '-Dmicronaut.control-panel.allowed-environments=vscode -Dmicronaut.environments=vscode';
    }

}
