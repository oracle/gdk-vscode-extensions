/*
 * Copyright (c) 2022, 2024, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as devops from 'oci-devops';
import * as nodes from '../nodes';
import { isRunBuildPipelineCustomShapeConfirmedPermanently, confirmRunBuildPipelineCustomShape } from '../dialogs';
import * as dialogs from '../../../common/lib/dialogs';
import * as gitUtils from '../gitUtils';
import * as graalvmUtils from '../graalvmUtils';
import * as projectUtils from '../projectUtils';
import * as servicesView from '../servicesView';
import * as logUtils from '../../../common/lib/logUtils';
import * as ociUtils from './ociUtils';
import * as ociContext from './ociContext';
import * as ociDialogs from './ociDialogs';
import * as ociService from './ociService';
import * as ociServices  from './ociServices';
import * as dataSupport from './dataSupport';
import * as ociNodes from './ociNodes';
import * as artifactServices from './artifactServices';
import * as containerInstanceServices from './containerInstanceServices';
import * as ociFeatures from './ociFeatures';


export const DATA_NAME = 'buildPipelines';

const ICON = 'play-circle';
const ICON_IN_PROGRESS = 'gear~spin';

type BuildPipeline = {
    ocid: string;
    displayName: string;
    lastBuildRun?: string;
};

export function initialize(context: vscode.ExtensionContext) {
    nodes.registerRenameableNode(BuildPipelineNode.CONTEXTS);
    nodes.registerRemovableNode(BuildPipelineNode.CONTEXTS);
    nodes.registerViewBuildLogNode([BuildPipelineNode.CONTEXTS[1], BuildPipelineNode.CONTEXTS[2]]);
    ociNodes.registerOpenInConsoleNode(BuildPipelineNode.CONTEXTS);

    context.subscriptions.push(vscode.commands.registerCommand('oci.devops.runBuildPipeline', (node: BuildPipelineNode) => {
		node.runPipeline();
	}));
    context.subscriptions.push(vscode.commands.registerCommand('oci.devops.runBuildPipelineWithParameters', (node: BuildPipelineNode) => {
		node.runPipelineWithParameters();
	}));
    context.subscriptions.push(vscode.commands.registerCommand('oci.devops.stopBuildPipeline', (node: BuildPipelineNode) => {
		node.cancelPipeline();
	}));
    context.subscriptions.push(vscode.commands.registerCommand('oci.devops.getBuildArtifact', (node: BuildPipelineNode) => {
		node.getArtifacts();
	}));
    context.subscriptions.push(vscode.commands.registerCommand('oci.devops.downloadSingleBuildArtifact', (node: BuildPipelineNode) => {
		node.downloadSingleArtifact();
	}));
    context.subscriptions.push(vscode.commands.registerCommand('oci.devops.pullSingleBuildArtifact', (node: BuildPipelineNode) => {
		node.pullSingleArtifact();
	}));
    context.subscriptions.push(vscode.commands.registerCommand('oci.devops.runSingleBuildArtifact', (node: BuildPipelineNode) => {
		node.runSingleArtifact();
	}));
    context.subscriptions.push(vscode.commands.registerCommand('oci.devops.viewBuildLog', (node: BuildPipelineNode) => {
		node.viewLog();
	}));
}

export async function importServices(oci: ociContext.Context, _projectResources: any | undefined, codeRepositoryResources: any | undefined): Promise<dataSupport.DataProducer | undefined> {
    // TODO: Might return populated instance of Service which internally called importServices()
    if (codeRepositoryResources?.buildPipelines) {
        logUtils.logInfo('[import] Importing build pipelines from list of generated resources');
        const items: BuildPipeline[] = [];
        let idx = 0;
        for (const buildPipeline of codeRepositoryResources.buildPipelines) {
            if (buildPipeline.autoImport) {
                try {
                    const pipeline = await ociUtils.getBuildPipeline(oci.getProvider(), buildPipeline.ocid);
                    let pipelineDisplayName = pipeline.displayName;
                    if (pipelineDisplayName) {
                        const codeRepoPrefix = pipeline.freeformTags?.devops_tooling_codeRepoPrefix;
                        if (codeRepoPrefix && pipelineDisplayName.startsWith(codeRepoPrefix)) {
                            pipelineDisplayName = pipelineDisplayName.substring(codeRepoPrefix.length);
                        }
                    }
                    const displayName = pipelineDisplayName ? pipelineDisplayName : `Build Pipeline ${idx++}`;
                    logUtils.logInfo(`[import] Importing build pipeline '${displayName}': ${pipeline.id}`);
                    items.push({
                        'ocid': pipeline.id,
                        'displayName': displayName
                    });
                } catch (err) {
                    logUtils.logError(dialogs.getErrorMessage(`[import] Failed to import build pipeline ${buildPipeline.ocid}`));
                }
            }
        }
        const result: dataSupport.DataProducer = {
            getDataName: () => DATA_NAME,
            getData: () => {
                return {
                    items: items
                };
            }
        };
        if (!items.length) {
            logUtils.logInfo('[import] No build pipelines found');
        }
        return result;
    } else {
        logUtils.logInfo('[import] Importing build pipelines - no list of generated resources');
        const provider = oci.getProvider();
        const project = oci.getDevOpsProject();
        const repository = oci.getCodeRepository();
        const pipelines = await ociUtils.listBuildPipelinesByCodeRepository(provider, project, repository);
        if (pipelines.length > 0) {
            const items: BuildPipeline[] = [];
            let idx = 0;
            for (const pipeline of pipelines) {
                let pipelineDisplayName = pipeline.displayName;
                if (pipelineDisplayName) {
                    const codeRepoPrefix = pipeline.freeformTags?.devops_tooling_codeRepoPrefix;
                    if (codeRepoPrefix && pipelineDisplayName.startsWith(codeRepoPrefix)) {
                        pipelineDisplayName = pipelineDisplayName.substring(codeRepoPrefix.length);
                    }
                }
                const displayName = pipelineDisplayName ? pipelineDisplayName : `Build Pipeline ${idx++}`;
                logUtils.logInfo(`[import] Importing build pipeline '${displayName}': ${pipeline.id}`);
                items.push({
                    'ocid': pipeline.id,
                    'displayName': displayName
                });
            }
            const result: dataSupport.DataProducer = {
                getDataName: () => DATA_NAME,
                getData: () => {
                    return {
                        items: items
                    };
                }
            };
            return result;
        } else {
            logUtils.logInfo('[import] No build pipelines found');
        }
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

async function selectBuildPipelines(oci: ociContext.Context, ignore: BuildPipeline[]): Promise<BuildPipeline[] | undefined> {
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
    async function listBuildPipelines(oci: ociContext.Context): Promise<devops.models.BuildPipelineSummary[] | undefined> {
        // TODO: display the progress in QuickPick
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
                    dialogs.showErrorMessageWithReportIssueCommand('Failed to read build pipelines', 'oci.devops.openIssueReporter', err);
                    return;
                }
            });
        });
    }
    const pipelines: BuildPipeline[] = [];
    const descriptions: string[] = [];
    const existing = await listBuildPipelines(oci);
    if (existing) {
        let idx = 1;
        for (const item of existing) {
            if (!shouldIgnore(item.id, item.displayName)) {
                let itemDisplayName = item.displayName;
                if (itemDisplayName) {
                    const codeRepoPrefix = item.freeformTags?.devops_tooling_codeRepoPrefix;
                    if (codeRepoPrefix && itemDisplayName.startsWith(codeRepoPrefix)) {
                        itemDisplayName = itemDisplayName.substring(codeRepoPrefix.length);
                    }
                }
                const displayName = itemDisplayName ? itemDisplayName : `Build Pipeline ${idx++}`;
                const description = item.description ? item.description : 'Build pipeline';
                pipelines.push({
                    ocid: item.id,
                    displayName: displayName
                });
                descriptions.push(description);
            }
        }
    }
    const existingContentChoices: dialogs.QuickPickObject[] = [];
    for (let i = 0; i < pipelines.length; i++) {
        existingContentChoices.push(new dialogs.QuickPickObject(`$(${ICON}) ${pipelines[i].displayName}`, undefined, descriptions[i], pipelines[i]));
    }
    dialogs.sortQuickPickObjectsByName(existingContentChoices);
    let existingContentMultiSelect;
    if (existingContentChoices.length > 1) {
        const multiSelectExisting = async (): Promise<BuildPipeline[] | undefined> => {
            const selection = await vscode.window.showQuickPick(existingContentChoices, {
                title: `${ociServices.ADD_ACTION_NAME}: Select Build Pipelines`,
                placeHolder: 'Select existing build pipelines to add',
                canPickMany: true
            });
            if (selection?.length) {
                const selected: BuildPipeline[] = [];
                for (const sel of selection) {
                    selected.push(sel.object as BuildPipeline);
                }
                return selected;
            } else {
                return undefined;
            }
        };
        existingContentMultiSelect = new dialogs.QuickPickObject('$(arrow-small-right) Add multiple existing pipelines...', undefined, undefined, multiSelectExisting);
    }
    // TODO: provide a possibility to create a new pipeline
    // TODO: display pipelines for the repository and for the project
    // TODO: provide a possibility to select pipelines from different projects / compartments
    const choices: dialogs.QuickPickObject[] = [];
    if (existingContentChoices.length) {
        choices.push(...existingContentChoices);
        if (existingContentMultiSelect) {
            choices.push(existingContentMultiSelect);
        }
    }
    if (choices.length === 0) {
        vscode.window.showWarningMessage('All build pipelines already added or no build pipelines available.');
    } else {
        const selection = await vscode.window.showQuickPick(choices, {
            title: `${ociServices.ADD_ACTION_NAME}: Select Build Pipeline`,
            placeHolder: 'Select existing build pipeline to add'
        });
        if (selection) {
            if (typeof selection.object === 'function') {
                return await selection.object();
            } else {
                return [ selection.object ];
            }
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
            const displayed = this.itemsData ? this.itemsData as BuildPipeline[] : [];
            const selected = await selectBuildPipelines(this.oci, displayed);
            if (selected) {
                const added: nodes.BaseNode[] = [];
                for (const pipeline of selected) {
                    added.push(new BuildPipelineNode(pipeline, this.oci, this.treeChanged));
                }
                this.addServiceNodes(added);
            }
        }
    }

    getAddContentChoices(): dialogs.QuickPickObject[] | undefined {
        return [
            new dialogs.QuickPickObject(`$(${ICON}) Add Build Pipeline`, undefined, 'Add an existing build pipeline', () => this.addContent())
        ];
    }

    protected buildNodesImpl(oci: ociContext.Context, itemsData: any[], treeChanged: nodes.TreeChanged): nodes.BaseNode[] {
        const nodes: nodes.BaseNode[] = [];
        for (const itemData of itemsData) {
            const ocid = itemData.ocid;
            const displayName = itemData.displayName;
            const lastBuildRun = itemData.lastBuildRun;
            if (ocid && displayName) {
                const object: BuildPipeline = {
                    ocid: ocid,
                    displayName: displayName,
                    lastBuildRun: lastBuildRun
                };
                nodes.push(new BuildPipelineNode(object, oci, treeChanged));
            }
        }
        return nodes;
    }

}

export class BuildPipelineNode extends nodes.ChangeableNode implements nodes.RemovableNode, nodes.RenameableNode, nodes.ViewBuildLogNode, ociNodes.CloudConsoleItem, ociNodes.OciResource, dataSupport.DataProducer {

    static readonly DATA_NAME = 'buildPipelineNode';
    static readonly CONTEXTS = [
        `oci.devops.${BuildPipelineNode.DATA_NAME}`, // default
        `oci.devops.${BuildPipelineNode.DATA_NAME}-has-lastrun`, // handle to the previous run available
        `oci.devops.${BuildPipelineNode.DATA_NAME}-in-progress`, // in progress
        `oci.devops.${BuildPipelineNode.DATA_NAME}-artifacts-available`, // artifacts available
        `oci.devops.${BuildPipelineNode.DATA_NAME}-single-download-available`, // single generic artifact available
        `oci.devops.${BuildPipelineNode.DATA_NAME}-single-image-available` // single docker image available
    ];

    private object: BuildPipeline;
    private oci: ociContext.Context;
    private lastRun?: { ocid: string; state?: string; output?: vscode.OutputChannel; deliveredArtifacts?: { id: string; type: string }[] };
    private showSucceededFlag: boolean = false;

    constructor(object: BuildPipeline, oci: ociContext.Context, treeChanged: nodes.TreeChanged) {
        super(object.displayName, undefined, BuildPipelineNode.CONTEXTS[0], undefined, undefined, treeChanged);
        this.object = object;
        this.oci = oci;
        this.iconPath = new vscode.ThemeIcon(ICON);
        this.updateAppearance();
        if (this.object.lastBuildRun) {
            try {
                ociUtils.getBuildRun(this.oci.getProvider(), this.object.lastBuildRun).then(buildRun => {
                    const output = buildRun.displayName ? vscode.window.createOutputChannel(buildRun.displayName) : undefined;
                    output?.hide();
                    this.updateLastRun(buildRun.id, buildRun.lifecycleState, output);
                    this.updateWhenCompleted(buildRun.id, buildRun.compartmentId);
                });
            } catch (err) {
                // TODO: handle?
            }
        }
    }

    getId() {
        return this.object.ocid;
    }

    async getResource(): Promise<devops.models.BuildPipeline> {
        return ociUtils.getBuildPipeline(this.oci.getProvider(), this.object.ocid);
    }

    rename() {
        const service = findByNode(this);
        service?.renameServiceNode(this, 'Rename Build Pipeline', name => this.object.displayName = name);
    }

    remove() {
        const service = findByNode(this);
        service?.removeServiceNodes(this);
    }

    getDataName() {
        return BuildPipelineNode.DATA_NAME;
    }

    getData(): any {
        return this.object;
    }

    async getAddress(): Promise<string> {
        const pipeline = await this.getResource();
        return `https://cloud.oracle.com/devops-build/projects/${pipeline.projectId}/build-pipelines/${pipeline.id}`;
    }

    private lastProvidedParameters: string | undefined;

    runPipeline(tests: boolean = false) {
        return this.runPipelineCommon(tests, undefined);
    }
    
    runPipelineWithParameters(tests: boolean = false) {
        return this.runPipelineCommon(tests, ociDialogs.customizeParameters);
    }
    
    async runPipelineCommon(tests: boolean, customizeParameters: ((lastProvidedParameters: string | undefined, predefinedParameters: { name: string; value: string }[], requiredParameters: { name: string; value: string }[]) => Promise<{ name: string; value: string }[] | undefined>) | undefined) {
        const currentState = this.lastRun?.state;
        if (currentState === devops.models.BuildRun.LifecycleState.Canceling || !ociUtils.isRunning(currentState)) {
            const folder = servicesView.findWorkspaceFolderByNode(this);
            const folderUri = folder?.uri;
            if (folderUri) {
                if (gitUtils.locallyModified(folderUri)) {
                    const cancelOption = 'Cancel Build And Show Source Control View';
                    const runBuildOption = 'Build Anyway';
                    const selOption = await vscode.window.showWarningMessage('Local souces differ from the repository content in cloud.', cancelOption, runBuildOption);
                    if (runBuildOption !== selOption) {
                        if (cancelOption === selOption) {
                            vscode.commands.executeCommand('workbench.view.scm');
                        }
                        return;
                    }
                }
                const head = gitUtils.getHEAD(folderUri);
                if (head?.name && !head.upstream) {
                    const cancelOption = 'Cancel Build';
                    const pushOption = 'Publish Branch And Continue';
                    if (pushOption !== await vscode.window.showWarningMessage(`Local branch "${head.name}" has not been published yet.`, cancelOption, pushOption)) {
                        return;
                    } else {
                        await gitUtils.pushLocalBranch(folderUri);
                    }
                }
                const buildName = `${this.label}-${ociUtils.getTimestamp()} (from VS Code)`;
                const params: { name: string; value: string }[] = [];
                const requiredJavaVersion = await vscode.window.withProgress({
                        location: { viewId: 'oci-devops' }
                    }, (_progress, _token) => {
                        return projectUtils.getProjectRequiredJavaVersion(folder);
                    }
                );
                const targetGvmVersion = graalvmUtils.getBuildRunGVMVersion(requiredJavaVersion ? [requiredJavaVersion, ''] : undefined);
                const gvmParams = graalvmUtils.getGVMBuildRunParameters(targetGvmVersion);
                if (customizeParameters) {
                    const customParams = await customizeParameters(this.lastProvidedParameters, gvmParams || [], requiredJavaVersion ? [{ name: 'JAVA_VERSION', value: requiredJavaVersion}] : []);
                    if (customParams) {
                        this.lastProvidedParameters = ociDialogs.parametersToString(customParams);
                        params.length = 0;
                        params.push(...customParams);
                    } else {
                        return;
                    }
                } else {
                    if (gvmParams) {
                        params.push(...gvmParams);
                    }
                }
                const msg = `Starting build "${buildName}"`;
                logUtils.logInfo(`[build] ${msg}`);
                vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: `${msg}...`,
                    cancellable: false
                }, (_progress, _token) => {
                    return new Promise(async resolve => {
                        try {
                            if (!tests && (!isRunBuildPipelineCustomShapeConfirmedPermanently() && await this.usesCustomRunnerShape())) {
                                const confirm = await confirmRunBuildPipelineCustomShape();
                                if (!confirm) {
                                    resolve(false);
                                    return;
                                }
                            }
                            const repository = await ociUtils.getCodeRepository(this.oci.getProvider(), this.oci.getCodeRepository());
                            let commitInfo;
                            if (head?.name && head.commit) {
                                if (repository && repository.httpUrl && `refs/heads/${head.name}` !== repository.defaultBranch) {
                                    commitInfo = { repositoryUrl: repository.httpUrl, repositoryBranch: head.name, commitHash: head.commit };
                                }
                            }
                            const buildRunName = repository.name ? `${repository.name}: ${buildName}` : buildName;
                            const buildRun = await ociUtils.createBuildRun(this.oci.getProvider(), this.object.ocid, buildRunName, params, commitInfo);
                            logUtils.logInfo(`[build] Build '${buildName}' started`);
                            resolve(true);
                            if (buildRun) {
                                this.object.lastBuildRun = buildRun.id;
                                const service = findByNode(this);
                                service?.serviceNodesChanged(this);
                                this.showSucceededFlag = true;
                                this.updateLastRun(buildRun.id, buildRun.lifecycleState, buildRun.displayName ? vscode.window.createOutputChannel(buildRun.displayName) : undefined);
                                this.viewLog();
                                this.updateWhenCompleted(buildRun.id, buildRun.compartmentId, buildName);
                            }
                        } catch (err) {
                            dialogs.showErrorMessageWithReportIssueCommand(`Failed to start build pipeline '${this.object.displayName}'`, 'oci.devops.openIssueReporter', err);
                            resolve(false);
                        }
                    });
                });
            }
        }
    }

    cancelPipeline() {
        const lastRun = this.lastRun;
        if (lastRun && lastRun.state !== devops.models.BuildRun.LifecycleState.Canceling) {
            if (lastRun.state === devops.models.BuildRun.LifecycleState.Accepted) {
                vscode.window.showWarningMessage('Pipeline cannot be stopped while starting, try again later.');
            } else {
                const stopOption = 'Stop Current Build';
                const continueOption = 'Continue Build';
                vscode.window.showWarningMessage(`Stop build pipeline '${this.object.displayName}'?`, stopOption, continueOption).then(sel => {
                    if (sel === stopOption) {
                        try {
                            ociUtils.cancelBuildRun(this.oci.getProvider(), lastRun.ocid);
                            this.updateLastRun(lastRun.ocid, devops.models.BuildRun.LifecycleState.Canceling, lastRun.output, undefined);
                        } catch (err) {
                            dialogs.showErrorMessageWithReportIssueCommand(`Failed to stop build pipeline '${this.object.displayName}'`, 'oci.devops.openIssueReporter', err);
                        }
                    }
                });
            }
        }
    }

    async getArtifacts() {
        const choices: { label: string; type: string; id: string; path?: string; size?: number  }[] = await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Reading available artifacts...',
            cancellable: false
        }, (_progress, _token) => {
            return new Promise(async resolve => {
                const choices: { label: string; type: string; id: string; path?: string; size?: number }[] = [];
                if (this.lastRun?.deliveredArtifacts) {
                    for (const artifact of this.lastRun.deliveredArtifacts) {
                        switch (artifact.type) {
                            case 'GENERIC_ARTIFACT':
                                try {
                                    const genericArtifact = await ociUtils.getGenericArtifact(this.oci.getProvider(), artifact.id);
                                    if (genericArtifact.displayName && genericArtifact.artifactPath) {
                                        choices.push({ label: genericArtifact.displayName, type: artifact.type, id: genericArtifact.id, path: genericArtifact.artifactPath /* TODO: may contain slashes! */, size: genericArtifact.sizeInBytes });
                                    }
                                } catch (err) {
                                    logUtils.logError(`[build] ${dialogs.getErrorMessage('Failed to resolve generic artifact', err)}`);
                                }
                                break;
                            case 'OCIR':
                                choices.push({ label: artifact.id, type: artifact.type, id: artifact.id });
                                break;
                        }
                    }
                }
                resolve(choices);
            });
        });
        if (choices.length > 0) {
            const choice = choices.length === 1 ? choices[0] : (await vscode.window.showQuickPick(choices, {
                title: 'Get Build Artifact: Select Artifact',
                placeHolder: 'Select artifact to download'
            }));
            switch (choice?.type) {
                case 'GENERIC_ARTIFACT':
                    if (choice.path) { // should always be true for generic artifact
                        artifactServices.downloadGenericArtifactContent(this.oci, choice.id, choice.label, choice.path, choice.size);
                    }
                    break;
                case 'OCIR':
                    ociDialogs.pullImage(this.oci.getProvider(), choice.id, 'Get Build Artifact');
                    break;
            }
        } else {
            vscode.window.showErrorMessage('No artifact to download.');
        }
    }

    async downloadSingleArtifact() {
        const artifact: { label: string; type: string; id: string; path?: string; size?: number } | undefined = await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Reading artifact...',
            cancellable: false
        }, (_progress, _token) => {
            return new Promise(async resolve => {
                let artifact: { label: string; type: string; id: string; path?: string; size?: number } | undefined;
                if (this.lastRun?.deliveredArtifacts?.length === 1) {
                    const deliveredArtifact = this.lastRun.deliveredArtifacts[0];
                    if (deliveredArtifact.type === 'GENERIC_ARTIFACT') {
                        try {
                            const genericArtifact = await ociUtils.getGenericArtifact(this.oci.getProvider(), deliveredArtifact.id);
                            if (genericArtifact.displayName && genericArtifact.artifactPath) {
                                artifact = { label: genericArtifact.displayName, type: deliveredArtifact.type, id: genericArtifact.id, path: genericArtifact.artifactPath /* TODO: may contain slashes! */, size: genericArtifact.sizeInBytes };
                            }
                        } catch (err) {
                            logUtils.logError(`[build] ${dialogs.getErrorMessage('Failed to resolve generic artifact', err)}`);
                        }
                    }
                }
                resolve(artifact);
            });
        });
        if (artifact?.path) {
            artifactServices.downloadGenericArtifactContent(this.oci, artifact.id, artifact.label, artifact.path, artifact.size);
        } else {
            vscode.window.showErrorMessage('No artifact to download.');
        }
    }

    async pullSingleArtifact() {
        if (this.lastRun?.deliveredArtifacts?.length === 1) {
            const deliveredArtifact = this.lastRun.deliveredArtifacts[0];
            if (deliveredArtifact.type === 'OCIR' && deliveredArtifact.id) {
                await ociDialogs.pullImage(this.oci.getProvider(), deliveredArtifact.id, 'Pull Container Image');
                return;
            }
        }
        vscode.window.showErrorMessage('No image to pull.');
    }

    async runSingleArtifact() {
        if (this.lastRun?.deliveredArtifacts?.length === 1) {
            const deliveredArtifact = this.lastRun.deliveredArtifacts[0];
            if (deliveredArtifact.type === 'OCIR' && deliveredArtifact.id) {
                const cis = containerInstanceServices.findByNode(this);
                if (cis) {
                    cis.runAndOpenContainerInstance(deliveredArtifact.id);
                    return;
                }
            }
        }
        vscode.window.showErrorMessage('No image to run.');
    }

    viewLog() {
        this.lastRun?.output?.show();
    }

    private updateLastRun(ocid: string, state?: string, output?: vscode.OutputChannel, deliveredArtifacts?: { id: string; type: string }[] ) {
        if (this.lastRun?.output !== output) {
            this.lastRun?.output?.hide();
            this.lastRun?.output?.dispose();
        }
        this.lastRun = { ocid, state, output, deliveredArtifacts };
        switch (state) {
            case devops.models.BuildRun.LifecycleState.Accepted:
            case devops.models.BuildRun.LifecycleState.InProgress:
                this.iconPath = new vscode.ThemeIcon(ICON_IN_PROGRESS, new vscode.ThemeColor('charts.yellow'));
                this.contextValue = BuildPipelineNode.CONTEXTS[2];
                break;
            case devops.models.BuildRun.LifecycleState.Succeeded:
                this.iconPath = new vscode.ThemeIcon(ICON, new vscode.ThemeColor('charts.green'));
                if (deliveredArtifacts?.length) {
                    if (deliveredArtifacts.length === 1) {
                        switch (deliveredArtifacts[0].type) {
                            case 'GENERIC_ARTIFACT':
                                this.contextValue = BuildPipelineNode.CONTEXTS[4];
                                break;
                            case 'OCIR':
                                this.contextValue = BuildPipelineNode.CONTEXTS[5];
                                break;
                            default:
                                this.contextValue = BuildPipelineNode.CONTEXTS[3];
                        }
                    } else {
                        this.contextValue = BuildPipelineNode.CONTEXTS[3];
                    }
                } else {
                    this.contextValue = BuildPipelineNode.CONTEXTS[1];
                }
                break;
            case devops.models.BuildRun.LifecycleState.Failed:
                this.iconPath = new vscode.ThemeIcon(ICON, new vscode.ThemeColor('charts.red'));
                this.contextValue = BuildPipelineNode.CONTEXTS[1];
                break;
            case devops.models.BuildRun.LifecycleState.Canceling:
            case devops.models.BuildRun.LifecycleState.Canceled:
                this.iconPath = new vscode.ThemeIcon(ICON, new vscode.ThemeColor('charts.yellow'));
                this.contextValue = BuildPipelineNode.CONTEXTS[1];
                break;
            default:
                this.iconPath = new vscode.ThemeIcon(ICON);
                this.contextValue = BuildPipelineNode.CONTEXTS[1];
        }
        this.updateStateLabel(state);
        this.treeChanged(this);
    }

    private updateStateLabel(state?: string) {
        switch (state) {
            case devops.models.BuildRun.LifecycleState.Accepted:
                this.description = 'starting...';
                break;
            case devops.models.BuildRun.LifecycleState.InProgress:
                this.description = 'in progress...';
                break;
            case devops.models.BuildRun.LifecycleState.Canceling:
                this.description = 'canceling...';
                break;
            case devops.models.BuildRun.LifecycleState.Canceled:
                this.description = 'canceled';
                break;
            case devops.models.BuildRun.LifecycleState.Succeeded:
                this.description = this.showSucceededFlag ? 'completed' : undefined; // do not display 'completed' for runs completed in previous VS Code session
                break;
            case devops.models.BuildRun.LifecycleState.Failed:
                this.description = 'failed';
                break;
            default:
                this.description = undefined;
        }
        this.updateAppearance();
    }

    private async updateWhenCompleted(buildRunId: string, compartmentId?: string, buildName?: string) {
        const groupId = compartmentId ? (await ociUtils.getDefaultLogGroup(this.oci.getProvider(), compartmentId))?.logGroup.id : undefined;
        const logId = groupId ? (await ociUtils.listLogs(this.oci.getProvider(), groupId)).find(item => item.configuration?.source.resource === this.oci.getDevOpsProject())?.id : undefined;
        let deliveredArtifacts: { id: string; type: string }[] | undefined;
        let lastResults: any[] = [];
        const update = async () => {
            if (this.lastRun?.ocid !== buildRunId) {
                return undefined;
            }
            let buildRun: devops.models.BuildRun;
            try {
                buildRun = await ociUtils.getBuildRun(this.oci.getProvider(), buildRunId);
            } catch (err) {
                return undefined;
            }
            const state = buildRun.lifecycleState;
            if (this.lastRun?.ocid === buildRunId && buildRun) {
                if (ociUtils.isSuccess(state)) {
                    if (buildName) {
                        logUtils.logInfo(`[build] Build '${buildName}' finished: ${state}`);
                        buildName = undefined; // report the success just once
                    }
                    const artifactId = buildRun.buildOutputs?.exportedVariables?.items.find(variable => variable.name === 'ARTIFACT_ID')?.value;
                    if (artifactId && artifactId.startsWith('"') && artifactId.endsWith('"')) {
                        deliveredArtifacts = [ { id: artifactId.slice(1, artifactId.length - 1), type: 'GENERIC_ARTIFACT' } ];
                    } else {
                        deliveredArtifacts = buildRun.buildOutputs?.deliveredArtifacts?.items.map((artifact: any) => {
                            switch (artifact.artifactType) {
                                case 'GENERIC_ARTIFACT':
                                    return { id: artifact.deliveredArtifactId, type: artifact.artifactType };
                                case 'OCIR':
                                    return { id: artifact.imageUri, type: artifact.artifactType };
                                default:
                                    return { id: undefined, type: undefined};
                            }
                        }).filter(value => value.type);
                    }
                } else {
                    this.showSucceededFlag = true;
                }
                this.updateLastRun(buildRunId, state, this.lastRun?.output, deliveredArtifacts);
                if (this.lastRun?.output && compartmentId && groupId && logId) {
                    const timeStart = buildRun.buildRunProgress?.timeStarted;
                    const timeEnd = ociUtils.isRunning(buildRun.lifecycleState) ? new Date() : buildRun.buildRunProgress?.timeFinished;
                    if (timeStart && timeEnd) {
                        // While the build run is in progress, messages in the log cloud appear out of order.
                        try {
                            const results = await ociUtils.searchLogs(this.oci.getProvider(), compartmentId, groupId, logId, 'buildRun', buildRun.id, timeStart, timeEnd);
                            if (this.lastRun?.output && this.lastRun?.ocid === buildRunId && results?.length && results.length > lastResults.length) {
                                if (lastResults.find((result: any, idx: number) => result.data.logContent.time !== results[idx].data.logContent.time || result.data.logContent.data.message !== results[idx].data.logContent.data.message)) {
                                    this.lastRun.output.clear();
                                    for (let result of results) {
                                        this.lastRun.output.appendLine(`${result.data.logContent.time}  ${result.data.logContent.data.message}`);
                                    }
                                } else {
                                    for (let result of results.slice(lastResults.length)) {
                                        this.lastRun.output.appendLine(`${result.data.logContent.time}  ${result.data.logContent.data.message}`);
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
            if (this.lastRun?.ocid === buildRunId) {
                this.updateLastRun(buildRunId, state, this.lastRun?.output, deliveredArtifacts);
                // Some messages can appear in the log minutes after the build run finished.
                // Wating for 10 minutes periodiccaly polling for them.
                for (let i = 0; i < 60; i++) {
                    if (this.lastRun?.ocid !== buildRunId) {
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

    private async usesCustomRunnerShape(): Promise<boolean> {
        const stages = await ociUtils.listBuildPipelineStages(this.oci.getProvider(), this.object.ocid);
        for (const stage of stages) {
            if (stage.buildPipelineStageType === devops.models.BuildStage.buildPipelineStageType) {
                if ((stage as any).buildRunnerShapeConfig?.buildRunnerType === 'CUSTOM') {
                    return true;
                }
            }
        }
        return false;
    }

}
