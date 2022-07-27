/*
 * Copyright (c) 2022, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as nodes from '../nodes';
import * as graalvmUtils from '../graalvmUtils';
import * as ociUtils from './ociUtils';
import * as ociContext from './ociContext';
import * as ociServices from './ociServices';

export function createFeaturePlugins(context: vscode.ExtensionContext): ociServices.ServicePlugin[] {
    context.subscriptions.push(vscode.commands.registerCommand('extension.gcn.runBuildPipeline', (node: BuildPipelineNode) => {
		node.runPipeline();
	}));
    context.subscriptions.push(vscode.commands.registerCommand('extension.gcn.showBuildOutput', (node: BuildPipelineNode) => {
		node.showBuildOutput();
	}));
    return [ new Plugin() ];
}

class Plugin extends ociServices.ServicePlugin {

    constructor() {
        super('buildPipelines');
    }

    buildInline(oci: ociContext.Context, buildPipelines: any, treeChanged: nodes.TreeChanged): nodes.BaseNode[] | undefined {
        const items = buildPipelines.inline;
        if (!items || items.length === 0) {
            return undefined;
        }
        const itemNodes = buildItemNodes(oci, items, treeChanged);
        return itemNodes;
    }

    buildContainers(oci: ociContext.Context, buildPipelines: any, treeChanged: nodes.TreeChanged): nodes.BaseNode[] | undefined {
        const containers = buildPipelines.containers;
        if (!containers || containers.length === 0) {
            return undefined;
        }
        const containerNodes: nodes.BaseNode[] = [];
        for (const container of containers) {
            const type = container.type;
            if (type === 'project') {
                const displayName = container.displayName;
                const containerNode = new ProjectBuildPipelinesNode(displayName, oci, treeChanged);
                containerNodes.push(containerNode);
            } else if (type === 'custom') {
                const displayName = container.displayName;
                const containerNode = new CustomBuildPipelinesNode(displayName, oci, container.items, treeChanged);
                containerNodes.push(containerNode);
            }
        }
        return containerNodes;
    }

    async importServices(oci: ociContext.Context): Promise<any | undefined> {
        const provider = oci.getProvider();
        const project = oci.getDevOpsProject();
        const repository = oci.getCodeRepository();
        const buildPipelines = await ociUtils.listBuildPipelineStagesByCodeRepository(provider, project, repository);
        if (buildPipelines.length > 0) {
            const inline: any[] = [];
            let idx = 0;
            for (const buildPipeline of buildPipelines) {
                inline.push({
                    'ocid': buildPipeline.id,
                    'displayName': buildPipeline.displayName? buildPipeline.displayName : `Build Pipeline ${idx++}`
                });
            }
            return {
                inline: inline
            }
        } else {
            return undefined;
        }
    }

}

function buildItemNodes(oci: ociContext.Context, items: any, treeChanged: nodes.TreeChanged): nodes.BaseNode[] {
    const itemNodes: nodes.BaseNode[] = [];
    for (const item of items) {
        const ocid = item.ocid;
        const displayName = item.displayName;
        const buildPipelineNode = new BuildPipelineNode(displayName, oci, ocid, treeChanged);
        itemNodes.push(buildPipelineNode);
    }
    return itemNodes;
}

class ProjectBuildPipelinesNode extends nodes.AsyncNode {

    private oci: ociContext.Context;

    constructor(displayName: string | undefined, oci: ociContext.Context, treeChanged: nodes.TreeChanged) {
        super(displayName ? displayName : 'Build', undefined, 'gcn.oci.projectBuildPipelinesNode', treeChanged);
        this.oci = oci;
        this.iconPath = new vscode.ThemeIcon('play-circle');
        this.updateAppearance();
    }

    async computeChildren(): Promise<nodes.BaseNode[] | undefined> {
        const provider = this.oci.getProvider();
        const project = this.oci.getDevOpsProject();
        const buildPipelines = (await ociUtils.listBuildPipelines(provider, project))?.buildPipelineCollection.items;
        if (buildPipelines) {
            const children: nodes.BaseNode[] = []
            let idx = 0;
            for (const buildPipeline of buildPipelines) {
                const ocid = buildPipeline.id;
                const displayName = buildPipeline.displayName;
                children.push(new BuildPipelineNode(displayName ? displayName : `Build Pipeline ${idx++}`, this.oci, ocid, this.treeChanged));
            }
            return children;
        }
        return [ new nodes.NoItemsNode() ];
    }

}

class CustomBuildPipelinesNode extends nodes.AsyncNode {

    private oci: ociContext.Context;
    private items: any;

    constructor(displayName: string | undefined, oci: ociContext.Context, items: any, treeChanged: nodes.TreeChanged) {
        super(displayName ? displayName : 'Build (Custom)', undefined, 'gcn.oci.customBuildPipelinesNode', treeChanged);
        this.oci = oci;
        this.items = items;
        this.iconPath = new vscode.ThemeIcon('play-circle');
        this.updateAppearance();
    }

    async computeChildren(): Promise<nodes.BaseNode[] | undefined> {
        if (this.items?.length > 0) {
            const itemNodes = buildItemNodes(this.oci, this.items, this.treeChanged);
            return itemNodes;
        }
        return [ new nodes.NoItemsNode() ];
    }

}

class BuildPipelineNode extends nodes.ChangeableNode {

    private oci: ociContext.Context;
    private ocid: string;
    private lastRun?: { ocid: string, state?: string, output?: vscode.OutputChannel };

    constructor(displayName: string, oci: ociContext.Context, ocid: string, treeChanged: nodes.TreeChanged) {
        super(displayName, undefined, 'gcn.oci.buildPipelineNode', undefined, undefined, treeChanged);
        this.oci = oci;
        this.ocid = ocid;
        this.iconPath = new vscode.ThemeIcon('play-circle');
        this.command = { command: 'extension.gcn.showBuildOutput', title: 'Show Build Output', arguments: [this] };
        this.updateAppearance();
        ociUtils.listBuildRuns(this.oci.getProvider(), this.ocid).then(response => {
            if (response?.buildRunSummaryCollection.items.length) {
                const run = response.buildRunSummaryCollection.items[0];
                const output = run.displayName ? vscode.window.createOutputChannel(run.displayName) : undefined;
                output?.hide();
                this.updateLastRun(run.id, run.lifecycleState, output);
                this.updateWhenCompleted(run.id, run.compartmentId, run.timeCreated);
            }
        });
    }

    runPipeline() {
        if (!ociUtils.isRunning(this.lastRun?.state)) {
            graalvmUtils.getActiveGVMVersion().then(version => {
                if (version) {
                    const buildName = `${this.label}-${this.getTimestamp()} (from VS Code)`;
                    vscode.window.withProgress({
                        location: vscode.ProgressLocation.Notification,
                        title: `Starting build "${buildName}" using ${version[1]}, Java ${version[0]}...`,
                        cancellable: false
                    }, (_progress, _token) => {
                        return new Promise(async (resolve) => {
                            const buildRun = (await ociUtils.createBuildRun(this.oci.getProvider(), this.ocid, buildName, []))?.buildRun;
                            resolve(true);
                            if (buildRun) {
                                this.updateLastRun(buildRun.id, buildRun.lifecycleState, buildRun.displayName ? vscode.window.createOutputChannel(buildRun.displayName) : undefined);
                                this.showBuildOutput();
                                this.updateWhenCompleted(buildRun.id, buildRun.compartmentId, buildRun.timeCreated);
                            }
                        });
                    })
                } else {
                    vscode.window.showErrorMessage('No local active GraalVM installation detected.');
                }
            });
        }
    }

    showBuildOutput() {
        this.lastRun?.output?.show();
    }

    private getTimestamp(): string {
        const date = new Date();
        const year = date.getFullYear();
        let month = (date.getMonth() + 1).toString();
        if (month.length === 1) month = `0${month}`;
        let day = date.getDate().toString();
        if (day.length === 1) day = `0${day}`;
        let hours = date.getHours().toString();
        if (hours.length === 1) hours = `0${hours}`;
        let minutes = date.getMinutes().toString();
        if (minutes.length === 1) minutes = `0${minutes}`;
        return `${year}${month}${day}-${hours}${minutes}`;
    }

    private updateLastRun(ocid: string, state?: string, output?: vscode.OutputChannel ) {
        if (this.lastRun?.output !== output) {
            this.lastRun?.output?.hide();
            this.lastRun?.output?.dispose();
        }
        this.lastRun = { ocid, state, output };
        switch (state) {
            case 'ACCEPTED':
            case 'IN_PROGRESS':
            case 'CANCELING':
                this.iconPath = new vscode.ThemeIcon('play-circle', new vscode.ThemeColor('charts.orange'));
                break;
            case 'SUCCEEDED':
                this.iconPath = new vscode.ThemeIcon('play-circle', new vscode.ThemeColor('charts.green'));
                break;
            case 'FAILED':
                this.iconPath = new vscode.ThemeIcon('play-circle', new vscode.ThemeColor('charts.red'));
                break;
            default:
                this.iconPath = new vscode.ThemeIcon('play-circle');
        }
        this.treeChanged(this);
    }

    private async updateWhenCompleted(buildRunId: string, compartmentId?: string, timeStart?: Date) {
        const groupId = compartmentId ? await ociUtils.getDefaultLogGroup(this.oci.getProvider(), compartmentId) : undefined;
        const logId = groupId ? (await ociUtils.listLogs(this.oci.getProvider(), groupId))?.items.find(item => item.configuration?.source.resource === this.oci.getDevOpsProject())?.id : undefined;
        let lastResults: any[] = [];
        const update = async () => {
            const buildRun = (await ociUtils.getBuildRun(this.oci.getProvider(), buildRunId))?.buildRun;
            if (this.lastRun?.output && buildRun && compartmentId && groupId && logId && timeStart) {
                const timeEnd = ociUtils.isRunning(buildRun.lifecycleState) ? new Date() : buildRun.timeUpdated;
                if (timeEnd) {
                    const results = await ociUtils.searchLogs(this.oci.getProvider(), compartmentId, groupId, logId, buildRun.id, timeStart, timeEnd);
                    if (results?.length && results.length > lastResults.length) {
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
                }
            }
            return buildRun?.lifecycleState;
        };
        const state = await ociUtils.completion(5000, update);
        this.updateLastRun(buildRunId, state, this.lastRun?.output);
        for (let i = 0; i < 60; i++) {
            if (this.lastRun?.ocid !== buildRunId) {
                return;
            }
            await ociUtils.delay(10000);
            await update();
        }
    }
}
