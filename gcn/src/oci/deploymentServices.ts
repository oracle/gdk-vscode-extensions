/*
 * Copyright (c) 2022, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as devops from 'oci-devops';
import * as nodes from '../nodes';
import * as dialogs from '../dialogs';
import * as kubernetesUtils from "../kubernetesUtils";
import * as projectUtils from '../projectUtils';
import * as logUtils from '../logUtils';
import * as ociUtils from './ociUtils';
import * as ociContext from './ociContext';
import * as ociDialogs from './ociDialogs';
import * as ociService from './ociService';
import * as ociServices  from './ociServices';
import * as dataSupport from './dataSupport';
import * as ociNodes from './ociNodes';
import * as deployUtils from './deployUtils';
import * as okeUtils from './okeUtils';
import * as ociFeatures from './ociFeatures';


export const DATA_NAME = 'deploymentPipelines';

const ICON = 'rocket';
const ICON_IN_PROGRESS = 'gear~spin';

type DeploymentPipeline = {
    ocid: string,
    displayName: string,
    lastDeployment?: string
}

let RESOURCES_FOLDER: string;

export function initialize(context: vscode.ExtensionContext) {
    RESOURCES_FOLDER = path.join(context.extensionPath, 'resources', 'oci');
    nodes.registerRenameableNode(DeploymentPipelineNode.CONTEXTS);
    nodes.registerRemovableNode(DeploymentPipelineNode.CONTEXTS);
    nodes.registerViewDeploymentLogNode([DeploymentPipelineNode.CONTEXTS[1], DeploymentPipelineNode.CONTEXTS[2]]);
    ociNodes.registerOpenInConsoleNode(DeploymentPipelineNode.CONTEXTS);

    context.subscriptions.push(vscode.commands.registerCommand('gcn.oci.runDeployPipeline', (node: DeploymentPipelineNode) => {
		node.runPipeline();
	}));
    context.subscriptions.push(vscode.commands.registerCommand('gcn.oci.stopDeployPipeline', (node: DeploymentPipelineNode) => {
		node.cancelPipeline();
	}));
    context.subscriptions.push(vscode.commands.registerCommand('gcn.oci.openInBrowser', (node: DeploymentPipelineNode) => {
		node.openDeploymentInBrowser();
	}));
    context.subscriptions.push(vscode.commands.registerCommand('gcn.viewDeploymentLog', (node: DeploymentPipelineNode) => {
		node.viewLog();
	}));
}

export async function importServices(oci: ociContext.Context, _projectResources: any | undefined, codeRepositoryResources: any | undefined): Promise<dataSupport.DataProducer | undefined> {
    // TODO: Might return populated instance of Service which internally called importServices()
    if (codeRepositoryResources?.deploymentPipelines) {
        logUtils.logInfo('[import] Importing deployment pipelines from list of generated resources');
        const items: DeploymentPipeline[] = [];
        let idx = 0;
        for (const deploymentPipeline of codeRepositoryResources.deploymentPipelines) {
            if (deploymentPipeline.autoImport) {
                try {
                    const pipeline = await ociUtils.getDeployPipeline(oci.getProvider(), deploymentPipeline.ocid);
                    let pipelineDisplayName = pipeline.displayName;
                    if (pipelineDisplayName) {
                        const codeRepoPrefix = pipeline.freeformTags?.gcn_tooling_codeRepoPrefix;
                        if (codeRepoPrefix && pipelineDisplayName.startsWith(codeRepoPrefix)) {
                            pipelineDisplayName = pipelineDisplayName.substring(codeRepoPrefix.length);
                        }
                    }
                    const displayName = pipelineDisplayName ? pipelineDisplayName : `Deployment Pipeline ${idx++}`;
                    logUtils.logInfo(`[import] Importing deployment pipeline '${displayName}': ${pipeline.id}`);
                    items.push({
                        'ocid': pipeline.id,
                        'displayName': displayName
                    });
                } catch (err) {
                    logUtils.logError(dialogs.getErrorMessage(`[import] Failed to import deployment pipeline ${deploymentPipeline.ocid}`));
                }
            }
        }
        const result: dataSupport.DataProducer = {
            getDataName: () => DATA_NAME,
            getData: () => {
                return {
                    items: items
                }
            }
        };
        if (!items.length) {
            logUtils.logInfo('[import] No deployment pipelines found');
        }
        return result;
    } else {
        logUtils.logInfo('[import] Not importing deployment pipelines - no list of generated resources');
    }
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

async function createOkeDeploymentPipelines(oci: ociContext.Context, folder: vscode.WorkspaceFolder): Promise<DeploymentPipeline[] | undefined> {
    const okeCluster = await okeUtils.selectOkeCluster(oci.getProvider(), oci.getCompartment(), oci.getProvider().getRegion().regionId);
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
                    const projectFolder = await projectUtils.getProjectFolder(folder);
                    resolve([ project.name, projectFolder.projectType, repositoryName ]);
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
    if (info?.length !== 3) {
        return undefined;
    }
    const projectName = info[0];
    const projectType = info[1];
    const repositoryName = info[2];

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

    async function listBuildPipelines(oci: ociContext.Context): Promise<devops.models.BuildPipelineSummary[] | undefined> {
        return await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Reading build pipelines...',
            cancellable: false
        }, (_progress, _token) => {
            return new Promise(async (resolve) => {
                try {
                    const items = await ociUtils.listBuildPipelinesByCodeRepository(oci.getProvider(), oci.getDevOpsProject(), oci.getCodeRepository());
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
    let buildPipelineId: string | undefined = undefined;
    if (choices.length === 0) {
        dialogs.showErrorMessage('No available build pipelines to bind.')
    } else {
        buildPipelineId = choices.length === 1 ? choices[0].object : (await vscode.window.showQuickPick(choices, {
            title: 'New Deployment to OKE: Select Build Pipeline',
            placeHolder: 'Select build pipeline to bind to'
        }))?.object;
    }
    const buildPipeline = existingBuildPipelines?.find(pipe => pipe.id === buildPipelineId);
    if (!buildPipeline) {
        return undefined;
    }

    async function getImage(oci: ociContext.Context, pipeId: string): Promise<string | undefined> {
        return await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Reading image uri...',
            cancellable: false
        }, (_progress, _token) => {
            return new Promise(async (resolve) => {
                try {
                    const items = await ociUtils.listBuildPipelineStages(oci.getProvider(), pipeId);
                    const item = items.find(item => item.buildPipelineStageType === devops.models.DeliverArtifactStageSummary.buildPipelineStageType) as devops.models.DeliverArtifactStageSummary;
                    if (item?.deliverArtifactCollection.items.length) {
                        const artifact = await ociUtils.getDeployArtifact(oci.getProvider(), item.deliverArtifactCollection.items[0].artifactId);
                        if (artifact.deployArtifactSource.deployArtifactSourceType === devops.models.OcirDeployArtifactSource.deployArtifactSourceType) {
                            resolve((artifact.deployArtifactSource as devops.models.OcirDeployArtifactSource).imageUri);
                            return;
                        }
                    }
                    resolve(undefined);
                    dialogs.showErrorMessage('Failed to read image uri');
                } catch (err) {
                    resolve(undefined);
                    dialogs.showErrorMessage('Failed to read image uri', err);
                }
            });
        })
    }

    const imageName = await getImage(oci, buildPipeline?.id);
    if (!imageName) {
        return undefined;
    }

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
                } catch (err) {
                    resolve(undefined);
                    dialogs.showErrorMessage('Failed to read deploy artifacts', err);
                }
            });
        })
    }

    async function createDeployArtifact(oci: ociContext.Context, repositoryName: string, imageName: string, okeCluster: string): Promise<string | null | undefined> {
        return await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Creating project deploy artifact...',
            cancellable: false
        }, (_progress, _token) => {
            return new Promise(async (resolve) => {
                try {
                    const namespace = await ociUtils.getObjectStorageNamespace(oci.getProvider());
                    if (!await kubernetesUtils.isCurrentCluster(okeCluster)) {
                        const setup = 'Setup local access to destination OKE cluster';
                        if (setup === await dialogs.showErrorMessage('Kuberners extension not configured to access the destination OKE cluster.', undefined, setup)) {
                            ociNodes.openInConsole({ getAddress: () => `https://cloud.oracle.com/containers/clusters/${okeCluster}/quick-start?region=${oci.getProvider().getRegion().regionId}` });
                        }
                        resolve(undefined);
                        return;
                    }
                    const secretName = await ociDialogs.getKubeSecret(oci.getProvider(), 'vscode-generated-ocirsecret', namespace, 'New Deployment to OKE');
                    if (!secretName) {
                        resolve(undefined);
                        return;
                    }
                    const inlineContent = deployUtils.expandTemplate(RESOURCES_FOLDER, 'oke_deploy_config.yaml', {
                        image_name: imageName,
                        app_name: repositoryName.toLowerCase().replace(/[^0-9a-z]+/g, '-'),
                        secret_name: secretName
                    });
                    if (!inlineContent) {
                        resolve(undefined);
                        dialogs.showErrorMessage(`Failed to create OKE deployment configuration spec`);
                        return;
                    }
                    const jvm = imageName.endsWith('-jvm:${DOCKER_TAG}');
                    const artifactName = `${repositoryName}_oke_deploy_${jvm ? 'jvm' : 'ni'}_configuration`;
                    const artifactDescription = `OKE ${jvm ? 'jvm' : 'native'} deployment configuration artifact for devops project ${projectName} & repository ${repositoryName}`;
                    const artifact = (await ociUtils.createOkeDeployConfigurationArtifact(oci.getProvider(), oci.getDevOpsProject(), inlineContent, artifactName, artifactDescription, {
                        'gcn_tooling_codeRepoID': oci.getCodeRepository(),
                        'gcn_tooling_image_name': imageName
                    })).id;
                    resolve(artifact);
                } catch (err) {
                    resolve(null);
                    dialogs.showErrorMessage('Failed to create deploy artifact', err);
                }
            });
        })
    }

    let deployConfigArtifact = (await listDeployArtifacts(oci))?.find(env => {
        return env.deployArtifactType === devops.models.DeployArtifact.DeployArtifactType.KubernetesManifest && env.freeformTags?.gcn_tooling_image_name === imageName;
    })?.id;
    if (!deployConfigArtifact) {
        const artifact = await createDeployArtifact(oci, repositoryName, imageName, okeCluster);
        if (!artifact) {
            return undefined;
        }
        deployConfigArtifact = artifact;
    }

    async function createDeployPipeline(oci: ociContext.Context, projectName: string, repositoryName: string, okeClusterEnvironment: string, deployConfigArtifact: string, buildPipeline: devops.models.BuildPipelineSummary): Promise<{ocid: string, displayName: string}[] | undefined> {
        return await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Creating deployment to OKE pipeline...`,
            cancellable: false
        }, (_progress, _token) => {
            return new Promise(async (resolve) => {
                const codeRepoPrefix = (buildPipeline.freeformTags?.gcn_tooling_codeRepoPrefix || '');
                const displayNamePrefix = codeRepoPrefix + 'Build ';
                const displayName = buildPipeline.displayName?.startsWith(displayNamePrefix) ? buildPipeline.displayName.slice(displayNamePrefix.length) : `${projectType === 'GCN' ? ' OCI ' : ' '}Docker Image`;
                const deployPipelineName = `Deploy ${displayName} to OKE`;
                const descriptionPrefix = 'Build pipeline to build ';
                const descriptionPart = buildPipeline.description?.startsWith(descriptionPrefix) ? buildPipeline.description.slice(descriptionPrefix.length) : `docker image for ${projectType === 'GCN' ? 'OCI & ' : ''}devops project ${projectName} & repository ${repositoryName}`;
                const deployPipelineDescription = `Deployment pipeline to deploy ${descriptionPart} to OKE`;
                const tags: { [key:string]: string } = {
                    'gcn_tooling_codeRepoID': oci.getCodeRepository(),
                    'gcn_tooling_buildPipelineOCID': buildPipeline.id,
                    'gcn_tooling_okeDeploymentName': repositoryName.toLowerCase().replace(/[^0-9a-z]+/g, '-')
                };
                if (codeRepoPrefix.length) {
                    tags.gcn_tooling_codeRepoPrefix = codeRepoPrefix;
                }
                let deployPipeline;
                try {
                    deployPipeline = (await ociUtils.createDeployPipeline(oci.getProvider(), oci.getDevOpsProject(), `${codeRepoPrefix}${deployPipelineName}`, deployPipelineDescription, [{
                        name: 'DOCKER_TAG',
                        defaultValue: 'latest'
                    }], tags));
                } catch (err) {
                    resolve(undefined);
                    dialogs.showErrorMessage(`Failed to create deployment to OKE pipeline for ${repositoryName}`, err);
                    return;
                }
                try {
                    await ociUtils.createDeployToOkeStage(oci.getProvider(), deployPipeline.id, okeClusterEnvironment, deployConfigArtifact);
                } catch (err) {
                    resolve(undefined);
                    dialogs.showErrorMessage(`Failed to create deployment to OKE stage for ${repositoryName}`, err);
                    return;
                }
                resolve([{ ocid: deployPipeline.id, displayName: deployPipelineName }]);
            });
        })
    }
    return await createDeployPipeline(oci, projectName, repositoryName, okeClusterEnvironment.id, deployConfigArtifact, buildPipeline);
}

async function selectDeploymentPipelines(oci: ociContext.Context, folder: vscode.WorkspaceFolder, ignore: DeploymentPipeline[]): Promise<DeploymentPipeline[] | undefined> {
    function shouldIgnore(ocid: string, name?: string) {
        for (const item of ignore) {
            if (item.ocid === ocid) {
                return true;
            }
            if (!ociFeatures.NI_PIPELINES_ENABLED && name && name.includes('Native Executable')) {
                return true;
            }
        }
        return false;
    }
    async function listDeploymentPipelines(oci: ociContext.Context): Promise<devops.models.DeployPipelineSummary[] | undefined> {
        // TODO: display the progress in QuickPick
        return await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Reading deployment pipelines...',
            cancellable: false
        }, (_progress, _token) => {
            return new Promise(async (resolve) => {
                try {
                    const items = await ociUtils.listDeployPipelines(oci.getProvider(), oci.getDevOpsProject());
                    const codeRepoID = oci.getCodeRepository();
                    const projectItems: devops.models.DeployPipelineSummary[] = [];
                    for (const item of items) {
                        if (item.freeformTags?.gcn_tooling_codeRepoID === codeRepoID) {
                            projectItems.push(item);
                        }
                    }
                    resolve(projectItems.length ? projectItems : items);
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
            if (!shouldIgnore(item.id, item.displayName)) {
                let itemDisplayName = item.displayName;
                if (itemDisplayName) {
                    const codeRepoPrefix = item.freeformTags?.gcn_tooling_codeRepoPrefix;
                    if (codeRepoPrefix && itemDisplayName.startsWith(codeRepoPrefix)) {
                        itemDisplayName = itemDisplayName.substring(codeRepoPrefix.length);
                    }
                }
                const displayName = itemDisplayName ? itemDisplayName : `Deployment Pipeline ${idx++}`;
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
                title: `${ociServices.ADD_ACTION_NAME}: Select Deployment Pipelines`,
                placeHolder: 'Select existing deployment pipelines to add',
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
        existingContentMultiSelect = new dialogs.QuickPickObject('$(arrow-small-right) Add multiple existing pipelines...', undefined, undefined, multiSelectExisting);
    }
    // TODO: don't offer to create the pipeline if already created
    // NOTE: pipelines may be created for various OKE clusters from various compartments, which makes it more complicated
    const newContentChoices: dialogs.QuickPickObject[] = [];
    const newDeployment = async (): Promise<DeploymentPipeline[] | undefined> => {
        return createOkeDeploymentPipelines(oci, folder);
    };
    newContentChoices.push(new dialogs.QuickPickObject(`$(add) New Deployment to OKE`, undefined, 'Create and setup new pipeline to deploy built docker native executables to the OKE', newDeployment));
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
        title: `${ociServices.ADD_ACTION_NAME}: Select Deployment Pipeline`,
        placeHolder: 'Select deployment pipeline to add'
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
            const selected = await selectDeploymentPipelines(this.oci, this.folder, displayed);
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

class DeploymentPipelineNode extends nodes.ChangeableNode implements nodes.RemovableNode, nodes.RenameableNode, nodes.ViewDeploymentLogNode, ociNodes.CloudConsoleItem, ociNodes.OciResource, dataSupport.DataProducer {

    static readonly DATA_NAME = 'deploymentPipelineNode';
    static readonly CONTEXTS = [
        `gcn.oci.${DeploymentPipelineNode.DATA_NAME}`, // default
        `gcn.oci.${DeploymentPipelineNode.DATA_NAME}-has-lastdeployment`, // handle to the previous deployment available
        `gcn.oci.${DeploymentPipelineNode.DATA_NAME}-in-progress`, // in progress
        `gcn.oci.${DeploymentPipelineNode.DATA_NAME}-deployments-available` // artifacts available
    ];
    
    private object: DeploymentPipeline;
    private oci: ociContext.Context;
    private lastDeployment?: { ocid: string, state?: string, output?: vscode.OutputChannel, deploymentName?: string };
    private showSucceededFlag: boolean = false;

    constructor(object: DeploymentPipeline, oci: ociContext.Context, treeChanged: nodes.TreeChanged) {
        super(object.displayName, undefined, DeploymentPipelineNode.CONTEXTS[0], undefined, undefined, treeChanged);
        this.object = object;
        this.oci = oci;
        this.iconPath = new vscode.ThemeIcon(ICON);
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
        const currentState = this.lastDeployment?.state;
        if (currentState === devops.models.Deployment.LifecycleState.Canceling || !ociUtils.isRunning(currentState)) {
            const deploymentName = `${this.label}-${ociUtils.getTimestamp()} (from VS Code)`;
            logUtils.logInfo(`[deploy] Starting deployment '${deploymentName}'`);
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
                        const repository = await ociUtils.getCodeRepository(this.oci.getProvider(), this.oci.getCodeRepository());
                        const deploymentRunName = repository.name ? `${repository.name}: ${deploymentName}` : deploymentName;
                        const deployment = await ociUtils.createDeployment(this.oci.getProvider(), this.object.ocid, deploymentRunName, dockerTag ? [{ name: dockerTagVarName, value: dockerTag }] : undefined);
                        logUtils.logInfo(`[deploy] Deployment '${deploymentName}' started`);
                        resolve(true);
                        if (deployment) {
                            this.object.lastDeployment = deployment.id;
                            const service = findByNode(this);
                            service?.serviceNodesChanged(this);
                            this.showSucceededFlag = true;
                            this.updateLastDeployment(deployment.id, deployment.lifecycleState, deployment.displayName ? vscode.window.createOutputChannel(deployment.displayName) : undefined);
                            this.viewLog();
                            this.updateWhenCompleted(deployment.id, deployment.compartmentId, deploymentName);
                        }
                    } catch (err) {
                        dialogs.showErrorMessage(`Failed to start deployment pipeline '${this.object.displayName}'`, err);
                        resolve(false)
                    }
                });
            });
        }
    }

    cancelPipeline() {
        const lastDeployment = this.lastDeployment;
        if (lastDeployment && lastDeployment.state !== devops.models.Deployment.LifecycleState.Canceling) {
            if (lastDeployment.state === devops.models.Deployment.LifecycleState.Accepted) {
                vscode.window.showWarningMessage('Pipeline cannot be stopped while starting, try again later.');
            } else {
                const stopOption = 'Stop Current Deployment';
                const continueOption = 'Continue Deployment';
                vscode.window.showWarningMessage(`Stop deployment pipeline '${this.object.displayName}'?`, stopOption, continueOption).then(sel => {
                    if (sel === stopOption) {
                        try {
                            ociUtils.cancelDeployment(this.oci.getProvider(), lastDeployment.ocid);
                            this.updateLastDeployment(lastDeployment.ocid, devops.models.Deployment.LifecycleState.Canceling, lastDeployment.output);
                        } catch (err) {
                            dialogs.showErrorMessage(`Failed to stop deployment pipeline '${this.object.displayName}'`, err);
                        }
                    }
                });
            }
        }
    }

    openDeploymentInBrowser() {
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Resolving deployment...',
            cancellable: false
        }, (_progress, _token) => {
            return new Promise(async resolve => {
                logUtils.logInfo(`[deploy] Open deployment '${this.lastDeployment?.deploymentName ? this.lastDeployment.deploymentName : '<unknown>'}' in browser`);
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
                        dialogs.showErrorMessage('Cannot resolve the latest deployment.');
                        return;
                    }
                    const deployEnvId = deployment.deployPipelineEnvironments?.items.find(env => env.deployEnvironmentId)?.deployEnvironmentId;
                    const deployEnvironment = deployEnvId ? await ociUtils.getDeployEnvironment(this.oci.getProvider(), deployEnvId) : undefined;
                    const okeDeployEnvironment = ociUtils.asOkeDeployEnvironemnt(deployEnvironment);
                    if (!okeDeployEnvironment?.clusterId) {
                        resolve(false);
                        dialogs.showErrorMessage('Cannot resolve destination OKE cluster.');
                        return;
                    }
                    if (!await kubernetesUtils.isCurrentCluster(okeDeployEnvironment.clusterId)) {
                        resolve(false);
                        const setup = 'Setup local access to destination OKE cluster';
                        if (setup === await dialogs.showErrorMessage('Kuberners extension not configured to access the destination OKE cluster.', undefined, setup)) {
                            ociNodes.openInConsole({ getAddress: () => `https://cloud.oracle.com/containers/clusters/${okeDeployEnvironment.clusterId}/quick-start?region=${this.oci.getProvider().getRegion().regionId}` });
                        }
                        return;
                    }
                    if (!await kubernetesUtils.getDeployment(deploymentName)) {
                        resolve(false);
                        dialogs.showErrorMessage(`Cannot find deployment '${deploymentName}' in the destination OKE cluster.`);
                        return;
                    }
                    // TODO: get remote port number from deployment ?
                    const remotePort = 8080;
                    const localPort = this.random(3000, 50000);
                    const result = await kubectl.portForward(`deployments/${deploymentName}`, undefined, localPort, remotePort, { showInUI: { location: 'status-bar' } }); 
                    if (!result) {
                        resolve(false);
                        dialogs.showErrorMessage(`Cannot forward port for the '${deploymentName}' deployment.`);
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

    viewLog() {
        this.lastDeployment?.output?.show();
    }

    private updateLastDeployment(ocid: string, state?: string, output?: vscode.OutputChannel, deploymentName?: string) {
        if (this.lastDeployment?.output !== output) {
            this.lastDeployment?.output?.hide();
            this.lastDeployment?.output?.dispose();
        }
        this.lastDeployment = { ocid, state, output, deploymentName };
        switch (state) {
            case devops.models.Deployment.LifecycleState.Accepted:
            case devops.models.Deployment.LifecycleState.InProgress:
                this.iconPath = new vscode.ThemeIcon(ICON_IN_PROGRESS, new vscode.ThemeColor('charts.yellow'));
                this.contextValue = DeploymentPipelineNode.CONTEXTS[2];
                break;
            case devops.models.Deployment.LifecycleState.Succeeded:
                this.iconPath = new vscode.ThemeIcon(ICON, new vscode.ThemeColor('charts.green'));
                this.contextValue = deploymentName ? DeploymentPipelineNode.CONTEXTS[3] : DeploymentPipelineNode.CONTEXTS[1];
                break;
            case devops.models.Deployment.LifecycleState.Failed:
                this.iconPath = new vscode.ThemeIcon(ICON, new vscode.ThemeColor('charts.red'));
                this.contextValue = DeploymentPipelineNode.CONTEXTS[1];
                break;
            case devops.models.Deployment.LifecycleState.Canceling:
            case devops.models.Deployment.LifecycleState.Canceled:
                this.iconPath = new vscode.ThemeIcon(ICON, new vscode.ThemeColor('charts.yellow'));
                this.contextValue = DeploymentPipelineNode.CONTEXTS[1];
                break;
            default:
                this.iconPath = new vscode.ThemeIcon(ICON);
                this.contextValue = DeploymentPipelineNode.CONTEXTS[1];
        }
        this.updateStateLabel(state);
        this.treeChanged(this);
    }

    private updateStateLabel(state?: string) {
        switch (state) {
            case devops.models.Deployment.LifecycleState.Accepted:
                this.description = 'starting...';
                break;
            case devops.models.Deployment.LifecycleState.InProgress:
                this.description = 'in progress...';
                break;
            case devops.models.Deployment.LifecycleState.Canceling:
                this.description = 'canceling...';
                break;
            case devops.models.Deployment.LifecycleState.Canceled:
                this.description = 'canceled';
                break;
            case devops.models.Deployment.LifecycleState.Succeeded:
                this.description = this.showSucceededFlag ? 'completed' : undefined; // do not display 'completed' for runs completed in previous VS Code session
                break;
            case devops.models.Deployment.LifecycleState.Failed:
                this.description = 'failed';
                break;
            default:
                this.description = undefined;
        }
        this.updateAppearance();
    }

    private async updateWhenCompleted(deploymentId: string, compartmentId?: string, deploymentName?: string) {
        const groupId = compartmentId ? (await ociUtils.getDefaultLogGroup(this.oci.getProvider(), compartmentId))?.logGroup.id : undefined;
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
                    if (deploymentName) {
                        logUtils.logInfo(`[deploy] Deployment '${deploymentName}' finished: ${state}`);
                        deploymentName = undefined; // report the success just once
                    }
                    this.updateLastDeployment(deploymentId, state, this.lastDeployment?.output, (await this.getResource()).freeformTags?.gcn_tooling_okeDeploymentName);
                } else {
                    this.showSucceededFlag = true;
                    this.updateLastDeployment(deploymentId, state, this.lastDeployment?.output);
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
