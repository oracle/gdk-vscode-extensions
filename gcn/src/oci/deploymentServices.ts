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
import * as kubernetesUtils from "../kubernetesUtils";
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
    displayName: string,
    lastDeployment?: string
}

export function initialize(context: vscode.ExtensionContext) {
    nodes.registerRenameableNode(DeploymentPipelineNode.CONTEXTS);
    nodes.registerRemovableNode(DeploymentPipelineNode.CONTEXTS);
    ociNodes.registerOpenInConsoleNode(DeploymentPipelineNode.CONTEXTS);

    context.subscriptions.push(vscode.commands.registerCommand('gcn.oci.runDeployPipeline', (node: DeploymentPipelineNode) => {
		node.runPipeline();
	}));
    context.subscriptions.push(vscode.commands.registerCommand('gcn.oci.openInBrowser', (node: DeploymentPipelineNode) => {
		node.openDeploymentInBrowser();
	}));
    context.subscriptions.push(vscode.commands.registerCommand('gcn.oci.showDeployOutput', (node: DeploymentPipelineNode) => {
		node.showDeploymentOutput();
	}));
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
                resolve((await ociUtils.listDeployPipelines(oci.getProvider(), oci.getDevOpsProject()))?.deployPipelineCollection?.items);
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
            const lastDeployment = itemData.lastDeployment;
            if (ocid && displayName) {
                const object: DeploymentPipeline = {
                    ocid: ocid,
                    displayName: displayName,
                    lastDeployment: lastDeployment
                }
                nodes.push(new DeploymentPipelineNode(object, oci, treeChanged));
            }
        }
        return nodes;
    }

}

class DeploymentPipelineNode extends nodes.ChangeableNode implements nodes.RemovableNode, nodes.RenameableNode, ociNodes.CloudConsoleItem, ociNodes.OciResource, dataSupport.DataProducer {

    static readonly DATA_NAME = 'deploymentPipelineNode';
    static readonly CONTEXTS = [
        `gcn.oci.${DeploymentPipelineNode.DATA_NAME}`, // default
        `gcn.oci.${DeploymentPipelineNode.DATA_NAME}-in-progress`, // in progress
        `gcn.oci.${DeploymentPipelineNode.DATA_NAME}-deployments-available` // artifacts available
    ];
    
    private object: DeploymentPipeline;
    private oci: ociContext.Context;
    private lastDeployment?: { ocid: string, state?: string, output?: vscode.OutputChannel, deploymentName?: string };

    constructor(object: DeploymentPipeline, oci: ociContext.Context, treeChanged: nodes.TreeChanged) {
        super(object.displayName, undefined, DeploymentPipelineNode.CONTEXTS[0], undefined, undefined, treeChanged);
        this.object = object;
        this.oci = oci;
        this.iconPath = new vscode.ThemeIcon(ICON);
        this.command = { command: 'gcn.oci.showDeployOutput', title: 'Show Deployment Output', arguments: [this] };
        this.updateAppearance();
        if (this.object.lastDeployment) {
            try {
                ociUtils.getDeployment(this.oci.getProvider(), this.object.lastDeployment).then(deploymentResp => {
                    const deployment = deploymentResp.deployment;
                    const output = deployment.displayName ? vscode.window.createOutputChannel(deployment.displayName) : undefined;
                    output?.hide();
                    this.updateLastDeployment(deployment.id, deployment.lifecycleState, output);
                    this.updateWhenCompleted(deployment.id, deployment.compartmentId);
                });
            } catch (err) {
                // TODO: handle?
            }
        }
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

    runPipeline() {
        if (!ociUtils.isRunning(this.lastDeployment?.state)) {
            const deploymentName = `${this.label}-${ociUtils.getTimestamp()} (from VS Code)`;
            vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Starting deployment "${deploymentName}"...`,
                cancellable: false
            }, (_progress, _token) => {
                return new Promise(async resolve => {
                    try {
                        const buildPipelineID = (await this.getResource()).freeformTags?.gcn_tooling_buildPipelineOCID;
                        if (buildPipelineID) {
                            const lastBuilds = (await ociUtils.listBuildRuns(this.oci.getProvider(), buildPipelineID))?.buildRunSummaryCollection.items;
                            const buildRunId = lastBuilds?.find(build => ociUtils.isSuccess(build.lifecycleState))?.id;
                            let artifactsCount: number | undefined;
                            if (buildRunId) {
                                try {
                                    artifactsCount = (await ociUtils.getBuildRun(this.oci.getProvider(), buildRunId)).buildRun.buildOutputs?.deliveredArtifacts?.items.length;
                                } catch (err) {
                                    // TODO: handle?
                                }
                            }
                            if (!artifactsCount) {
                                vscode.window.showErrorMessage('No build artifact to deploy. Make sure you run the appropriate build pipeline first.');
                                resolve(false);
                                return;
                            }
                        }
                        const deployment = (await ociUtils.createDeployment(this.oci.getProvider(), this.object.ocid, deploymentName))?.deployment;
                        resolve(true);
                        if (deployment) {
                            this.object.lastDeployment = deployment.id;
                            const service = findByNode(this);
                            service?.serviceNodesChanged(this);
                            this.updateLastDeployment(deployment.id, deployment.lifecycleState, deployment.displayName ? vscode.window.createOutputChannel(deployment.displayName) : undefined);
                            this.showDeploymentOutput();
                            this.updateWhenCompleted(deployment.id, deployment.compartmentId);
                        }
                    } catch (err) {
                        if ((err as any).message) {
                            vscode.window.showErrorMessage((err as any).message);
                        }
                        resolve(false)
                    }
                });
            });
        }
    }

    openDeploymentInBrowser() {
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Resolving deployment...',
            cancellable: false
        }, (_progress, _token) => {
            return new Promise(async resolve => {
                try {
                    const kubectl = await kubernetesUtils.getKubectlAPI();
                    if (!kubectl) {
                        resolve(false);
                        return;
                    }
                    const deploymentName = this.lastDeployment?.deploymentName;
                    if (!deploymentName) {
                        vscode.window.showErrorMessage('Cannot resolve the latest deployment.');
                        resolve(false);
                        return;
                    }
                    // TODO: get remote port number from deployment ?
                    const remotePort = 8080;
                    const localPort = this.random(3000, 50000);
                    const result = await kubectl.portForward(`deployments/${deploymentName}`, undefined, localPort, remotePort, { showInUI: { location: 'status-bar' } }); 
                    if (!result) {
                        vscode.window.showErrorMessage(`Cannot forward port for the latest deployment of ${deploymentName}.`);
                        resolve(false);
                        return;
                    }
                    vscode.env.openExternal(vscode.Uri.parse(`http://localhost:${localPort}`));
                    resolve(true);
                } catch (err) {
                    if ((err as any).message) {
                        vscode.window.showErrorMessage((err as any).message);
                    }
                    resolve(false)
                }
            });
        });
    }

    showDeploymentOutput() {
        this.lastDeployment?.output?.show();
    }

    private updateLastDeployment(ocid: string, state?: string, output?: vscode.OutputChannel, deploymentName?: string) {
        if (this.lastDeployment?.output !== output) {
            this.lastDeployment?.output?.hide();
            this.lastDeployment?.output?.dispose();
        }
        this.lastDeployment = { ocid, state, output, deploymentName };
        switch (state) {
            case 'ACCEPTED':
            case 'IN_PROGRESS':
            case 'CANCELING':
                this.iconPath = new vscode.ThemeIcon(ICON, new vscode.ThemeColor('charts.yellow'));
                this.contextValue = DeploymentPipelineNode.CONTEXTS[1];
                break;
            case 'SUCCEEDED':
                this.iconPath = new vscode.ThemeIcon(ICON, new vscode.ThemeColor('charts.green'));
                this.contextValue = deploymentName ? DeploymentPipelineNode.CONTEXTS[2] : DeploymentPipelineNode.CONTEXTS[0];
                break;
            case 'FAILED':
                this.iconPath = new vscode.ThemeIcon(ICON, new vscode.ThemeColor('charts.red'));
                this.contextValue = DeploymentPipelineNode.CONTEXTS[0];
                break;
            default:
                this.iconPath = new vscode.ThemeIcon(ICON);
                this.contextValue = DeploymentPipelineNode.CONTEXTS[0];
        }
        this.treeChanged(this);
    }

    private async updateWhenCompleted(deploymentId: string, compartmentId?: string) {
        const groupId = compartmentId ? await ociUtils.getDefaultLogGroup(this.oci.getProvider(), compartmentId) : undefined;
        const logId = groupId ? (await ociUtils.listLogs(this.oci.getProvider(), groupId))?.items.find(item => item.configuration?.source.resource === this.oci.getDevOpsProject())?.id : undefined;
        let lastResults: any[] = [];
        const update = async () => {
            if (this.lastDeployment?.ocid !== deploymentId) {
                return undefined;
            }
            let deployment: devops.models.Deployment;
            try {
                deployment = (await ociUtils.getDeployment(this.oci.getProvider(), deploymentId)).deployment;
            } catch (err) {
                return undefined;
            }
            const state = deployment.lifecycleState;
            if (this.lastDeployment?.ocid === deploymentId && deployment) {
                if (ociUtils.isSuccess(state)) {
                    this.updateLastDeployment(deploymentId, state, this.lastDeployment?.output, (await this.getResource()).freeformTags?.gcn_tooling_okeDeploymentName);
                }
                if (this.lastDeployment?.output && compartmentId && groupId && logId) {
                    const timeStart = deployment.deploymentExecutionProgress?.timeStarted;
                    const timeEnd = ociUtils.isRunning(deployment.lifecycleState) ? new Date() : deployment.deploymentExecutionProgress?.timeFinished;
                    if (timeStart && timeEnd) {
                        // While the build run is in progress, messages in the log cloud appear out of order.
                        const results = await ociUtils.searchLogs(this.oci.getProvider(), compartmentId, groupId, logId, 'deployment', deployment.id, timeStart, timeEnd);
                        if (this.lastDeployment?.output && this.lastDeployment?.ocid === deploymentId && results?.length && results.length > lastResults.length) {
                            if (lastResults.find((result: any, idx: number) => result.data.logContent.time !== results[idx].data.logContent.time || result.data.logContent.data.message !== results[idx].data.logContent.data.message)) {
                                this.lastDeployment.output.clear();
                                for (let result of results) {
                                    this.lastDeployment.output.appendLine(`${result.data.logContent.time}  ${result.data.logContent.data.message}`);
                                }
                            } else {
                                for (let result of results.slice(lastResults.length)) {
                                    this.lastDeployment.output.appendLine(`${result.data.logContent.time}  ${result.data.logContent.data.message}`);
                                }
                            }
                            lastResults = results;
                        }
                    }
                }
            }
            return state;
        };
        const state = await ociUtils.completion(5000, update);
        if (this.lastDeployment?.ocid === deploymentId) {
            this.updateLastDeployment(deploymentId, state, this.lastDeployment?.output, this.lastDeployment?.deploymentName);
            // Some messages can appear in the log minutes after the deployment finished.
            // Wating for 10 minutes periodiccaly polling for them.
            for (let i = 0; i < 60; i++) {
                if (this.lastDeployment?.ocid !== deploymentId) {
                    return;
                }
                await ociUtils.delay(10000);
                await update();
            }
        }
    }

    private random(low: number, high: number): number {
        return Math.floor(Math.random() * (high - low) + low);
    }
}
