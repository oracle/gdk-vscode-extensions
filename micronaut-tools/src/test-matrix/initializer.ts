/*
 * Copyright (c) 2020, 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import { getGdkProjects } from './gdkProjectUtils';
import { disableSwitchingToDifferentPanel, shouldHideModule, toggleMatrixHideForModule } from './vscodeUtils';
import { TestMatrixViewProvider } from './TestMatrixViewProvider';

let registeredProvider: vscode.Disposable | undefined;

export async function initializeTestMatrix(context: vscode.ExtensionContext): Promise<TestMatrixViewProvider | undefined> {
    let provider: TestMatrixViewProvider | undefined;
    let projects: vscode.WorkspaceFolder[];

    await waitForNblsCommand(COMMAND_PROJECT_INFO)
        .then(() => getGdkProjectFromWorkspace())
        .then((gdkProjects) => {
            if (gdkProjects.length === 0) {
                return Promise.reject();
            } else {
                projects = gdkProjects;
                return Promise.resolve();
            }
        })
        .then(() => checkConflicts())
        .then(() => vscode.commands.executeCommand("nbls.run.test.parallel.createProfile"))
        .then(() => disableSwitchingToDifferentPanel())
        .then(() => {
            if (registeredProvider) {
                registeredProvider.dispose();
            }
            provider = new TestMatrixViewProvider(context.extensionUri, projects);
            vscode.commands.executeCommand("nbls.addEventListener", "testProgress", "extension.micronaut-tools-test-matrix.test-progress-event");
            registeredProvider =  vscode.window.registerWebviewViewProvider(TestMatrixViewProvider.viewType, provider);
            context.subscriptions.push(registeredProvider);
        })
        .then(() => hideLibModule(provider));

    return provider;
}

export async function getGdkProjectFromWorkspace() {
    return getGdkProjects().then((gdkProjects) => {
        if (gdkProjects.length > 0) {
            vscode.commands.executeCommand('setContext', 'isGdkProject', true);
        } else {
            vscode.commands.executeCommand('setContext', 'isGdkProject', false);
        }
        return Promise.resolve(gdkProjects);
    });
}

export async function checkConflicts() {
    if (!testMatrixPrerequisitesFulfilled()) {
        suggestToDisableMSTestRunner();
        vscode.commands.executeCommand('setContext', 'withoutConflicts', false);
        return Promise.reject();
    } else if (!isNblsEnabled()) {
        vscode.commands.executeCommand('setContext', 'withoutConflicts', false);
        return Promise.reject();
    } else {
        vscode.commands.executeCommand('setContext', 'withoutConflicts', true);
        return Promise.resolve();
    }
}

async function hideLibModule(provider: TestMatrixViewProvider | undefined) {
    const hiddenLibTests = shouldHideModule("lib");
    if (!hiddenLibTests) {
        toggleMatrixHideForModule("lib").then(() => provider?.moduleVisibilityChanged());
    }
    vscode.commands.executeCommand('setContext', 'hiddenLibTests', true);
}

function testMatrixPrerequisitesFulfilled() {
    return !vscode.extensions.getExtension('redhat.java');
}

export function isNblsEnabled() {
    return vscode.workspace.getConfiguration("netbeans").get("javaSupport.enabled");
}

async function suggestToDisableMSTestRunner() {
    const DISABLE_EXTENSION = `Manually Disable Extension`;
    const DISABLE_LATER = `Later`;
    const selected = await vscode.window.showInformationMessage(`Disable Java and Language Support for Java(TM) by Red Hat in order to use Multicloud Tester.`, DISABLE_EXTENSION, DISABLE_LATER);
    if (DISABLE_EXTENSION === selected) {
        vscode.commands.executeCommand('workbench.view.extensions');
    }
}

const EXTENSION_NBLS_ID = 'asf.apache-netbeans-java';
const COMMAND_PROJECT_INFO = 'nbls.project.info';

export async function waitForNblsCommand(command: string) {
    const nbls = vscode.extensions.getExtension(EXTENSION_NBLS_ID);
    if (nbls) {
        for (let i = 0; i < 60; i++) {
            const commands = await vscode.commands.getCommands();
            if (commands.includes(command)) {
                return;
            }
            await delay(1000);
        }
    }
    throw new Error('Timed out waiting for project support. Check whether the Language Server for Java by Apache NetBeans extension is active and initialized.');
}

export function delay(ms: number) {
    return new Promise( resolve => setTimeout(resolve, ms) );
}
