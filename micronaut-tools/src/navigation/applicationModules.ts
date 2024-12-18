/*
 * Copyright (c) 2023, 2024, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as applications from './applications';
import * as settings from './settings';
import * as projectUtils from './projectUtils';


const SETTING_SELECTED_MODULE_KEY = 'selectedApplicationModule';

const KNOWN_MODULES = [
    'aws',
    'azure',
    'gcp',
    'oci'
];

export function forApplication(application: applications.Application) {
    return new SelectedModule(application);
}

export type OnModuleChanged = (singleModule: boolean | undefined, uri: vscode.Uri | undefined, name: string | undefined, totalModules: number) => void;

export class SelectedModule {

    private readonly applicationUri: vscode.Uri;
    private module: string | null | undefined; // null === root module (Micronaut), string === submodule (GDK), undefined === not determined yet (waiting for NBLS)
    private singleModule: boolean | undefined;
    private totalModules: number = 0;

    constructor(application: applications.Application) {
        this.applicationUri = application.getFolder().uri;

        // Resolve previously saved module, resolves to undefined if not saved yet
        this.module = settings.getForUri(this.applicationUri, SETTING_SELECTED_MODULE_KEY);
        
        // Single module (Micronaut) saved as null => this.module set means it's a multi-module project (GDK)
        if (this.module) {
            this.singleModule = false;
        }

        // Check whether the previously saved module is still runnable, resolves to undefined if not runnable
        const moduleUri = this.getUri();
        if (moduleUri && !projectUtils.isRunnableUri(moduleUri)) {
            this.module = undefined;
            this.singleModule = undefined;
        }

        if (this.module === undefined) {
            if (projectUtils.isRunnableUri(this.applicationUri)) { // Try to set the root module (likely a Micronaut project)
                this.module = null;
            } else { // Check for known modules (likely a GDK project)
                if (gcnLikeLayout(this.applicationUri)) {
                    this.singleModule = false;
                }
            }
        }
    }

    update(projectInfo: projectUtils.ProjectInfo) {
        const totalModules = projectInfo.runnableModules.length;
        const singleModule = totalModules === 1 && !projectInfo.runnableModules[0].length;

        // TODO: clear already set module not available among the resolved modules?

        // module not initially resolved in constructor
        if (this.module === undefined && totalModules) {
            // try to select the 'oci' module
            for (const module of projectInfo.runnableModules) {
                if (module.length && moduleName(module) === 'oci') {
                    this.set(module, singleModule, totalModules);
                    break;
                }
            }
            // select the first module
            if (this.module === undefined) {
                const module = projectInfo.runnableModules[0].length ? projectInfo.runnableModules[0] : null;
                this.set(module, singleModule, totalModules);
            }
        } else {
            this.set(this.module, singleModule, totalModules);
        }
    }

    select(projectInfo: projectUtils.ProjectInfo) {
        const runnableModules = projectInfo.runnableModules;
        const totalModules = runnableModules.length;
        if (totalModules === 0) {
            vscode.window.showErrorMessage('The project does not contain any runnable modules.');
            this.set(undefined, undefined, 0);
        } else if (totalModules === 1) {
            vscode.window.showInformationMessage(`The project contains single subproject ${moduleName(runnableModules[0])}.`);
            this.set(runnableModules[0], !runnableModules[0].length, 1);
        } else {
            const items: (vscode.QuickPickItem & { module: string | null })[] = [];
            for (const runnableModule of runnableModules) {
                items.push({
                    label: moduleName(runnableModule),
                    module: runnableModule
                });
            }
            vscode.window.showQuickPick(items, {
                title: 'Change Subproject',
                placeHolder: 'Select subproject'
            }).then(selected => {
                if (selected) {
                    this.set(selected.module, false, totalModules);
                }
            });
        }
    }

    getName(): string | undefined {
        switch (this.module) {
            case null: return 'root';
            case undefined: return undefined;
            default: return moduleName(this.module);
        }
    }

    getUri(): vscode.Uri | undefined {
        switch (this.module) {
            case null: return this.applicationUri;
            case undefined: return undefined;
            default: return vscode.Uri.parse(this.module);
        }
    }

    isSingleModule(): boolean | undefined {
        return this.singleModule;
    }

    getTotalModules(): number {
        return this.totalModules;
    }

    private set(module: string | null | undefined, singleModule: boolean | undefined, totalModules: number) {
        const moduleChange = this.module !== module;
        if (moduleChange || this.singleModule !== singleModule || this.totalModules !== totalModules) {
            this.module = module;
            this.singleModule = singleModule;
            this.totalModules = totalModules;
            this.notifyModuleChanged();
            if (moduleChange) {
                settings.setForUri(this.applicationUri, SETTING_SELECTED_MODULE_KEY, module);
            }
        }
    }

    private readonly onModuleChangedListeners: OnModuleChanged[] = [];

    onModuleChanged(listener: OnModuleChanged) {
        this.onModuleChangedListeners.push(listener);
    }

    private notifyModuleChanged() {
        for (const listener of this.onModuleChangedListeners) {
            listener(this.isSingleModule(), this.getUri(), this.getName(), this.getTotalModules());
        }
    }

}

function moduleName(module: string): string {
    if (module.length === 0) return 'root';
    return path.parse(vscode.Uri.parse(module).fsPath).base;
}

function gcnLikeLayout(applicationUri: vscode.Uri) {
    if (!projectUtils.isRunnableUri(applicationUri)) {
        for (const knownModule of KNOWN_MODULES) {
            if (projectUtils.isRunnableUri(vscode.Uri.joinPath(applicationUri, knownModule))) {
                return true;
            }
        }
    }
    return false;
}
