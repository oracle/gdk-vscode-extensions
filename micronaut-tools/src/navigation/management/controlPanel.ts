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


const SETTING_ENABLED_KEY = 'controlPanelEnabled';
const RELATIVE_ADDRESS = '/control-panel';

const REQUIRED_DEPENDENCIES: projectUtils.ProjectDependency[] = [
    { group: 'io.micronaut', artifact: 'micronaut-management'}, // https://docs.micronaut.io/latest/guide/#management
    { group: 'io.micronaut.controlpanel', artifact: 'micronaut-control-panel-ui'}, // https://micronaut-projects.github.io/micronaut-control-panel/snapshot/guide/#quickStart
    { group: 'io.micronaut.controlpanel', artifact: 'micronaut-control-panel-management'} // https://micronaut-projects.github.io/micronaut-control-panel/snapshot/guide/#quickStart
]

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

    protected doEnable() {
        this.checkConfigured().then(configured => {
            if (configured) {
                if (this.application.getDefinedEnvironments().get()?.length) {
                    super.doEnable();
                } else {
                    const useDevOption = 'Use \'dev\'';
                    const setCustomOption = 'Define Custom';
                    const cancelOption = 'Cancel';
                    vscode.window.showWarningMessage('Micronaut Control Panel requires at least one defined environment. Which environment should be used?', useDevOption, setCustomOption, cancelOption).then(selectedOption => {
                        if (selectedOption === useDevOption) {
                            this.application.getDefinedEnvironments().set(['dev']);
                            super.doEnable();
                        } else if (selectedOption === setCustomOption) {
                            this.application.getDefinedEnvironments().edit();
                        }
                    });
                }
            }
        }).catch(err => {
            console.log('Failed to configure project for Micronaut Control Panel: ' + err)
            console.log(err)
        });
    }

    private async checkConfigured(): Promise<boolean> {
        const moduleUri = this.application.getSelectedModule().getUri();
        return moduleUri ? projectUtils.checkConfigured(moduleUri, 'Micronaut Control Panel', ...REQUIRED_DEPENDENCIES) : false;
    }

    buildVmArgs(): string | undefined {
        if (!this.isEnabled()) {
            return undefined;
        }
        const definedEnvironments = this.application.getDefinedEnvironments().get();
        if (!definedEnvironments?.length) {
            return undefined;
        }
        return `-Dmicronaut.control-panel.enabled=true -Dmicronaut.control-panel.allowed-environments=${definedEnvironments.join(',')}`;
    }

}
