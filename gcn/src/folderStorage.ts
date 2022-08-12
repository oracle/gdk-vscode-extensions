/*
 * Copyright (c) 2022, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as model from './model';


const VSCODE_METADATA_FOLDER = '.vscode';
const CONFIG_FILE = 'gcn.json';
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
                    this.store();
                }
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

function read(folder: string): any | undefined {
    const configurationFile = path.join(folder, VSCODE_METADATA_FOLDER, CONFIG_FILE);
    if (!fs.existsSync(configurationFile)) {
        return undefined;
    }
    const configurationString = fs.readFileSync(configurationFile).toString();
    const configuration = JSON.parse(configurationString);
    return configuration;
}

export function createSampleConfiguration(folder: vscode.WorkspaceFolder) {
    const cloudServices = [
        {
            type: 'oci',
            name: 'Default OCI services',
            data: {
                version: '1.0',
                authentication: {
                    type: 'configFile',
                    path: 'default',
                    profile: 'default'
                },
                context: {
                    compartment: 'ocid1.compartment.oc1..aaaaaaaaal7rv2u5bgrz42nc2r36zpeir6fv47l5j3z6up2iajjb3ooalcfa',
                    devopsProject: 'ocid1.devopsproject.oc1.iad.amaaaaaabnqp5kqamztzfqeqywsi2t243a4qzlmxk5syjiantkdlv45b7lra',
                    codeRepository: 'ocid1.devopsrepository.oc1.iad.amaaaaaabnqp5kqat2b4bkua7xwq25eq2a3bt5ixlpye76qc5hvgtygsskpa'
                },
                services: {
                    buildPipelines: {
                        items: [
                            {
                                'ocid': 'ocid1.devopsbuildpipeline.oc1.iad.amaaaaaabnqp5kqa4fpld5uqchwdhb4wjyvtptx6kyvriy2ln6u25nagryvq',
                                'displayName': 'Devbuild (fat JAR)'
                            },
                            {
                                'ocid': 'ocid1.devopsbuildpipeline.oc1.iad.amaaaaaabnqp5kqabpfmt3l47ej4m6c53mtyl7ziqbhhktbp5em4tt6x33rq',
                                'displayName': 'Build Native Image'
                            }
                        ]
                    },
                    deploymentPipelines: {
                        items: [
                        ]
                    },
                    projectArtifacts: {
                        items: [
                            {
                                'ocid': 'ocid1.devopsdeployartifact.oc1.iad.amaaaaaabnqp5kqascwjldbleuodzzzkf5xnyytriolhqi4rkoy64zwtkkta',
                                'displayName': 'Last Successful Devbuild (fat JAR)'
                            }
                        ]
                    },
                    containerRepository: {
                        items: [
                            {
                                'ocid': 'ocid1.containerrepo.oc1.iad.0.cloudnative-devrel.aaaaaaaakxiqxm635nn3isqyawmbyhkg4bebfyai6afscegnekbxtuh3ubya',
                                'displayName': 'MicronautMavenApp'
                            }
                        ]
                    },
                    knowledgeBases: {
                        settings: {
                            'abc': 'defgh'
                        },
                        items: [
                            {
                                'ocid': 'ocid1.admknowledgebase.oc1.iad.amaaaaaabnqp5kqal7yik7wznbcunzgjvyheq466qr2pv3mc4dric3ztisoq',
                                'displayName': 'Vulnerability Audits'
                            }
                        ]
                    }
                }
            }
        },
        // {
        //     type: 'oci',
        //     name: 'Another OCI Services',
        //     data: {
        //         version: '1.0',
        //         authentication: {
        //             type: 'configFile',
        //             path: 'default',
        //             profile: 'default'
        //         }
        //     }
        // }
    ]
    storeCloudServices(folder.uri.fsPath, cloudServices, true);
}

export function storeCloudSupportData(cloudSupport: model.CloudSupport, folders: string[], servicesData: any[]) {
    for (let idx = 0; idx < folders.length; idx++) {
        const cloudServices = [
            {
                type: cloudSupport.getType(),
                name: cloudSupport.getName(),
                data: servicesData[idx]
            }
        ]
        storeCloudServices(folders[idx], cloudServices, false);
    }
}

function storeCloudServices(folder: string, cloudServices: any[], overwriteExisting: boolean) {
    const configuration = {
        version: '1.0',
        cloudServices: cloudServices
    }
    store(folder, configuration, overwriteExisting);
}

function store(folder: string, configuration: any, overwriteExisting: boolean) {
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
