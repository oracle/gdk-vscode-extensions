/*
 * Copyright (c) 2022, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import { CLOUD_SUPPORTS } from './extension';
import * as model from './model';
import * as nodes from './nodes';
import * as folderStorage from './folderStorage';

export function initialize(_extensionContext: vscode.ExtensionContext) {
    // TODO: initialize actions using context
}

export async function rebuild() {
    await vscode.commands.executeCommand('setContext', 'gcn.servicesViewInitialized', false);
    await vscode.commands.executeCommand('setContext', 'gcn.serviceFoldersCount', -1);

    const folders = vscode.workspace.workspaceFolders;
    const folderNodes: FolderNode[] = [];
    if (folders) {
        const treeChanged: nodes.TreeChanged = (tree?: vscode.TreeItem) => {
            nodeProvider.refresh(tree);
        }
        for (const folder of folders) {
            // folderStorage.createSampleConfiguration(folder);

            const services = folderStorage.readStorage(folder);
            const configurations = services?.getConfigurations();
            const serviceNodes: nodes.BaseNode[] = [];
            if (configurations) {
                for (const configuration of configurations) {
                    const cloudSupport = getCloudSupport(configuration.getType());
                    if (cloudSupport) {
                        const supportServices = cloudSupport.getServices(folder, configuration);
                        if (supportServices) {
                            const folderServicesNode = new FolderServicesNode(configuration.getName(), supportServices, treeChanged);
                            serviceNodes.push(folderServicesNode);
                        }
                    }
                }
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

    await vscode.commands.executeCommand('setContext', 'gcn.serviceFoldersCount', folderNodes.length);
    await vscode.commands.executeCommand('setContext', 'gcn.servicesViewInitialized', true);
}

function getCloudSupport(servicesType: string): model.CloudSupport | undefined {
    for (const cloudSupport of CLOUD_SUPPORTS) {
        if (cloudSupport.getType() === servicesType) {
            return cloudSupport;
        }
    }
    return undefined;
}

class FolderNode extends nodes.BaseNode {

    constructor(folder: vscode.WorkspaceFolder, children: nodes.BaseNode[]) {
        super(folder.name, undefined, 'gcn.folderNode', children, true);
        this.collapseOneChildNode();
        this.updateAppearance();
    }

    collapseOneChildNode() {
        // TODO: update parent handles
        if (this.children && this.children.length === 1) {
            this.children = this.children[0].getChildren();
        }
    }

}

class FolderServicesNode extends nodes.BaseNode {

    constructor(name: string, services: model.CloudServices, treeChanged: nodes.TreeChanged) {
        super(name, undefined, 'gcn.folderServicesNode', services.buildNodes(treeChanged), true);
        // this.collapseOneChildNode();
        this.updateAppearance();
    }

    // collapseOneChildNode() {
    //     // TODO: update parent handles
    //     if (this.children && this.children.length === 1) {
    //         this.children = this.children[0].getChildren();
    //     }
    // }

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
            return this.roots.length === 1 ? this.roots[0].getChildren() : this.roots;
        } else {
            return (element as nodes.BaseNode).getChildren();
        }
	}
}
export const nodeProvider = new NodeProvider();