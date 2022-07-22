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
        super('containerRepository');
    }

    buildInline(oci: ociContext.Context, containerRepository: any, treeChanged: nodes.TreeChanged): nodes.BaseNode[] | undefined {
        const items = containerRepository.inline;
        if (!items || items.length === 0) {
            return undefined;
        }
        const itemNodes = buildContainerNodes(items, oci, treeChanged);
        return itemNodes;
    }

    buildContainers(oci: ociContext.Context, containerRepository: any, treeChanged: nodes.TreeChanged): nodes.BaseNode[] | undefined {
        const containers = containerRepository.containers;
        if (!containers || containers.length === 0) {
            return undefined;
        }
        const containerNodes: nodes.BaseNode[] = [];
        for (const container of containers) {
            const type = container.type;
            if (type === 'compartment') {
                const displayName = container.displayName;
                const containerNode = new CompartmentContainerRepositoriesNode(displayName, oci, treeChanged);
                containerNodes.push(containerNode);
            } else if (type === 'custom') {
                const displayName = container.displayName;
                const containerNode = new CustomContainerRepositoriesNode(displayName, container.items, oci, treeChanged);
                containerNodes.push(containerNode);
            }
        }
        return containerNodes;
    }

}

function buildContainerNodes(items: any, oci: ociContext.Context, treeChanged: nodes.TreeChanged): nodes.BaseNode[] {
    const itemNodes: nodes.BaseNode[] = [];
    for (const item of items) {
        const ocid = item.ocid;
        const displayName = item.displayName;
        const containerRepositoryNode = new ContainerRepositoryNode(ocid, oci, displayName, treeChanged);
        itemNodes.push(containerRepositoryNode);
    }
    return itemNodes;
}

export class CompartmentContainerRepositoriesNode extends nodes.AsyncNode {

    private oci: ociContext.Context

    constructor(displayName: string | undefined, oci: ociContext.Context, treeChanged: nodes.TreeChanged) {
        super(displayName ? displayName : 'Container Repositories', undefined, 'gcn.oci.compartmentContainerRepositoriesNode', treeChanged);
        this.oci = oci;
        this.iconPath = new vscode.ThemeIcon('extensions');
        this.updateAppearance();
    }

    async computeChildren(): Promise<nodes.BaseNode[] | undefined> {
        const provider = this.oci.getProvider();
        const compartment = this.oci.getCompartment();
        const containerRepositories = (await ociUtils.listContainerRepositories(provider, compartment))?.containerRepositoryCollection.items;
        if (containerRepositories) {
            const children: nodes.BaseNode[] = []
            for (const containerRepository of containerRepositories) {
                const ocid = containerRepository.id;
                const displayName = containerRepository.displayName;
                children.push(new ContainerRepositoryNode(ocid, this.oci, displayName, this.treeChanged));
            }
            return children;
        }
        return [ new nodes.NoItemsNode() ];
    }

}

class CustomContainerRepositoriesNode extends nodes.AsyncNode {

    private items: any;
    private oci: ociContext.Context;

    constructor(displayName: string | undefined, items: any, oci: ociContext.Context, treeChanged: nodes.TreeChanged) {
        super(displayName ? displayName : 'Container Repositories (Custom)', undefined, 'gcn.oci.customContainerRepositoriesNode', treeChanged);
        this.items = items;
        this.oci = oci;
        this.iconPath = new vscode.ThemeIcon('extensions');
        this.updateAppearance();
    }

    async computeChildren(): Promise<nodes.BaseNode[] | undefined> {
        if (this.items?.length > 0) {
            const itemNodes = buildContainerNodes(this.items, this.oci, this.treeChanged);
            return itemNodes;
        }
        return [ new nodes.NoItemsNode() ];
    }
}

class ContainerRepositoryNode extends nodes.AsyncNode {

    private ocid: string;
    private oci: ociContext.Context;

    constructor(ocid: string, oci: ociContext.Context, displayName: string, treeChanged: nodes.TreeChanged) {
        super(displayName, undefined, 'gcn.oci.containerRepositoryNode', treeChanged);
        this.ocid = ocid;
        this.oci = oci;
        this.iconPath = new vscode.ThemeIcon('extensions');
        this.updateAppearance();
    }

    async computeChildren(): Promise<nodes.BaseNode[] | undefined> {
        const provider = this.oci.getProvider();
        const compartment = this.oci.getCompartment();
        const repository = this.ocid;
        const images = (await ociUtils.listContainerImages(provider, compartment, repository))?.containerImageCollection.items;
        if (images) {
            const children: nodes.BaseNode[] = []
            for (const image of images) {
                const ocid = image.id;
                let displayName = image.displayName;
                const unknownVersionIdx = displayName.indexOf(':unknown@');
                if (unknownVersionIdx > -1) {
                    // displayName = displayName.substring(0, unknownVersionIdx);
                    continue;
                }
                const imageDescription = `(${new Date(image.timeCreated).toLocaleString()})`;
                children.push(new ContainerImageNode(ocid, displayName, imageDescription));
            }
            return children;
        }
        return [ new nodes.NoItemsNode() ];
    }

}

class ContainerImageNode extends nodes.BaseNode {

    // private ocid: string;

    constructor(_ocid: string, displayName: string, imageDescription?: string) {
        super(displayName, imageDescription, 'gcn.oci.containerImageNode', undefined, undefined);
        // this.ocid = ocid;
        this.iconPath = new vscode.ThemeIcon('primitive-square');
        this.updateAppearance();
    }

}
