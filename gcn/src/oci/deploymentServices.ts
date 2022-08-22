/*
 * Copyright (c) 2022, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as devops from 'oci-devops';
import * as nodes from '../nodes';
import * as dialogs from '../dialogs';
import * as ociUtils from './ociUtils';
import * as ociContext from './ociContext';
import * as ociService from './ociService';
import * as ociServices  from './ociServices';
import * as dataSupport from './dataSupport';
import * as ociNodes from './ociNodes';


export const DATA_NAME = 'deploymentPipelines';

const ICON = 'rocket';

type DeploymentPipeline = {
    ocid: string,
    displayName: string
}

export function initialize(_context: vscode.ExtensionContext) {
    nodes.registerRenameableNode(DeploymentPipelineNode.CONTEXT);
    nodes.registerRemovableNode(DeploymentPipelineNode.CONTEXT);
    ociNodes.registerOpenInConsoleNode(DeploymentPipelineNode.CONTEXT);
}

export async function importServices(_oci: ociContext.Context): Promise<dataSupport.DataProducer | undefined> {
    // TODO: Might return populated instance of Service which internally called importServices()
    return undefined;
}

export function create(folder: vscode.WorkspaceFolder, oci: ociContext.Context, serviceData: any | undefined, dataChanged: dataSupport.DataChanged): ociService.Service {
    return new Service(folder, oci, serviceData, dataChanged);
}

export function findByNode(node: nodes.BaseNode): Service | undefined {
    const services = ociServices.findByNode(node);
    const service = services?.getService(DATA_NAME);
    return service instanceof Service ? service as Service : undefined;
}

async function selectDeploymentPipelines(oci: ociContext.Context, ignore: DeploymentPipeline[]): Promise<DeploymentPipeline[] | undefined> {
    function shouldIgnore(ocid: string) {
        for (const item of ignore) {
            if (item.ocid === ocid) {
                return true;
            }
        }
        return false;
    }
    async function listDeploymentPipelines(oci: ociContext.Context): Promise<devops.models.DeployPipelineSummary[] | undefined> {
        // TODO: display the progress in QuickPick
        return await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Reading project build pipelines...',
            cancellable: false
        }, (_progress, _token) => {
            return new Promise(async (resolve) => {
                resolve((await ociUtils.listDeploymentPipelines(oci.getProvider(), oci.getDevOpsProject()))?.deployPipelineCollection?.items);
            });
        })
    }
    const pipelines: DeploymentPipeline[] = [];
    const existing = await listDeploymentPipelines(oci);
    if (existing) {
        let idx = 1;
        for (const item of existing) {
            if (!shouldIgnore(item.id)) {
                const displayName = item.displayName ? item.displayName : `Deployment Pipeline ${idx++}`;
                pipelines.push({
                    ocid: item.id,
                    displayName: displayName
                });
            }
        }
    }
    const choices: dialogs.QuickPickObject[] = [];
    for (const pipeline of pipelines) {
        choices.push(new dialogs.QuickPickObject(`$(${ICON}) ${pipeline.displayName}`, undefined, undefined, pipeline));
    }
    // TODO: display pipelines for the repository and for the project
    // TODO: provide a possibility to create a new pipeline
    // TODO: provide a possibility to select pipelines from different projects / compartments
    if (choices.length === 0) {
        vscode.window.showWarningMessage('All deployment pipelines already added or no deployment pipelines available.')
    } else {
        const selection = await vscode.window.showQuickPick(choices, {
            placeHolder: 'Select Deployment Pipeline(s) to Add',
            canPickMany: true
        })
        if (selection && selection.length > 0) {
            const selected: DeploymentPipeline[] = [];
            for (const sel of selection) {
                selected.push(sel.object as DeploymentPipeline);
            }
            return selected;
        }
    }
    return undefined;
}

class Service extends ociService.Service {

    constructor(folder: vscode.WorkspaceFolder, oci: ociContext.Context, serviceData: any | undefined, dataChanged: dataSupport.DataChanged) {
        super(folder, oci, DATA_NAME, serviceData, dataChanged);
    }

    async addContent() {
        if (this.treeChanged) {
            const displayed = this.itemsData ? this.itemsData as DeploymentPipeline[] : [];
            const selected = await selectDeploymentPipelines(this.oci, displayed);
            if (selected) {
                const added: nodes.BaseNode[] = [];
                for (const pipeline of selected) {
                    added.push(new DeploymentPipelineNode(pipeline, this.oci, this.treeChanged));
                }
                this.addServiceNodes(added);
            }
        }
    }

    getAddContentChoices(): dialogs.QuickPickObject[] | undefined {
        return [
            new dialogs.QuickPickObject(`$(${ICON}) Add Deployment Pipeline`, undefined, 'Add existing deployment pipeline', () => this.addContent())
        ];
    }

    protected buildNodesImpl(oci: ociContext.Context, itemsData: any[], treeChanged: nodes.TreeChanged): nodes.BaseNode[] {
        const nodes: nodes.BaseNode[] = [];
        for (const itemData of itemsData) {
            const ocid = itemData.ocid;
            const displayName = itemData.displayName;
            if (ocid && displayName) {
                const object: DeploymentPipeline = {
                    ocid: ocid,
                    displayName: displayName
                }
                nodes.push(new DeploymentPipelineNode(object, oci, treeChanged));
            }
        }
        return nodes;
    }

}

class DeploymentPipelineNode extends nodes.ChangeableNode implements nodes.RemovableNode, nodes.RenameableNode, ociNodes.CloudConsoleItem, ociNodes.OciResource, dataSupport.DataProducer {

    static readonly DATA_NAME = 'deploymentPipelineNode';
    static readonly CONTEXT = `gcn.oci.${DeploymentPipelineNode.DATA_NAME}`;
    
    private object: DeploymentPipeline;
    private oci: ociContext.Context;

    constructor(object: DeploymentPipeline, oci: ociContext.Context, treeChanged: nodes.TreeChanged) {
        super(object.displayName, undefined, DeploymentPipelineNode.CONTEXT, undefined, undefined, treeChanged);
        this.object = object;
        this.oci = oci;
        this.iconPath = new vscode.ThemeIcon(ICON);
        this.updateAppearance();
    }

    getId() {
        return this.object.ocid;
    }

    async getResource(): Promise<devops.models.DeployPipeline> {
        return (await ociUtils.getDeployPipeline(this.oci.getProvider(), this.object.ocid)).deployPipeline;
    }

    rename() {
        const service = findByNode(this);
        service?.renameServiceNode(this, 'Rename Deployment Pipeline', name => this.object.displayName = name);
    }

    remove() {
        const service = findByNode(this);
        service?.removeServiceNodes(this);
    }

    getDataName() {
        return DeploymentPipelineNode.DATA_NAME;
    }

    getData(): any {
        return this.object;
    }

    async getAddress(): Promise<string> {
        const pipeline = await this.getResource();
        return `https://cloud.oracle.com/devops-deployment/projects/${pipeline.projectId}/pipelines/${pipeline.id}`;
    }

}
