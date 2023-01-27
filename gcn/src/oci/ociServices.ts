/*
 * Copyright (c) 2022, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as common from 'oci-common';
import * as gcnServices from '../gcnServices';
import * as model from '../model';
import * as nodes from '../nodes';
import * as dialogs from '../dialogs';
import * as servicesView from '../servicesView';
import * as logUtils from '../logUtils'
import * as ociContext from './ociContext';
import * as dataSupport from './dataSupport';
import * as ociNodes from './ociNodes';
import * as ociUtils from './ociUtils';

import * as buildServices from './buildServices';
import * as ociService from './ociService';
import * as deploymentServices from './deploymentServices';
// import * as deployArtifactServices from './deployArtifactServices';
import * as artifactServices from './artifactServices';
import * as containerServices from './containerServices';
import * as knowledgeBaseServices from './knowledgeBaseServices';
import * as containerInstanceServices from './containerInstanceServices';


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
                vscode.window.showWarningMessage('No deployed folder available.');
            } else if (folder) {
                openCodeRepoInConsole(folder);
            }
        });
	}));
    function openDevOpsProjectInConsole(folder: gcnServices.FolderData) {
        const ociServices = findByFolderData(folder);
        if (ociServices?.length) {
            const ociService = ociServices[0];
            const context = ociService.getContext();
            const devopsProject = context.getDevOpsProject();
            const address = `https://cloud.oracle.com/devops-project/projects/${devopsProject}`;
            ociNodes.openInConsole(address);
        }
    }
    context.subscriptions.push(vscode.commands.registerCommand('gcn.oci.openDevOpsProjectInConsole', (...params: any[]) => {
        if (params[0]?.folder) {
            openDevOpsProjectInConsole(params[0].folder);
        }
	}));
    context.subscriptions.push(vscode.commands.registerCommand('gcn.oci.openDevOpsProjectInConsole_Global', async () => {
        const projects: string[] = [];
        const folderData = await gcnServices.getFolderData();
        for (const folder of folderData) {
            const ociServices = findByFolderData(folder)
            for (const ociService of ociServices) {
                const project = ociService.getContext().getDevOpsProject();
                if (!projects.includes(project)) {
                    projects.push(project);
                }
            }
        }
        if (projects.length === 1) {
            const address = `https://cloud.oracle.com/devops-project/projects/${projects[0]}`;
            ociNodes.openInConsole(address);
        } else {
            dialogs.selectFolder('Open DevOps Project', 'Select deployed folder', true).then(folder => {
                if (folder === null) {
                    vscode.window.showWarningMessage('No deployed folder available.');
                } else if (folder) {
                    openDevOpsProjectInConsole(folder);
                }
            });
        }
	}));

    buildServices.initialize(context);
    deploymentServices.initialize(context);
    // deployArtifactServices.initialize(context);
    artifactServices.initialize(context);
    containerServices.initialize(context);
    knowledgeBaseServices.initialize(context);
    containerInstanceServices.initialize(context);
}

export function findByNode(node: nodes.BaseNode): OciServices | undefined {
    const cloudServices = servicesView.findCloudServicesByNode(node);
    return cloudServices instanceof OciServices ? cloudServices as OciServices : undefined;
}

export async function findByFolder(folder: vscode.Uri): Promise<OciServices[] | undefined> {
    const folderData = await gcnServices.findFolderData(folder);
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

export async function importServices(oci: ociContext.Context, projectResources: any | undefined, codeRepositoryResources: any | undefined): Promise<dataSupport.DataProducer> {
    // TODO: Might return populated instance of OciServices which internally called importServices() on every Service
    const data: any = {};
    try {
        const buildServicesData = await buildServices.importServices(oci, projectResources, codeRepositoryResources);
        if (buildServicesData) {
            data[buildServicesData.getDataName()] = buildServicesData.getData();
        }
    } catch (err) {
        dialogs.showErrorMessage('Failed to import build pipelines', err);
    }
    try {
        const deploymentServicesData = await deploymentServices.importServices(oci, projectResources, codeRepositoryResources);
        if (deploymentServicesData) {
            data[deploymentServicesData.getDataName()] = deploymentServicesData.getData();
        }
    } catch (err) {
        dialogs.showErrorMessage('Failed to import deployment pipelines', err);
    }
    // try {
    //     const deployArtifactServicesData = await deployArtifactServices.importServices(oci, projectResources, codeRepositoryResources);
    //     if (deployArtifactServicesData) {
    //         data[deployArtifactServicesData.getDataName()] = deployArtifactServicesData.getData();
    //     }
    // } catch (err) {
    //     dialogs.showErrorMessage('Failed to import build artifacts', err);
    // }
    try {
        const artifactServicesData = await artifactServices.importServices(oci, projectResources, codeRepositoryResources);
        if (artifactServicesData) {
            data[artifactServicesData.getDataName()] = artifactServicesData.getData();
        }
    } catch (err) {
        dialogs.showErrorMessage('Failed to import artifact repositories', err);
    }
    try {
        const containerServicesData = await containerServices.importServices(oci, projectResources, codeRepositoryResources);
        if (containerServicesData) {
            data[containerServicesData.getDataName()] = containerServicesData.getData();
        }
    } catch (err) {
        dialogs.showErrorMessage('Failed to import container repositories', err);
    }
    try {
        const knowledgeBaseServicesData = await knowledgeBaseServices.importServices(oci, projectResources, codeRepositoryResources);
        if (knowledgeBaseServicesData) {
            data[knowledgeBaseServicesData.getDataName()] = knowledgeBaseServicesData.getData();
        }
    } catch (err) {
        dialogs.showErrorMessage('Failed to import knowledge bases', err);
    }
    try {
        const containerInstanceServicesData = await containerInstanceServices.importServices(oci, projectResources, codeRepositoryResources);
        if (containerInstanceServicesData) {
            data[containerInstanceServicesData.getDataName()] = containerInstanceServicesData.getData();
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

    private readonly oci: ociContext.Context;
    private servicesData: any;
    private readonly services: ociService.Service[];
    private treeChanged: nodes.TreeChanged | undefined;

    private decorableContainer: nodes.DecorableNode | undefined;

    constructor(folder: vscode.WorkspaceFolder, oci: ociContext.Context, servicesData: any, dataChanged: dataSupport.DataChanged) {
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
            // deployArtifactServices.create(folder, oci, this.servicesData[deployArtifactServices.DATA_NAME], serviceDataChanged),
            artifactServices.create(folder, oci, this.servicesData[artifactServices.DATA_NAME], serviceDataChanged),
            containerServices.create(folder, oci, this.servicesData[containerServices.DATA_NAME], serviceDataChanged),
            knowledgeBaseServices.create(folder, oci, this.servicesData[knowledgeBaseServices.DATA_NAME], serviceDataChanged),
            containerInstanceServices.create(folder, oci, this.servicesData[containerInstanceServices.DATA_NAME], serviceDataChanged)
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

    public setDecorableContainer(container: nodes.DecorableNode) {
        this.decorableContainer = container;
    }

    public decorateContainer(devopsDecorations: boolean) {
        if (this.decorableContainer) {
            if (!devopsDecorations) {
                this.decorableContainer.decorate({
                    description: undefined,
                    tooltip: 'Local folder deployed to OCI'
                });
            } else {
                this.decorableContainer.decorate({
                    description: '[resolving OCI target...]',
                    tooltip: 'Local folder deployed to OCI'
                });
                async function lazilyDecorateContainer(provider: common.ConfigFileAuthenticationDetailsProvider, project: string, repository: string, container: nodes.DecorableNode) {
                    try {
                        const devopsProject = await ociUtils.getDevopsProject(provider, project);
                        const codeRepository = await ociUtils.getCodeRepository(provider, repository);
                        container.decorate({
                            description: `[${devopsProject.name}/${codeRepository.name}]`,
                            tooltip: `Local folder deployed to OCI as code repository ${codeRepository.name} in devops project ${devopsProject.name}`
                        }, true);
                    } catch (err) {
                        container.decorate({
                            description: '[unknown OCI target]',
                            tooltip: 'Local folder deployed to OCI'
                        }, true);
                        logUtils.logError(`[folder oci services] ${dialogs.getErrorMessage('Failed to resolve container decoration', err)}`);
                    }
                }
                lazilyDecorateContainer(this.oci.getProvider(), this.oci.getDevOpsProject(), this.oci.getCodeRepository(), this.decorableContainer);
            }
        }
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
