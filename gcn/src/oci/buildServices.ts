/*
 * Copyright (c) 2022, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as devops from 'oci-devops';
import * as nodes from '../nodes';
import * as dialogs from '../dialogs';
import * as gitUtils from '../gitUtils';
import * as dockerUtils from '../dockerUtils';
import * as graalvmUtils from '../graalvmUtils';
import * as servicesView from '../servicesView';
import * as ociUtils from './ociUtils';
import * as ociContext from './ociContext';
import * as ociService from './ociService';
import * as ociServices  from './ociServices';
import * as dataSupport from './dataSupport';
import * as ociNodes from './ociNodes';


export const DATA_NAME = 'buildPipelines';

const ICON = 'play-circle';

type BuildPipeline = {
    ocid: string,
    displayName: string,
    lastBuildRun?: string
}

export function initialize(context: vscode.ExtensionContext) {
    nodes.registerRenameableNode(BuildPipelineNode.CONTEXTS);
    nodes.registerRemovableNode(BuildPipelineNode.CONTEXTS);
    ociNodes.registerOpenInConsoleNode(BuildPipelineNode.CONTEXTS);

    context.subscriptions.push(vscode.commands.registerCommand('gcn.oci.runBuildPipeline', (node: BuildPipelineNode) => {
		node.runPipeline();
	}));
    context.subscriptions.push(vscode.commands.registerCommand('gcn.oci.getBuildArtifact', (node: BuildPipelineNode) => {
		node.downloadArtifact();
	}));
    context.subscriptions.push(vscode.commands.registerCommand('gcn.oci.showBuildOutput', (node: BuildPipelineNode) => {
		node.showBuildOutput();
	}));
}

export async function importServices(oci: ociContext.Context): Promise<dataSupport.DataProducer | undefined> {
    // TODO: Might return populated instance of Service which internally called importServices()
    const provider = oci.getProvider();
    const project = oci.getDevOpsProject();
    const repository = oci.getCodeRepository();
    const pipelines = await ociUtils.listBuildPipelinesByCodeRepository(provider, project, repository);
    if (pipelines.length > 0) {
        const items: BuildPipeline[] = [];
        let idx = 0;
        for (const pipeline of pipelines) {
            const displayName = pipeline.displayName ? pipeline.displayName : `Build Pipeline ${idx++}`;
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
                }
            }
        };
        return result;
    } else {
        return undefined;
    }
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
    function shouldIgnore(ocid: string) {
        for (const item of ignore) {
            if (item.ocid === ocid) {
                return true;
            }
        }
        return false;
    }
    async function listBuildPipelines(oci: ociContext.Context): Promise<devops.models.BuildPipelineSummary[] | undefined> {
        // TODO: display the progress in QuickPick
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
    const pipelines: BuildPipeline[] = [];
    const descriptions: string[] = [];
    const existing = await listBuildPipelines(oci);
    if (existing) {
        let idx = 1;
        for (const item of existing) {
            if (!shouldIgnore(item.id)) {
                const displayName = item.displayName ? item.displayName : `Build Pipeline ${idx++}`;
                const description = item.description ? item.description : 'Build pipeline';
                pipelines.push({
                    ocid: item.id,
                    displayName: displayName
                });
                descriptions.push(description);
            }
        }
    }
    const choices: dialogs.QuickPickObject[] = [];
    for (let i = 0; i < pipelines.length; i++) {
        choices.push(new dialogs.QuickPickObject(`$(${ICON}) ${pipelines[i].displayName}`, undefined, descriptions[i], pipelines[i]));
    }
    // TODO: display pipelines for the repository and for the project
    // TODO: provide a possibility to create a new pipeline
    // TODO: provide a possibility to select pipelines from different projects / compartments
    if (choices.length === 0) {
        vscode.window.showWarningMessage('All build pipelines already added or no build pipelines available.')
    } else {
        const selection = await vscode.window.showQuickPick(choices, {
            placeHolder: 'Select Build Pipeline(s) to Add',
            canPickMany: true
        })
        if (selection && selection.length > 0) {
            const selected: BuildPipeline[] = [];
            for (const sel of selection) {
                selected.push(sel.object as BuildPipeline);
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
            new dialogs.QuickPickObject(`$(${ICON}) Add Build Pipeline`, undefined, 'Add existing build pipeline', () => this.addContent())
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
                }
                nodes.push(new BuildPipelineNode(object, oci, treeChanged));
            }
        }
        return nodes;
    }

}

class BuildPipelineNode extends nodes.ChangeableNode implements nodes.RemovableNode, nodes.RenameableNode, ociNodes.CloudConsoleItem, ociNodes.OciResource, dataSupport.DataProducer {

    static readonly DATA_NAME = 'buildPipelineNode';
    static readonly CONTEXTS = [
        `gcn.oci.${BuildPipelineNode.DATA_NAME}`, // default
        `gcn.oci.${BuildPipelineNode.DATA_NAME}-in-progress`, // in progress
        `gcn.oci.${BuildPipelineNode.DATA_NAME}-artifacts-available` // artifacts available
    ];

    private object: BuildPipeline;
    private oci: ociContext.Context;
    private lastRun?: { ocid: string, state?: string, output?: vscode.OutputChannel, deliveredArtifacts?: { id: string, type: string }[] };

    constructor(object: BuildPipeline, oci: ociContext.Context, treeChanged: nodes.TreeChanged) {
        super(object.displayName, undefined, BuildPipelineNode.CONTEXTS[0], undefined, undefined, treeChanged);
        this.object = object;
        this.oci = oci;
        this.iconPath = new vscode.ThemeIcon(ICON);
        this.command = { command: 'gcn.oci.showBuildOutput', title: 'Show Build Output', arguments: [this] };
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

    runPipeline() {
        if (!ociUtils.isRunning(this.lastRun?.state)) {
            const folder = servicesView.findWorkspaceFolderByNode(this)?.uri;
            if (folder) {
                graalvmUtils.getActiveGVMVersion().then(async version => {
                    if (version) {
                        if (gitUtils.locallyModified(folder)) {
                            const cancelOption = 'Cancel Build';
                            const runBuildOption = 'Build Anyway';
                            if (runBuildOption !== await vscode.window.showWarningMessage('Local souces differ from the repository content in cloud.', cancelOption, runBuildOption)) {
                                return;
                            }
                        }
                        const head = gitUtils.getHEAD(folder);
                        if (head?.name && !head.upstream) {
                            const cancelOption = 'Cancel Build';
                            const pushOption = 'Publish Branch And Continue';
                            if (pushOption !== await vscode.window.showWarningMessage(`Local branch "${head.name}" has not been published yet.`, cancelOption, pushOption)) {
                                return;
                            } else {
                                await gitUtils.pushLocalBranch(folder);
                            }
                        }
                        const params = graalvmUtils.getGVMBuildRunParameters(version);
                        const buildName = `${this.label}-${ociUtils.getTimestamp()} (from VS Code)`;
                        vscode.window.withProgress({
                            location: vscode.ProgressLocation.Notification,
                            title: `Starting build "${buildName}" using GraalVM ${version[1]}, Java ${version[0]}...`,
                            cancellable: false
                        }, (_progress, _token) => {
                            return new Promise(async resolve => {
                                try {
                                    let commitInfo;
                                    if (head?.name && head.commit) {
                                        const repository = await ociUtils.getCodeRepository(this.oci.getProvider(), this.oci.getCodeRepository());
                                        if (repository && repository.httpUrl && `refs/heads/${head.name}` !== repository.defaultBranch) {
                                            commitInfo = { repositoryUrl: repository.httpUrl, repositoryBranch: head.name, commitHash: head.commit };
                                        }
                                    }
                                    const buildRun = await ociUtils.createBuildRun(this.oci.getProvider(), this.object.ocid, buildName, params, commitInfo);
                                    resolve(true);
                                    if (buildRun) {
                                        this.object.lastBuildRun = buildRun.id;
                                        const service = findByNode(this);
                                        service?.serviceNodesChanged(this);
                                        this.updateLastRun(buildRun.id, buildRun.lifecycleState, buildRun.displayName ? vscode.window.createOutputChannel(buildRun.displayName) : undefined);
                                        this.showBuildOutput();
                                        this.updateWhenCompleted(buildRun.id, buildRun.compartmentId);
                                    }
                                } catch (err) {
                                    dialogs.showErrorMessage('Failed to start build pipeline', err);
                                    resolve(false);
                                }
                            });
                        })
                    } else {
                        dialogs.showErrorMessage('Failed to start build pipeline: No local active GraalVM installation detected.');
                    }
                });
            }
        }
    }

    async downloadArtifact() {
        const choices: { label: string, type: string, id: string, path?: string }[] = await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Reading available artifacts...',
            cancellable: false
        }, (_progress, _token) => {
            return new Promise(async resolve => {
                const choices: { label: string, type: string, id: string, path?: string }[] = [];
                if (this.lastRun?.deliveredArtifacts) {
                    for (const artifact of this.lastRun.deliveredArtifacts) {
                        switch (artifact.type) {
                            case 'GENERIC_ARTIFACT':
                                try {
                                    const genericArtifact = await ociUtils.getGenericArtifact(this.oci.getProvider(), artifact.id);
                                    if (genericArtifact.displayName && genericArtifact.artifactPath) {
                                        choices.push({ label: genericArtifact.displayName, type: artifact.type, id: genericArtifact.id, path: genericArtifact.artifactPath });
                                    }
                                } catch (err) {
                                    // TODO: handle
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
                placeHolder: 'Select Artifact to Download'
            }));
            switch (choice?.type) {
                case 'GENERIC_ARTIFACT':
                    try {
                        ociUtils.getGenericArtifactContent(this.oci.getProvider(), choice.id).then(content => {
                            vscode.window.showSaveDialog({
                                defaultUri: vscode.Uri.file(choice.path || ''),
                                title: 'Save Artifact As'
                            }).then(fileUri => {
                                if (fileUri) {
                                    vscode.window.withProgress({
                                        location: vscode.ProgressLocation.Notification,
                                        title: `Downloading artifact ${choice.path}...`,
                                        cancellable: false
                                    }, (_progress, _token) => {
                                        return new Promise(async (resolve) => {
                                            const data = content;
                                            const file = fs.createWriteStream(fileUri.fsPath);
                                            data.pipe(file);
                                            data.on('error', (err: Error) => {
                                                dialogs.showErrorMessage('Failed to download artifact', err);
                                                file.destroy();
                                                resolve(false);
                                            });
                                            data.on('end', () => {
                                                const open = 'Open File Location';
                                                vscode.window.showInformationMessage(`Artifact ${choice.path} downloaded.`, open).then(choice => {
                                                    if (choice === open) {
                                                        vscode.commands.executeCommand('revealFileInOS', fileUri);
                                                    }
                                                });
                                                resolve(true);
                                            });
                                        });
                                    })
                                }
                            });
                        });
                    } catch (err) {
                        dialogs.showErrorMessage('Failed to download artifact', err);
                    }
                    break;
                case 'OCIR':
                    dockerUtils.pullImage(choice.id);
                    break;
            }
        } else {
            vscode.window.showErrorMessage('No artifact to download.');
        }
    }

    showBuildOutput() {
        this.lastRun?.output?.show();
    }

    private updateLastRun(ocid: string, state?: string, output?: vscode.OutputChannel, deliveredArtifacts?: { id: string, type: string }[] ) {
        if (this.lastRun?.output !== output) {
            this.lastRun?.output?.hide();
            this.lastRun?.output?.dispose();
        }
        this.lastRun = { ocid, state, output, deliveredArtifacts };
        switch (state) {
            case 'ACCEPTED':
            case 'IN_PROGRESS':
            case 'CANCELING':
                this.iconPath = new vscode.ThemeIcon(ICON, new vscode.ThemeColor('charts.yellow'));
                this.contextValue = BuildPipelineNode.CONTEXTS[1];
                break;
            case 'SUCCEEDED':
                this.iconPath = new vscode.ThemeIcon(ICON, new vscode.ThemeColor('charts.green'));
                this.contextValue = deliveredArtifacts?.length ? BuildPipelineNode.CONTEXTS[2] : BuildPipelineNode.CONTEXTS[0];
                break;
            case 'FAILED':
                this.iconPath = new vscode.ThemeIcon(ICON, new vscode.ThemeColor('charts.red'));
                this.contextValue = BuildPipelineNode.CONTEXTS[0];
                break;
            default:
                this.iconPath = new vscode.ThemeIcon(ICON);
                this.contextValue = BuildPipelineNode.CONTEXTS[0];
        }
        this.treeChanged(this);
    }

    private async updateWhenCompleted(buildRunId: string, compartmentId?: string) {
        const groupId = compartmentId ? await ociUtils.getDefaultLogGroup(this.oci.getProvider(), compartmentId) : undefined;
        const logId = groupId ? (await ociUtils.listLogs(this.oci.getProvider(), groupId)).find(item => item.configuration?.source.resource === this.oci.getDevOpsProject())?.id : undefined;
        let deliveredArtifacts: { id: string, type: string }[] | undefined;
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
                    deliveredArtifacts = buildRun?.buildOutputs?.deliveredArtifacts?.items.map((artifact: any) => {
                        switch (artifact.artifactType) {
                            case 'GENERIC_ARTIFACT':
                                return { id: artifact.deliveredArtifactId, type: artifact.artifactType };
                            case 'OCIR':
                                return { id: artifact.imageUri, type: artifact.artifactType };
                            default:
                                return { id: undefined, type: undefined};
                        }
                    }).filter(value => value.type);
                    this.updateLastRun(buildRunId, state, this.lastRun?.output, deliveredArtifacts);
                }
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
}
