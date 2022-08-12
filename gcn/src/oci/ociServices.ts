/*
 * Copyright (c) 2022, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as gcnServices from '../gcnServices';
import * as model from '../model';
import * as nodes from '../nodes';
import * as dialogs from '../dialogs';
import * as servicesView from '../servicesView';
import * as ociContext from './ociContext';
import * as dataSupport from './dataSupport';

import * as buildServices from './buildServices';
import * as ociService from './ociService';
import * as deploymentServices from './deploymentServices';
import * as deployArtifactServices from './deployArtifactServices';
import * as artifactServices from './artifactServices';
import * as containerServices from './containerServices';
import * as knowledgeBaseServices from './knowledgeBaseServices';


export const DATA_NAME = 'services';

export function initialize(context: vscode.ExtensionContext) {
    buildServices.initialize(context);
    deploymentServices.initialize(context);
    deployArtifactServices.initialize(context);
    artifactServices.initialize(context);
    containerServices.initialize(context);
    knowledgeBaseServices.initialize(context);
}

export function findByNode(node: nodes.BaseNode): OciServices | undefined {
    const cloudServices = servicesView.findCloudServicesByNode(node);
    return cloudServices instanceof OciServices ? cloudServices as OciServices : undefined;
}

export function findByFolder(folder: gcnServices.FolderData): OciServices[] {
    const ociServices: OciServices[] = [];
    const cloudServices = folder.services;
    for (const cloudService of cloudServices) {
        if (cloudService instanceof OciServices) {
            ociServices.push(cloudService as OciServices);
        }
    }
    return ociServices;
}

export function create(oci: ociContext.Context, servicesData: any, dataChanged: dataSupport.DataChanged): model.CloudServices {
    return new OciServices(oci, servicesData, dataChanged);
}

export async function importServices(oci: ociContext.Context): Promise<dataSupport.DataProducer> {
    // TODO: Might return populated instance of OciServices which internally called importServices() on every Service
    const data: any = {};
    const buildServicesData = await buildServices.importServices(oci);
    if (buildServicesData) {
        data[buildServicesData.getDataName()] = buildServicesData.getData();
    }
    const deploymentServicesData = await deploymentServices.importServices(oci);
    if (deploymentServicesData) {
        data[deploymentServicesData.getDataName()] = deploymentServicesData.getData();
    }
    const deployArtifactServicesData = await deployArtifactServices.importServices(oci);
    if (deployArtifactServicesData) {
        data[deployArtifactServicesData.getDataName()] = deployArtifactServicesData.getData();
    }
    const artifactServicesData = await artifactServices.importServices(oci);
    if (artifactServicesData) {
        data[artifactServicesData.getDataName()] = artifactServicesData.getData();
    }
    const containerServicesData = await containerServices.importServices(oci);
    if (containerServicesData) {
        data[containerServicesData.getDataName()] = containerServicesData.getData();
    }
    const knowledgeBaseServicesData = await knowledgeBaseServices.importServices(oci);
    if (knowledgeBaseServicesData) {
        data[knowledgeBaseServicesData.getDataName()] = knowledgeBaseServicesData.getData();
    }
    const result: dataSupport.DataProducer = {
        getDataName: () => DATA_NAME,
        getData: () => data
    };
    return result;
}

export class OciServices implements model.CloudServices, dataSupport.DataProducer {

    private readonly oci: ociContext.Context;
    private servicesData: any;
    private readonly services: ociService.Service[];
    private treeChanged: nodes.TreeChanged | undefined;

    constructor(oci: ociContext.Context, servicesData: any, dataChanged: dataSupport.DataChanged) {
        this.oci = oci;
        this.servicesData = servicesData ? servicesData : {};
        const serviceDataChanged: dataSupport.DataChanged = (dataProducer?: dataSupport.DataProducer) => {
            if (dataProducer) {
                const dataName = dataProducer.getDataName();
                const data = dataProducer.getData();
                if (data) {
                    this.servicesData[dataName] = data;
                } else {
                    delete this.servicesData[dataName];
                }
            }
            dataChanged(this);
            if (this.treeChanged) {
                let nodesCount = 0;
                for (const service of this.services) {
                    nodesCount += service.getNodes().length;
                }
                if (nodesCount === 0) {
                    this.treeChanged(); // reload nodes to show '<no OCI services defined>'
                }
            }
        }
        this.services = [
            buildServices.create(oci, this.servicesData[buildServices.DATA_NAME], serviceDataChanged),
            deploymentServices.create(oci, this.servicesData[deploymentServices.DATA_NAME], serviceDataChanged),
            deployArtifactServices.create(oci, this.servicesData[deployArtifactServices.DATA_NAME], serviceDataChanged),
            artifactServices.create(oci, this.servicesData[artifactServices.DATA_NAME], serviceDataChanged),
            containerServices.create(oci, this.servicesData[containerServices.DATA_NAME], serviceDataChanged),
            knowledgeBaseServices.create(oci, this.servicesData[knowledgeBaseServices.DATA_NAME], serviceDataChanged)
        ];
    
        // let saveData: boolean = false;
        // for (const featurePlugin of ociSupport.SERVICE_PLUGINS) {
        //     const featureData = this.servicesData?.[featurePlugin.getServiceType()]?.settings || {};

        //     const createdData: any = featurePlugin.initialize(folder, featureData, () => {
        //         this.servicesData[featurePlugin.getServiceType()] = createdData;
        //         this.dataChanged();
        //     }) || featureData;

        //     if (createdData != featureData) {
        //         this.servicesData[featurePlugin.getServiceType()].settings = createdData;
        //         saveData = true;
        //     }
        // }
        // if (saveData) {
        //     dataChanged();
        // }
    }

    public getContext(): ociContext.Context {
        return this.oci;
    }

    public getService(dataName: string): ociService.Service | undefined {
        for (const service of this.services) {
            if (service.getDataName() === dataName) {
                return service;
            }
        }
        return undefined;
    }

    async addContent() {
        const choices: dialogs.QuickPickObject[] = [];
        for (const service of this.services) {
            const serviceContent = service.getAddContentChoices();
            if (serviceContent) {
                choices.push(...serviceContent);
            }
        }
        if (choices.length === 0) {
            vscode.window.showWarningMessage('No content available.');
        } else {
            const selection = await vscode.window.showQuickPick(choices, {
                placeHolder: 'Select Content to Add'
            })
            if (selection?.object) {
                selection.object();
            }
        }
    }

    buildNodes(treeChanged: nodes.TreeChanged): void {
        if (!this.oci.getConfigurationProblem()) {
            this.treeChanged = treeChanged;
            for (const service of this.services) {
                service.buildNodes(treeChanged);
            }
        }
    }

    getNodes(): nodes.BaseNode[] {
        const serviceNodes: nodes.BaseNode[] = [];
        const configurationProblem = this.oci.getConfigurationProblem();
        if (configurationProblem) {
            serviceNodes.push(new nodes.TextNode(`<${configurationProblem}>`));
        } else {
            for (const service of this.services) {
                serviceNodes.push(...service.getNodes());
            }
            if (serviceNodes.length === 0) {
                return [ new nodes.TextNode('<no OCI services defined>') ];
            }
        }
        return serviceNodes;
    }

    getDataName(): string {
        return DATA_NAME;
    }

    getData(): any {
        return this.servicesData;
    }

}
