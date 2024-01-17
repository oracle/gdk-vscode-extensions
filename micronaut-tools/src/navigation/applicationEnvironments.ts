/*
 * Copyright (c) 2023, 2024, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as applications from './applications';
import * as settings from './settings';


const SETTING_DEFINED_ENVIRONMENTS_KEY = 'definedApplicationEnvironments';

const SUPPORTED_CONFIG_FILES = [
    '.properties',   // Java properties
    '.json',         // JavaScript JSON
    '.yml',          // Yaml -- org.yaml:snakeyaml required
    '.yaml',         // Yaml -- org.yaml:snakeyaml required
    '.toml',         // Toml -- io.micronaut.toml:micronaut-toml required
    '.groovy',       // Groovy -- io.micronaut.groovy:micronaut-runtime-groovy required
    '.conf'          // Hocon -- io.micronaut.kotlin:micronaut-kotlin-runtime required
];

export function forApplication(application: applications.Application) {
    return new DefinedEnvironments(application);
}

export type OnDefinedEnvironmentsChanged = (definedEnvironments: string[] | undefined) => void;

export class DefinedEnvironments {

    private application: applications.Application;
    private definedEnvironments: string[] | undefined;

    constructor(application: applications.Application) {
        this.application = application;

        const moduleUri = application.getSelectedModule().getUri();
        this.loadFromUri(moduleUri);
        application.getSelectedModule().onModuleChanged((_singleModule, uri) => {
            this.loadFromUri(uri);
        });
    }

    get(): string[] | undefined {
        return this.definedEnvironments;
    }

    async set(definedEnvironments: string[] | undefined) {
        if (JSON.stringify(this.definedEnvironments) !== JSON.stringify(definedEnvironments)) {
            this.definedEnvironments = definedEnvironments;
            this.notifyDefinedEvironmentsChanged(this.definedEnvironments);
            const moduleUri = this.application.getSelectedModule().getUri();
            if (moduleUri) {
                await settings.setForUri(moduleUri, SETTING_DEFINED_ENVIRONMENTS_KEY, toString(this.definedEnvironments));
            }
        }
    }

    private loadFromUri(moduleUri: vscode.Uri | undefined) {
        const persisted = moduleUri ? settings.getForUri<string>(moduleUri, SETTING_DEFINED_ENVIRONMENTS_KEY) : undefined;
        const environments = fromString(persisted);
        this.set(environments);
    }

    async configure() {
        const folderPath = this.application.getSelectedModule().getUri()?.fsPath;
        if (folderPath) {
            const resourcesPath = path.join(folderPath, 'src', 'main', 'resources');
            this.readConfigurationFiles(resourcesPath).then(allFiles => {
                const environmentEndpoint = this.application.getManagement().getEnvironmentEndpoint();
                const liveMode = environmentEndpoint.isAvailable();
                const environments = liveMode ? environmentEndpoint.getLastActiveEnvironments() : this.definedEnvironments;
                this.getConfigurationFiles(allFiles, environments).then(async files => {
                    const preferredExt = this.getPreferredExtension(allFiles[1]);
                    const items: (vscode.QuickPickItem & { file: string; createForEnvironment: string | undefined })[] = [];
                    for (let i = 0; i < files.length; i++) {
                        const create = files[i][1] === '---';
                        const icon = create ? '$(new-file)' : '$(file)';
                        const action = create ? 'Create' : 'Edit';
                        const fileName = files[i][0];
                        const file = `${fileName}${create ? preferredExt : files[i][1]}`;
                        const envName = fileName === 'application' ? 'default' : `'${fileName.substring('application-'.length)}'`;
                        // const environment = this.definedEnvironments?.length ? `'${this.definedEnvironments[i]}'` : 'default';
                        items.push({
                            label: `${icon} ${action} ${file}`,
                            detail: `${action} ${create ? 'new' : 'existing'} configuration file for the ${envName} environment`,
                            file: file,
                            createForEnvironment: create ? envName : undefined
                        });
                    }
                    const selected = items.length === 1 ? items[0] : await vscode.window.showQuickPick(items, {
                        title: 'Configure Environment Properties',
                        placeHolder: 'Select action'
                    });
                    if (selected) {
                        const createForEnvironment = items.length === 1 ? selected.createForEnvironment : undefined;
                        this.openFile(resourcesPath, selected.file, createForEnvironment);
                    }
                });
            }).catch(err => {
                console.log(err);
            });
        }
    }

    private async openFile(resourcesPath: string, file: string, createForEnvironment?: string) {
        if (createForEnvironment) {
            const createOption = 'Create File';
            const cancelOption = 'Cancel';
            const selectedOption = await vscode.window.showInformationMessage(`Create new configuration file ${file} for the ${createForEnvironment} environment?`, createOption, cancelOption);
            if (selectedOption !== createOption) {
                return;
            }
        }
        const configFile = path.join(resourcesPath, file);
        if (!fs.existsSync(configFile)) {
            try {
                fs.closeSync(fs.openSync(configFile, 'a'));
            } catch (err) {
                console.log(err);
                return;
            }
        }
        vscode.workspace.openTextDocument(configFile).then(document => vscode.window.showTextDocument(document));
    }

    private async getConfigurationFiles(allConfigFiles: string[][], environments: string[] | undefined): Promise<string[][]> {
        const fileNames = allConfigFiles[0];
        const fileExts = allConfigFiles[1];
        const configFiles: string[][] = [];
        if (environments?.length) {
            for (const environment of environments) {
                const fileName = `application-${environment}`; // TODO: lowercase?
                const idx = fileNames.indexOf(fileName);
                const fileExt = idx >= 0 ? fileExts[idx] : '---';
                configFiles.push([fileName, fileExt]);
            }
            const defaultFileName = 'application';
            const defaultIdx = fileNames.indexOf(defaultFileName);
            const defaultFileExt = defaultIdx >= 0 ? fileExts[defaultIdx] : '---';
            configFiles.push([defaultFileName, defaultFileExt]);
        } else {
            const defaultFileName = 'application';
            const defaultIdx = fileNames.indexOf(defaultFileName);
            const defaultFileExt = defaultIdx >= 0 ? fileExts[defaultIdx] : '---';
            configFiles.push([defaultFileName, defaultFileExt]);
            if (this.application.getState() === applications.State.IDLE) {
                for (let i = 0; i < fileNames.length; i++) {
                    if (i !== defaultIdx) {
                        configFiles.push([fileNames[i], fileExts[i]]);
                    }
                }
            }
        }
        return configFiles;
    }

    private async readConfigurationFiles(resourcesPath: string): Promise<string[][]> {
        return new Promise((resolve, reject) => {
            fs.readdir(resourcesPath, (err, files) => {
                if (err) {
                    reject(err);
                } else {
                    const fileNames: string[] = [];
                    const fileExts: string[] = [];
                    for (const file of files) {
                        if (file.startsWith('application.') || file.startsWith('application-')) {
                            const ext = path.extname(file).toLowerCase();
                            // console.log('>>> ' + ext + ' --- ' + file)
                            if (SUPPORTED_CONFIG_FILES.includes(ext)) {
                                const name = file.slice(0, -ext.length);
                                // console.log('... file ' + file + ' --- name ' + name)
                                fileNames.push(name);
                                fileExts.push(ext);
                            }
                        }
                    }
                    resolve([fileNames, fileExts]);
                }
            });
        });
    }

    private getPreferredExtension(exts: string[]): string {
        const allExtensions = this.allExtensions(exts);
        if (allExtensions.length === 1) {
            return allExtensions[0];
        } else if (allExtensions.length > 1) {
            for (const supportedExt of SUPPORTED_CONFIG_FILES) {
                if (allExtensions.includes(supportedExt)) {
                    return supportedExt;
                }
            }
        }
        return SUPPORTED_CONFIG_FILES[0];
    }

    private allExtensions(exts: string[]): string[] {
        const extensions: any = {};
        for (const ext of exts) {
            extensions[ext] = true;
        }
        return Object.keys(extensions);
    }

    // returns true if edit was performed, false if canceled
    async edit(): Promise<boolean> {
        return new Promise(resolve => {
            vscode.window.showInputBox({
                title: 'Edit Active Environments',
                placeHolder: vscode.l10n.t('Provide comma-separated environments for the launched application (like \'dev,test\')'),
                value: toString(this.definedEnvironments),
                prompt: 'Leave blank to use project configuration.'
            }).then(provided => {
                if (provided !== undefined) {
                    const environments = fromString(provided);
                    if (environments?.length || !this.application.getControlPanel().isEnabled()) {
                        this.set(environments);
                        resolve(true);
                    } else {
                        const defineDevOption = 'Define Environments';
                        const disableCpOption = 'Disable Control Panel';
                        const cancelOption = 'Cancel';
                        vscode.window.showWarningMessage('Micronaut Control Panel requires at least one defined active environment.', defineDevOption, disableCpOption, cancelOption).then(selectedOption => {
                            if (selectedOption === defineDevOption) {
                                resolve(this.edit());
                            } else if (selectedOption === disableCpOption) {
                                this.application.getControlPanel().setEnabled(false);
                                this.set(environments);
                                resolve(true);
                            } else {
                                resolve(false);
                            }
                        });
                    }
                } else {
                    resolve(false);
                }
            });
        });
    }

    buildVmArgs(): string | undefined {
        if (!this.definedEnvironments?.length) {
            return undefined;
        }
        const definedEnvironments = this.definedEnvironments.join(',');
        return `-Dmicronaut.environments=${definedEnvironments}`;
    }

    private readonly onDefinedEnvironmentsChangedListeners: OnDefinedEnvironmentsChanged[] = [];

    onDefinedEnvironmentsChanged(listener: OnDefinedEnvironmentsChanged) {
        this.onDefinedEnvironmentsChangedListeners.push(listener);
    }

    private notifyDefinedEvironmentsChanged(definedEnvironments: string[] | undefined) {
        for (const listener of this.onDefinedEnvironmentsChangedListeners) {
            listener(definedEnvironments);
        }
    }

}

function fromString(environments: string | undefined): string[] | undefined {
    environments = environments?.replace(/\s/g, '');
    return environments ? environments.split(',') : undefined;
}

function toString(environments: string[] | undefined): string | undefined {
    return environments?.length ? environments.join(',') : undefined;
}
