/*
 * Copyright (c) 2022, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as gcnServices from './gcnServices';
import * as model from './model';
import * as nodes from './nodes';
import * as dialogs from './dialogs';


export function initialize(extensionContext: vscode.ExtensionContext) {
    nodes.registerAddContentNode(FolderNode.CONTEXT);
    nodes.registerAddContentNode(FolderServicesNode.CONTEXT);
    extensionContext.subscriptions.push(vscode.commands.registerCommand('gcn.addContent', (...params: any[]) => {
        if (params[0]) {
            (params[0] as nodes.AddContentNode).addContent();
        } else {
            addContent(undefined, undefined);
        }
	}));
    extensionContext.subscriptions.push(vscode.commands.registerCommand('gcn.renameNode', (...params: any[]) => {
        if (params[0]) {
            (params[0] as nodes.RenameableNode).rename();
        }
	}));
    extensionContext.subscriptions.push(vscode.commands.registerCommand('gcn.removeNode', (...params: any[]) => {
        if (params[0]) {
            (params[0] as nodes.RemovableNode).remove();
        }
	}));
}

export function findCloudServicesByNode(node: nodes.BaseNode | undefined): model.CloudServices | undefined {
    while (node) {
        if (node instanceof FolderServicesNode) { // Multiple CloudServices defined for a folder
            return (node as FolderServicesNode).getServices();
        } else if (node instanceof FolderNode) { // Single CloudServices defined for a folder (FolderServicesNode collapsed)
            return (node as FolderNode).getFolderData().services[0];
        } else {
            node = node.parent;
        }
    }
    return undefined;
}

export function findWorkspaceFolderByNode(node: nodes.BaseNode | undefined): vscode.WorkspaceFolder | undefined {
    while (node) {
        if (node instanceof FolderNode) {
            return (node as FolderNode).getFolderData().folder;
        } else {
            node = node.parent;
        }
    }
    return undefined;
}

async function addContent(folder: gcnServices.FolderData | undefined, services: model.CloudServices | undefined) {
    if (!services) {
        if (!folder) {
            folder = await dialogs.selectFolder();
            if (!folder) {
                return;
            }
        }
        services = await dialogs.selectServices(folder);
        if (!services) {
            return;
        }
    }
    services.addContent();
}

export async function build(folders: gcnServices.FolderData[]) {
    const folderNodes: FolderNode[] = [];
    if (folders.length > 0) {
        const treeChanged: nodes.TreeChanged = (treeItem?: vscode.TreeItem) => {
            nodeProvider.refresh(treeItem);
        }
        for (const folder of folders) {
            const serviceNodes: FolderServicesNode[] = [];
            for (let i = 0; i < folder.configurations.length; i++) {
                const configuration = folder.configurations[i];
                const services = folder.services[i];
                const folderServicesNode = new FolderServicesNode(configuration.getName(), services, treeChanged);
                serviceNodes.push(folderServicesNode);
            }
            if (serviceNodes.length > 1) {
                for (const serviceNode of serviceNodes) {
                    const children = serviceNode.getChildren();
                    if (children && children.length === 0) {
                        serviceNode.setChildren([ new NoServicesNode() ]);
                    }
                }
            }
            const folderNode = new FolderNode(folder, serviceNodes);
            if (folders.length > 1) {
                const children = folderNode.getChildren();
                if (children && children.length === 0) {
                    folderNode.setChildren([ new NoServicesNode() ]);
                }
            }
            folderNodes.push(folderNode);
        }
    }
    nodeProvider.setRoots(folderNodes);
}

class FolderNode extends nodes.BaseNode implements nodes.AddContentNode {

    static readonly CONTEXT = 'gcn.folderNode';

    private folder: gcnServices.FolderData;

    constructor(folder: gcnServices.FolderData, children: FolderServicesNode[]) {
        super(folder.folder.name, undefined, FolderNode.CONTEXT, children, true);
        this.folder = folder;
        this.collapseOneChildNode();
        this.updateAppearance();
    }

    collapseOneChildNode() {
        if (this.children && this.children.length === 1) {
            const singleFolderServicesNode = this.children[0] as FolderServicesNode;
            this.setChildren(singleFolderServicesNode.getChildren());
            singleFolderServicesNode.parentWhenCollapsed = this; // Notify the collapsed FolderServicesNode to not break treeChanged() notifications
        }
    }

    getFolderData(): gcnServices.FolderData {
        return this.folder;
    }

    addContent() {
        addContent(this.folder, undefined);
    }

}

class FolderServicesNode extends nodes.BaseNode implements nodes.AddContentNode {

    static readonly CONTEXT = 'gcn.folderServicesNode';

    private services: model.CloudServices;
    parentWhenCollapsed: FolderNode | undefined;

    constructor(name: string, services: model.CloudServices, treeChanged: nodes.TreeChanged) {
        super(name, undefined, FolderServicesNode.CONTEXT, null, true);
        this.services = services;
        this.updateAppearance();
        const subtreeChanged: nodes.TreeChanged = (treeItem?: vscode.TreeItem) => {
            if (treeItem) {
                treeChanged(treeItem);
            } else {
                const servicesRoot = this.parentWhenCollapsed ? this.parentWhenCollapsed : this;
                servicesRoot.setChildren(this.services.getNodes());
                treeChanged(servicesRoot);
            }
        }
        services.buildNodes(subtreeChanged);
    }

    public getChildren(): nodes.BaseNode[] | undefined {
        if (this.children === null) {
            this.setChildren(this.services.getNodes());
        }
        return super.getChildren();
    }

    getServices(): model.CloudServices {
        return this.services;
    }

    addContent() {
        addContent(undefined, this.services);
    }

}

class NoServicesNode extends nodes.TextNode {

    constructor() {
        super('<no cloud services defined>');
    }

}

class NodeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {

	private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | null> = new vscode.EventEmitter<vscode.TreeItem | undefined | null>();
	readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | null> = this._onDidChangeTreeData.event;

    private roots: FolderNode[] = [];

    refresh(element?: vscode.TreeItem) {
        if (this.roots.length === 1 && this.roots[0] === element) { // single root node is collapsed
            element = undefined;
        }
        this._onDidChangeTreeData.fire(element);
	}

    setRoots(roots: FolderNode[]) {
        this.roots = roots;
        this.refresh();
    }

	getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
	}

	getChildren(element?: vscode.TreeItem): vscode.ProviderResult<vscode.TreeItem[]> {
        if (!element) {
            return this.roots.length === 1 ? this.roots[0].getChildren() : this.roots; // collapse single root node
        } else {
            return (element as nodes.BaseNode).getChildren();
        }
	}
}
export const nodeProvider = new NodeProvider();
