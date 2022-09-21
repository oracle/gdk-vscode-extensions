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
import * as ociDialogs from './ociDialogs';
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

async function createOkeDeploymentPipelines(oci: ociContext.Context): Promise<DeploymentPipeline[] | undefined> {
    const okeCluster = await ociDialogs.selectOkeCluster(oci.getProvider(), oci.getCompartment(), oci.getProvider().getRegion().regionId, false);
    if (!okeCluster) {
        return undefined;
    }
    async function getProjectAndRepositoryName(oci: ociContext.Context): Promise<string[] | undefined> {
        return await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Reading project and repository...',
            cancellable: false
        }, (_progress, _token) => {
            return new Promise(async (resolve) => {
                try {
                    const project = await ociUtils.getDevopsProject(oci.getProvider(), oci.getDevOpsProject());
                    const repositoryName = (await ociUtils.getCodeRepository(oci.getProvider(), oci.getCodeRepository())).name || project.name;
                    resolve([ project.name, repositoryName ]);
                    return;
                } catch (err) {
                    resolve(undefined);
                    dialogs.showErrorMessage('Failed to read project and repository', err);
                    return;
                }
            });
        })
    }
    const info = await getProjectAndRepositoryName(oci);
    if (info?.length !== 2) {
        return undefined;
    }
    const projectName = info[0];
    const repositoryName = info[1];

    async function listDeployArtifacts(oci: ociContext.Context): Promise<devops.models.DeployArtifactSummary[] | undefined> {
        return await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Reading project deploy artifacts...',
            cancellable: false
        }, (_progress, _token) => {
            return new Promise(async (resolve) => {
                try {
                    const items = await ociUtils.listDeployArtifacts(oci.getProvider(), oci.getDevOpsProject());
                    resolve(items);
                    return;
                } catch (err) {
                    resolve(undefined);
                    dialogs.showErrorMessage('Failed to read deploy artifacts', err);
                    return;
                }
            });
        })
    }
    const deployConfigArtifact = (await listDeployArtifacts(oci))?.find(env => {
        return env.deployArtifactType === devops.models.DeployArtifact.DeployArtifactType.KubernetesManifest && `${repositoryName}_oke_deploy_configuration` === env.displayName;
    });
    if (!deployConfigArtifact) {
        vscode.window.showErrorMessage('No OKE deployment configuration artifact found in project.')
        return undefined;
    }

    async function listDeployEnvironments(oci: ociContext.Context): Promise<devops.models.DeployEnvironmentSummary[] | undefined> {
        return await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Reading project deploy environments...',
            cancellable: false
        }, (_progress, _token) => {
            return new Promise(async (resolve) => {
                try {
                    const items = await ociUtils.listDeployEnvironments(oci.getProvider(), oci.getDevOpsProject());
                    resolve(items);
                    return;
                } catch (err) {
                    resolve(undefined);
                    dialogs.showErrorMessage('Failed to read deploy environments', err);
                    return;
                }
            });
        })
    }
    const existingDeployEnvironments = (await listDeployEnvironments(oci))?.filter(env => {
        if (env.deployEnvironmentType === devops.models.OkeClusterDeployEnvironmentSummary.deployEnvironmentType) {
            return (env as devops.models.OkeClusterDeployEnvironmentSummary).clusterId === okeCluster;
        }
        return false;
    });

    async function createDeployEnvironment(oci: ociContext.Context, projectName: string, okeCluster: string): Promise<devops.models.DeployEnvironment | undefined> {
        return await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Creating OKE cluster deploy environment...',
            cancellable: false
        }, (_progress, _token) => {
            return new Promise(async (resolve) => {
                try {
                    const deployEnv = await ociUtils.createOkeDeployEnvironment(oci.getProvider(), oci.getDevOpsProject(), projectName, okeCluster);
                    resolve(deployEnv);
                    return;
                } catch (err) {
                    resolve(undefined);
                    dialogs.showErrorMessage('Failed to create OKE cluster deploy environment', err);
                    return;
                }
            });
        })
    }
    const okeClusterEnvironment = existingDeployEnvironments?.length ? existingDeployEnvironments[0] : await createDeployEnvironment(oci, projectName, okeCluster);
    if (!okeClusterEnvironment) {
        return undefined;
    }

    let buildPipeline = undefined;
    async function listBuildPipelines(oci: ociContext.Context): Promise<devops.models.DeployPipelineSummary[] | undefined> {
        return await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Reading project build pipelines...',
            cancellable: false
        }, (_progress, _token) => {
            return new Promise(async (resolve) => {
                try {
                    const items = await ociUtils.listBuildPipelines(oci.getProvider(), oci.getDevOpsProject());
                    resolve(items);
                    return;
                } catch (err) {
                    resolve(undefined);
                    dialogs.showErrorMessage('Failed to read build pipelines', err);
                    return;
                }
            });
        })
    }
    const existingBuildPipelines = (await listBuildPipelines(oci))?.filter(item => 'oci' === item.freeformTags?.gcn_tooling_docker_image);
    const choices: dialogs.QuickPickObject[] = [];
    if (existingBuildPipelines) {
        for (const pipeline of existingBuildPipelines) {
            choices.push(new dialogs.QuickPickObject(`$(${ICON}) ${pipeline.displayName}`, undefined, pipeline.description, pipeline.id));
        }
    }
    if (choices.length === 0) {
        vscode.window.showWarningMessage('No available build pipelines to bind.')
    } else {
        buildPipeline = choices.length === 1 ? choices[0].object : (await vscode.window.showQuickPick(choices, {
            placeHolder: 'Select Build Pipeline to Bind to'
        }))?.object;
    }

    async function createDeployPipeline(oci: ociContext.Context, projectName: string, repositoryName: string, okeClusterEnvironment: string, deployConfigArtifact: string, buildPipeline?: string): Promise<devops.models.DeployPipeline | undefined> {
        return await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Creating deployment to OKE pipeline for oci docker native executable...`,
            cancellable: false
        }, (_progress, _token) => {
            return new Promise(async (resolve) => {
                let oke_deployPipeline;
                try {
                    const oke_deployPipelineName = 'Deploy OCI Docker Native Image to OKE';
                    const oke_deployPipelineDescription = `Deployment pipeline to deploy docker native executable for OCI & devops project ${projectName} & repository ${repositoryName} to OKE`;
                    const tags: { [key:string]: string } = {
                        'gcn_tooling_okeDeploymentName': repositoryName.toLowerCase()
                    };
                    if (buildPipeline) {
                        tags.gcn_tooling_buildPipelineOCID = buildPipeline;
                    }
                    oke_deployPipeline = (await ociUtils.createDeployPipeline(oci.getProvider(), oci.getDevOpsProject(), oke_deployPipelineName, oke_deployPipelineDescription, [{
                        name: 'DOCKER_TAG',
                        defaultValue: 'latest'
                    }], tags));
                } catch (err) {
                    resolve(undefined);
                    dialogs.showErrorMessage('Failed to create deployment to OKE pipeline for oci docker native executable', err);
                    return;
                }
                try {
                    await ociUtils.createDeployToOkeStage(oci.getProvider(), oke_deployPipeline.id, okeClusterEnvironment, deployConfigArtifact);
                } catch (err) {
                    resolve(undefined);
                    dialogs.showErrorMessage('Failed to create deployment to OKE stage for oci docker native executable', err);
                    return;
                }
                resolve(oke_deployPipeline);
            });
        })
    }
    const deployPipeline = await createDeployPipeline(oci, projectName, repositoryName, okeClusterEnvironment.id, deployConfigArtifact.id, buildPipeline);
    if (deployPipeline) {
        return [ { ocid: deployPipeline.id, displayName: deployPipeline.displayName || 'Deployment pipeline' } ];
    }
    return undefined;
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
            title: 'Reading project deployment pipelines...',
            cancellable: false
        }, (_progress, _token) => {
            return new Promise(async (resolve) => {
                try {
                    const items = await ociUtils.listDeployPipelines(oci.getProvider(), oci.getDevOpsProject());
                    resolve(items);
                    return;
                } catch (err) {
                    resolve(undefined);
                    dialogs.showErrorMessage('Failed to read deployment pipelines', err);
                    return;
                }
            });
        })
    }
    const pipelines: DeploymentPipeline[] = [];
    const descriptions: string[] = [];
    const existing = await listDeploymentPipelines(oci);
    if (existing) {
        let idx = 1;
        for (const item of existing) {
            if (!shouldIgnore(item.id)) {
                const displayName = item.displayName ? item.displayName : `Deployment Pipeline ${idx++}`;
                const description = item.description ? item.description : 'Deployment pipeline';
                pipelines.push({
                    ocid: item.id,
                    displayName: displayName
                });
                descriptions.push(description);
            }
        }
    }
    // TODO: display pipelines for the repository and for the project
    // TODO: provide a possibility to select pipelines from different projects / compartments
    const existingContentChoices: dialogs.QuickPickObject[] = [];
    for (let i = 0; i < pipelines.length; i++) {
        existingContentChoices.push(new dialogs.QuickPickObject(`$(${ICON}) ${pipelines[i].displayName}`, undefined, descriptions[i], pipelines[i]));
    }
    dialogs.sortQuickPickObjectsByName(existingContentChoices);
    let existingContentMultiSelect;
    if (existingContentChoices.length > 1) {
        const multiSelectExisting = async (): Promise<DeploymentPipeline[] | undefined> => {
            const selection = await vscode.window.showQuickPick(existingContentChoices, {
                placeHolder: 'Select Existing Deployment Pipeline(s) to Add',
                canPickMany: true
            });
            if (selection?.length) {
                const selected: DeploymentPipeline[] = [];
                for (const sel of selection) {
                    selected.push(sel.object as DeploymentPipeline);
                }
                return selected;
            } else {
                return undefined;
            }
        };
        existingContentMultiSelect = new dialogs.QuickPickObject('Add multiple existing pipelines at once...', undefined, undefined, multiSelectExisting);
    }
    // TODO: don't offer to create the pipeline if already created
    // NOTE: pipelines may be created for various OKE clusters from various compartments, which makes it more complicated
    const newContentChoices: dialogs.QuickPickObject[] = [];
    const newDeployment = async (): Promise<DeploymentPipeline[] | undefined> => {
        return createOkeDeploymentPipelines(oci);
    };
    newContentChoices.push(new dialogs.QuickPickObject(`$(add) New Deployment to OKE`, undefined, 'Create and setup new pipeline to deploy built native executable containers to the OKE', newDeployment));
    const choices: dialogs.QuickPickObject[] = [];
    if (newContentChoices.length) {
        if (existingContentChoices.length) {
            choices.push(dialogs.QuickPickObject.separator('Create New'));
        }
        choices.push(...newContentChoices);
    }
    if (existingContentChoices.length) {
        if (newContentChoices.length) {
            choices.push(dialogs.QuickPickObject.separator('Add Existing'));
        }
        choices.push(...existingContentChoices);
        if (existingContentMultiSelect) {
            choices.push(existingContentMultiSelect);
        }
    }
    if (choices.length === 0) {
        vscode.window.showWarningMessage('All deployment pipelines already added or no deployment pipelines available.')
        return undefined;
    }
    const selection = await vscode.window.showQuickPick(choices, {
        placeHolder: 'Select Deployment Pipeline to Add'
    });
    if (selection) {
        if (typeof selection.object === 'function') {
            return await selection.object();
        } else {
            return [ selection.object ];
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
            new dialogs.QuickPickObject(`$(${ICON}) Add Deployment Pipeline`, undefined, 'Add existing deployment pipeline or create a new one', () => this.addContent())
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
                ociUtils.getDeployment(this.oci.getProvider(), this.object.lastDeployment).then(deployment => {
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
        return ociUtils.getDeployPipeline(this.oci.getProvider(), this.object.ocid);
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
                        const dockerTagVarName = 'DOCKER_TAG';
                        let artifactsCount: number | undefined;
                        let dockerTag: string | undefined;
                        const buildPipelineID = (await this.getResource()).freeformTags?.gcn_tooling_buildPipelineOCID;
                        if (buildPipelineID) {
                            const lastBuilds = await ociUtils.listBuildRuns(this.oci.getProvider(), buildPipelineID);
                            const buildRunId = lastBuilds?.find(build => ociUtils.isSuccess(build.lifecycleState))?.id;
                            if (buildRunId) {
                                try {
                                    const buildOutputs = (await ociUtils.getBuildRun(this.oci.getProvider(), buildRunId)).buildOutputs;
                                    artifactsCount = buildOutputs?.deliveredArtifacts?.items.length;
                                    dockerTag = buildOutputs?.exportedVariables?.items.find(v => v.name === dockerTagVarName)?.value;
                                } catch (err) {
                                    // TODO: handle?
                                }
                            }
                        }
                        if (!artifactsCount) {
                            vscode.window.showErrorMessage('No build artifact to deploy. Make sure you run the appropriate build pipeline first.');
                            resolve(false);
                            return;
                        }
                        const deployment = await ociUtils.createDeployment(this.oci.getProvider(), this.object.ocid, deploymentName, dockerTag ? [{ name: dockerTagVarName, value: dockerTag }] : undefined);
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
                        dialogs.showErrorMessage('Failed to start deployment pipeline', err);
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
                    const deployment = this.lastDeployment ? await ociUtils.getDeployment(this.oci.getProvider(), this.lastDeployment?.ocid) : undefined;
                    const deploymentName = this.lastDeployment?.deploymentName;
                    if (!deployment || !deploymentName) {
                        resolve(false);
                        vscode.window.showErrorMessage('Cannot resolve the latest deployment.');
                        return;
                    }
                    const deployEnvId = deployment.deployPipelineEnvironments?.items.find(env => env.deployEnvironmentId)?.deployEnvironmentId;
                    const deployEnvironment = deployEnvId ? await ociUtils.getDeployEnvironment(this.oci.getProvider(), deployEnvId) : undefined;
                    const okeDeployEnvironment = ociUtils.asOkeDeployEnvironemnt(deployEnvironment);
                    if (!okeDeployEnvironment?.clusterId) {
                        resolve(false);
                        vscode.window.showErrorMessage('Cannot resolve destination OKE cluster.');
                        return;
                    }
                    if (!await kubernetesUtils.isCurrentCluster(okeDeployEnvironment.clusterId)) {
                        resolve(false);
                        const setup = 'Setup local access to destination OKE cluster';
                        if (setup === await vscode.window.showErrorMessage('Kuberners extension not configured to access the destination OKE cluster.', setup)) {
                            ociNodes.openInConsole({ getAddress: () => `https://cloud.oracle.com/containers/clusters/${okeDeployEnvironment.clusterId}?region=${this.oci.getProvider().getRegion().regionId}` });
                        }
                        return;
                    }
                    if (!await kubernetesUtils.getDeployment(deploymentName)) {
                        resolve(false);
                        vscode.window.showErrorMessage(`Cannot find deployment ${deploymentName} in the destination OKE cluster.`);
                        return;
                    }
                    // TODO: get remote port number from deployment ?
                    const remotePort = 8080;
                    const localPort = this.random(3000, 50000);
                    const result = await kubectl.portForward(`deployments/${deploymentName}`, undefined, localPort, remotePort, { showInUI: { location: 'status-bar' } }); 
                    if (!result) {
                        resolve(false);
                        vscode.window.showErrorMessage(`Cannot forward port for the ${deploymentName} deployment.`);
                        return;
                    }
                    vscode.env.openExternal(vscode.Uri.parse(`http://localhost:${localPort}`));
                    resolve(true);
                } catch (err) {
                    dialogs.showErrorMessage('Failed to open deployment in browser', err);
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
        const logId = groupId ? (await ociUtils.listLogs(this.oci.getProvider(), groupId)).find(item => item.configuration?.source.resource === this.oci.getDevOpsProject())?.id : undefined;
        let lastResults: any[] = [];
        const update = async () => {
            if (this.lastDeployment?.ocid !== deploymentId) {
                return undefined;
            }
            let deployment: devops.models.Deployment;
            try {
                deployment = await ociUtils.getDeployment(this.oci.getProvider(), deploymentId);
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
                        try {
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
                        } catch (err) {
                            // TODO: handle
                        }
                    }
                }
            }
            return state;
        };
        try {
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
        } catch (err) {
            // TODO: handle
        }
    }

    private random(low: number, high: number): number {
        return Math.floor(Math.random() * (high - low) + low);
    }
}
