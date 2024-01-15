/*
 * Copyright (c) 2022, 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as model from './model';


const VSCODE_METADATA_FOLDER = '.vscode';
const CONFIG_FILE = 'devops.json';
const CONFIG_FILE_INDENTATION = 4;

export class FolderStorage {

    private folder: vscode.WorkspaceFolder;
    private version: string;
    private readonly serviceConfigurations: model.ServicesConfiguration[];

    constructor(folder: vscode.WorkspaceFolder, version: string, cloudServices: any) {
        this.folder = folder;
        this.version = version;
        this.serviceConfigurations = [];
        for (const cloudService of cloudServices) {
            const type = cloudService.type;
            const name = cloudService.name;
            if (type && name) {
                const storeData = () => {
                    setTimeout(() => this.store(), 0);
                };
                const serviceConfiguration = new model.ServicesConfiguration(type, name, cloudService.data, storeData);
                this.serviceConfigurations.push(serviceConfiguration);
            }
        }
    }

    getConfigurations(): model.ServicesConfiguration[] {
        return this.serviceConfigurations;
    }

    store() {
        const cloudServices = [];
        for (const serviceConfiguration of this.serviceConfigurations) {
            cloudServices.push({
                type: serviceConfiguration.getType(),
                name: serviceConfiguration.getName(),
                data: serviceConfiguration.data
            });
        }
        const configuration = {
            version: this.version,
            cloudServices: cloudServices
        };
        store(this.folder.uri.fsPath, configuration, true);
    }

}

export function getDefaultLocation(): string {
    return path.join(VSCODE_METADATA_FOLDER, CONFIG_FILE);
}

export function storageExists(folder: string): boolean {
    const configurationFile = getConfigurationFile(folder);
    return fs.existsSync(configurationFile);
}

function getConfigurationFile(folder: string): string {
    return path.join(folder, getDefaultLocation());
}

export function readStorage(folder: vscode.WorkspaceFolder): FolderStorage | undefined {
    const folderConfiguration = read(folder.uri.fsPath);
    if (folderConfiguration) {
        const version = folderConfiguration.version;
        const cloudServices = folderConfiguration.cloudServices;
        if (version && cloudServices) {
            const storage = new FolderStorage(folder, version, cloudServices);
            return storage;
        }
    }
    return undefined;
}

export function read(folder: string): any | undefined {
    const configurationFile = getConfigurationFile(folder);
    if (!fs.existsSync(configurationFile)) {
        return undefined;
    }
    const configurationString = fs.readFileSync(configurationFile).toString();
    const configuration = JSON.parse(configurationString);
    return configuration;
}

export function storeCloudSupportData(cloudSupport: model.CloudSupport, folders: string[], servicesData: any[]) {
    for (let idx = 0; idx < folders.length; idx++) {
        if (servicesData[idx]) {
            const cloudServices = [
                {
                    type: cloudSupport.getType(),
                    name: cloudSupport.getName(),
                    data: servicesData[idx]
                }
            ];
            storeCloudServices(folders[idx], cloudServices, true);
        }
    }
}

function storeCloudServices(folder: string, cloudServices: any[], overwriteExisting: boolean) {
    const configuration = {
        version: '1.0',
        cloudServices: cloudServices
    };
    store(folder, configuration, overwriteExisting);
}

export function store(folder: string, configuration: any, overwriteExisting: boolean) {
    const configurationFolder = path.join(folder, VSCODE_METADATA_FOLDER);
    if (!fs.existsSync(configurationFolder)) {
        fs.mkdirSync(configurationFolder);
    }
    const configurationFile = path.join(configurationFolder, CONFIG_FILE);
    if (overwriteExisting || !fs.existsSync(configurationFile)) {
        const configurationString = JSON.stringify(configuration, undefined, CONFIG_FILE_INDENTATION);
        fs.writeFileSync(configurationFile, configurationString, { flag: 'w' });
    }
}
