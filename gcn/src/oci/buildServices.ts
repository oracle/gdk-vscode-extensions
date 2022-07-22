/*
 * Copyright (c) 2022, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as nodes from '../nodes';
import * as ociUtils from './ociUtils';
import * as ociContext from './ociContext';
import * as ociServices from './ociServices';

export function createFeaturePlugins(_context: vscode.ExtensionContext): ociServices.ServicePlugin[] {
    // TODO: initialize actions using context
    return [ new Plugin() ];
}

class Plugin extends ociServices.ServicePlugin {

    constructor() {
        super('buildPipelines');
    }

    buildInline(_oci: ociContext.Context, buildPipelines: any, treeChanged: nodes.TreeChanged): nodes.BaseNode[] | undefined {
        const items = buildPipelines.inline;
        if (!items || items.length === 0) {
            return undefined;
        }
        const itemNodes = buildItemNodes(items, treeChanged);
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
                const containerNode = new CustomBuildPipelinesNode(displayName, container.items, treeChanged);
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

function buildItemNodes(items: any, treeChanged: nodes.TreeChanged): nodes.BaseNode[] {
    const itemNodes: nodes.BaseNode[] = [];
    for (const item of items) {
        const ocid = item.ocid;
        const displayName = item.displayName;
        const buildPipelineNode = new BuildPipelineNode(displayName, ocid, treeChanged);
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
                children.push(new BuildPipelineNode(displayName ? displayName : `Build Pipeline ${idx++}`, ocid, this.treeChanged));
            }
            return children;
        }
        return [ new nodes.NoItemsNode() ];
    }

}

class CustomBuildPipelinesNode extends nodes.AsyncNode {

    private items: any;

    constructor(displayName: string | undefined, items: any, treeChanged: nodes.TreeChanged) {
        super(displayName ? displayName : 'Build (Custom)', undefined, 'gcn.oci.customBuildPipelinesNode', treeChanged);
        this.items = items;
        this.iconPath = new vscode.ThemeIcon('play-circle');
        this.updateAppearance();
    }

    async computeChildren(): Promise<nodes.BaseNode[] | undefined> {
        if (this.items?.length > 0) {
            const itemNodes = buildItemNodes(this.items, this.treeChanged);
            return itemNodes;
        }
        return [ new nodes.NoItemsNode() ];
    }

}

class BuildPipelineNode extends nodes.ChangeableNode {

    // private ocid: string;

    constructor(displayName: string, _ocid: string, treeChanged: nodes.TreeChanged) {
        super(displayName, undefined, 'gcn.oci.buildPipelineNode', undefined, undefined, treeChanged);
        // this.ocid = ocid;
        this.iconPath = new vscode.ThemeIcon('play-circle');
        this.updateAppearance();
    }

}
