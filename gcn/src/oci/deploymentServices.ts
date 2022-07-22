/*
 * Copyright (c) 2022, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as nodes from '../nodes';
import * as ociContext from './ociContext';
import * as ociServices from './ociServices';

export function createFeaturePlugins(_context: vscode.ExtensionContext): ociServices.ServicePlugin[] {
    // TODO: initialize actions using context
    return [ new Plugin() ];
}

class Plugin extends ociServices.ServicePlugin {

    constructor() {
        super('deploymentPipelines');
    }

    buildInline(_oci: ociContext.Context, deploymentPipelines: any, _treeChanged: nodes.TreeChanged): nodes.BaseNode[] | undefined {
        const items = deploymentPipelines.inline;
        if (!items || items.length === 0) {
            return undefined;
        }
        const itemNodes = buildItemNodes(items);
        return itemNodes;
    }

    buildContainers(oci: ociContext.Context, deploymentPipelines: any, treeChanged: nodes.TreeChanged): nodes.BaseNode[] | undefined {
        const containers = deploymentPipelines.containers;
        if (!containers || containers.length === 0) {
            return undefined;
        }
        const containerNodes: nodes.BaseNode[] = [];
        for (const container of containers) {
            const type = container.type;
            if (type === 'project') {
                const displayName = container.displayName;
                const containerNode = new ProjectDeploymentPipelinesNode(displayName, oci, treeChanged);
                containerNodes.push(containerNode);
            } else if (type === 'custom') {
                const displayName = container.displayName;
                const defaultContainerNode = new CustomDeploymentPipelinesNode(displayName, container.items, treeChanged);
                containerNodes.push(defaultContainerNode);
            }
        }
        return containerNodes;
    }

}

function buildItemNodes(items: any): nodes.BaseNode[] {
    const itemNodes: nodes.BaseNode[] = [];
    for (const item of items) {
        const ocid = item.ocid;
        const displayName = item.displayName;
        const buildPipelineNode = new DeploymentPipelineNode(ocid, displayName);
        itemNodes.push(buildPipelineNode);
    }
    return itemNodes;
}

class ProjectDeploymentPipelinesNode extends nodes.AsyncNode {

    // private oci: ociContext.Context;

    constructor(displayName: string | undefined, _oci: ociContext.Context, treeChanged: nodes.TreeChanged) {
        super(displayName ? displayName : 'Build', undefined, 'gcn.oci.projectDeploymentPipelinesNode', treeChanged);
        // this.oci = oci;
        this.iconPath = new vscode.ThemeIcon('rocket');
        this.updateAppearance();
    }

    async computeChildren(): Promise<nodes.BaseNode[] | undefined> {
        // const deploymentPipelines = (await ociUtils.listDeploymentPipelines(this.settings.devopsProject.ocid))?.deploymentPipelineCollection.items;
        // if (deploymentPipelines) {
        //     const children: nodes.BaseNode[] = []
        //     let idx = 0;
        //     for (const deploymentPipeline of deploymentPipelines) {
        //         const ocid = deploymentPipeline.id;
        //         const displayName = deploymentPipeline.displayName;
        //         children.push(new ServicesDeploymentPipelineNode(ocid, displayName ? displayName : `Deployment Pipeline ${idx++}`));
        //     }
        //     return children;
        // }
        return [ new nodes.NoItemsNode() ];
    }

}

class CustomDeploymentPipelinesNode extends nodes.AsyncNode {

    private items: any;

    constructor(displayName: string | undefined, items: any, treeChanged: nodes.TreeChanged) {
        super(displayName ? displayName : 'Deploy (Custom)', undefined, 'gcn.oci.customDeploymentPipelinesNode', treeChanged);
        this.items = items;
        this.iconPath = new vscode.ThemeIcon('rocket');
        this.updateAppearance();
    }

    async computeChildren(): Promise<nodes.BaseNode[] | undefined> {
        if (this.items?.length > 0) {
            const itemNodes = buildItemNodes(this.items);
            return itemNodes;
        }
        return [ new nodes.NoItemsNode() ];
    }

}

class DeploymentPipelineNode extends nodes.BaseNode {

    // private ocid: string;

    constructor(_ocid: string, displayName: string) {
        super(displayName, undefined, 'gcn.oci.deploymentPipelineNode', undefined, undefined);
        // this.ocid = ocid;
        this.iconPath = new vscode.ThemeIcon('rocket');
        this.updateAppearance();
    }

}
