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
import * as ociNodes from './ociNodes';

import * as buildServices from './buildServices';
import * as ociService from './ociService';
import * as deploymentServices from './deploymentServices';
import * as deployArtifactServices from './deployArtifactServices';
import * as artifactServices from './artifactServices';
import * as containerServices from './containerServices';
import * as knowledgeBaseServices from './knowledgeBaseServices';


export const DATA_NAME = 'services';

export const ADD_ACTION_NAME = 'Add OCI Service';

export function initialize(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.commands.registerCommand('gcn.oci.openInConsole', (...params: any[]) => {
        if (params[0]?.getAddress) {
            ociNodes.openInConsole(params[0] as ociNodes.CloudConsoleItem);
        }
	}));

    function openCodeRepoInConsole(folder: gcnServices.FolderData) {
        const ociServices = findByFolderData(folder);
        if (ociServices?.length) {
            const ociService = ociServices[0];
            const context = ociService.getContext();
            const codeRepository = context.getCodeRepository();
            const address = `https://cloud.oracle.com/devops-coderepository/repositories/${codeRepository}`;
            ociNodes.openInConsole(address);
        }
    }
    context.subscriptions.push(vscode.commands.registerCommand('gcn.oci.openCodeRepositoryInConsole', (...params: any[]) => {
        if (params[0]?.folder) {
            openCodeRepoInConsole(params[0].folder);
        }
	}));
    context.subscriptions.push(vscode.commands.registerCommand('gcn.oci.openCodeRepositoryInConsole_Global', () => {
        dialogs.selectFolder('Open Folder Code Repository', 'Select deployed folder', true).then(folder => {
            if (folder === null) {
                vscode.window.showErrorMessage('No deployed folder available.');
            } else if (folder) {
                openCodeRepoInConsole(folder);
            }
        });
	}));

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

export function findByFolder(folder: vscode.Uri): OciServices[] | undefined {
    const folderData = gcnServices.findFolderData(folder);
    if (!folderData) {
        return undefined;
    }
    return findByFolderData(folderData);
}

export function findByFolderData(folder: gcnServices.FolderData): OciServices[] {
    const ociServices: OciServices[] = [];
    const cloudServices = folder.services;
    for (const cloudService of cloudServices) {
        if (cloudService instanceof OciServices) {
            ociServices.push(cloudService as OciServices);
        }
    }
    return ociServices;
}

export async function importServices(oci: ociContext.Context): Promise<dataSupport.DataProducer> {
    // TODO: Might return populated instance of OciServices which internally called importServices() on every Service
    const data: any = {};
    try {
        const buildServicesData = await buildServices.importServices(oci);
        if (buildServicesData) {
            data[buildServicesData.getDataName()] = buildServicesData.getData();
        }
    } catch (err) {
        dialogs.showErrorMessage('Failed to import build pipelines', err);
    }
    try {
        const deploymentServicesData = await deploymentServices.importServices(oci);
        if (deploymentServicesData) {
            data[deploymentServicesData.getDataName()] = deploymentServicesData.getData();
        }
    } catch (err) {
        dialogs.showErrorMessage('Failed to import deployment pipelines', err);
    }
    try {
        const deployArtifactServicesData = await deployArtifactServices.importServices(oci);
        if (deployArtifactServicesData) {
            data[deployArtifactServicesData.getDataName()] = deployArtifactServicesData.getData();
        }
    } catch (err) {
        dialogs.showErrorMessage('Failed to import build artifacts', err);
    }
    try {
        const artifactServicesData = await artifactServices.importServices(oci);
        if (artifactServicesData) {
            data[artifactServicesData.getDataName()] = artifactServicesData.getData();
        }
    } catch (err) {
        dialogs.showErrorMessage('Failed to import artifact repositories', err);
    }
    try {
        const containerServicesData = await containerServices.importServices(oci);
        if (containerServicesData) {
            data[containerServicesData.getDataName()] = containerServicesData.getData();
        }
    } catch (err) {
        dialogs.showErrorMessage('Failed to import container repositories', err);
    }
    try {
        const knowledgeBaseServicesData = await knowledgeBaseServices.importServices(oci);
        if (knowledgeBaseServicesData) {
            data[knowledgeBaseServicesData.getDataName()] = knowledgeBaseServicesData.getData();
        }
    } catch (err) {
        dialogs.showErrorMessage('Failed to import knowledge bases', err);
    }
    const result: dataSupport.DataProducer = {
        getDataName: () => DATA_NAME,
        getData: () => data
    };
    return result;
}

export class OciServices implements model.CloudServices, dataSupport.DataProducer {

    // private readonly folder: vscode.WorkspaceFolder;
    private readonly oci: ociContext.Context;
    private servicesData: any;
    private readonly services: ociService.Service[];
    private treeChanged: nodes.TreeChanged | undefined;

    constructor(folder: vscode.WorkspaceFolder, oci: ociContext.Context, servicesData: any, dataChanged: dataSupport.DataChanged) {
        // this.folder = folder;
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
            if (this.treeChanged && (dataProducer as ociService.Service).getNodes().length === 0) {
                this.treeChanged(); // reload nodes to remove service container if displayed, and eventually show '<no OCI services defined>'
            }
        }
        this.services = [
            buildServices.create(folder, oci, this.servicesData[buildServices.DATA_NAME], serviceDataChanged),
            deploymentServices.create(folder, oci, this.servicesData[deploymentServices.DATA_NAME], serviceDataChanged),
            deployArtifactServices.create(folder, oci, this.servicesData[deployArtifactServices.DATA_NAME], serviceDataChanged),
            artifactServices.create(folder, oci, this.servicesData[artifactServices.DATA_NAME], serviceDataChanged),
            containerServices.create(folder, oci, this.servicesData[containerServices.DATA_NAME], serviceDataChanged),
            knowledgeBaseServices.create(folder, oci, this.servicesData[knowledgeBaseServices.DATA_NAME], serviceDataChanged)
        ];
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
                title: ADD_ACTION_NAME,
                placeHolder: 'Select OCI service to add'
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
