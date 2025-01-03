/*
 * Copyright (c) 2020, 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as logUtils from '../../../common/lib/logUtils';

async function tryUpdatingWorkspaceConfig(config: string, value: string): Promise<void> {
    try {
        await vscode.workspace.getConfiguration().update(config, value, false);
    } catch (err) {
        logUtils.logWarning(`Unable to update ${config} config`);
    }
}

export async function disableSwitchingToDifferentPanel(): Promise<void> {
    return tryUpdatingWorkspaceConfig("debug.internalConsoleOptions", "neverOpen")
            .then(() => tryUpdatingWorkspaceConfig("testing.automaticallyOpenTestResults", "neverOpen"))
            .then(() => tryUpdatingWorkspaceConfig("testing.automaticallyOpenResults", "neverOpen"));
}

const HIDDEN_MODULES_CONFIGURATION_KEY: string = 'test-matrix.hiddenModules';

export function shouldHideModule(moduleName: string): boolean {
    const hiddenModules: Array<string> | undefined = vscode.workspace.getConfiguration('micronaut-tools').get<Array<string>>(HIDDEN_MODULES_CONFIGURATION_KEY);
    const foundEntry = hiddenModules?.find(hidden => moduleName.includes(hidden));
    return foundEntry ? true : false;
}

export async function toggleMatrixHideForModule(moduleName: string) {
    const hiddenModules: Array<string> | undefined = vscode.workspace.getConfiguration('micronaut-tools').get<Array<string>>(HIDDEN_MODULES_CONFIGURATION_KEY) || [];
    const hiddenModule = hiddenModules.find(hidden => moduleName === hidden);
    if (hiddenModule) {
        try {
            const filteredModules = hiddenModules.filter(hidden => moduleName !== hidden);
            await vscode.workspace.getConfiguration('micronaut-tools')
                .update(HIDDEN_MODULES_CONFIGURATION_KEY, [...filteredModules]);
        } catch (err) {
            vscode.window.showErrorMessage(`Failed to update property: netbeans.${HIDDEN_MODULES_CONFIGURATION_KEY}, ${err}`);
        }
    } else {
        try {
            hiddenModules.push(moduleName);
            await vscode.workspace.getConfiguration('micronaut-tools')
                .update(HIDDEN_MODULES_CONFIGURATION_KEY, [...hiddenModules]);
        } catch (err) {
            vscode.window.showErrorMessage(`Failed to update property: micronaut-tools.${HIDDEN_MODULES_CONFIGURATION_KEY}, ${err}`);
        }
    }
}
