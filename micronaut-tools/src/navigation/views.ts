/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as nodes from './nodes';
import * as workspaceFolders from './workspaceFolders';


const VIEW_BEANS = 'extension-micronaut-tools-beans';
const VIEW_ENDPOINTS = 'extension-micronaut-tools-endpoints';

const COMMAND_SEARCH_FILTER_BEANS = 'extension.micronaut-tools.navigation.searchBeans';
const COMMAND_SEARCH_FILTER_ENDPOINTS = 'extension.micronaut-tools.navigation.searchEndpoints';

export function initialize(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.commands.registerCommand(COMMAND_SEARCH_FILTER_BEANS, () => {
        searchFilterView(VIEW_BEANS);
	}));
    context.subscriptions.push(vscode.commands.registerCommand(COMMAND_SEARCH_FILTER_ENDPOINTS, () => {
        searchFilterView(VIEW_ENDPOINTS);
	}));
    workspaceFolders.onUpdated((added, removed, current) => {
        beansNodeProvider.dataChanged(added, removed, current);
        endpointsNodeProvider.dataChanged(added, removed, current);
    });
}

async function searchFilterView(viewID: string) {
    await vscode.commands.executeCommand(`${viewID}.focus`);
    await vscode.commands.executeCommand('list.find');
}

abstract class NodeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {

	private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | null> = new vscode.EventEmitter<vscode.TreeItem | undefined | null>();
	readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | null> = this._onDidChangeTreeData.event;

    private readonly roots: nodes.BaseNode[] = [];

    abstract buildNodes(roots: nodes.BaseNode[], added: workspaceFolders.FolderData[], removed: workspaceFolders.FolderData[], current: workspaceFolders.FolderData[]): Promise<void>;

    dataChanged(added: workspaceFolders.FolderData[], removed: workspaceFolders.FolderData[], current: workspaceFolders.FolderData[]) {
        this.buildNodes(this.roots, added, removed, current);
    }

    refresh(element?: vscode.TreeItem) {
        if (this.roots.length === 1 && this.roots[0] === element) { // single root node is collapsed
            element = undefined;
        }
        this._onDidChangeTreeData.fire(element);
	}

	getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
	}

	getChildren(element?: vscode.TreeItem): vscode.ProviderResult<vscode.TreeItem[]> {
        if (!element) {
            return this.roots.length === 1 ? this.roots[0].getChildren() || [] : this.roots; // collapse single root node
        } else {
            return (element as nodes.BaseNode).getChildren() || [];
        }
	}

    getParent?(element: vscode.TreeItem): vscode.ProviderResult<vscode.TreeItem> {
        return (element as nodes.BaseNode).parent;
    }

}

class BeansNodeProvider extends NodeProvider {
    
    async buildNodes(roots: nodes.BaseNode[], added: workspaceFolders.FolderData[], removed: workspaceFolders.FolderData[], _current: workspaceFolders.FolderData[]) {
        for (const remove of removed) {
            for (let index = 0; index < roots.length; index++) {
                if ((roots[index] as nodes.BeansFolderNode).getFolderData().getWorkspaceFolder() === remove.getWorkspaceFolder()) {
                    roots.splice(index, 1);
                    break;
                }
            }
        }
        for (const add of added) {
            const node = new nodes.BeansFolderNode(add, beansTreeChanged);
            roots.push(node);
        }
        beansTreeChanged();
    }

}

const beansNodeProvider = new BeansNodeProvider();
const beansTreeView = vscode.window.createTreeView(VIEW_BEANS, { treeDataProvider: beansNodeProvider });
const beansTreeChanged: nodes.TreeChanged = (treeItem?: vscode.TreeItem, expand?: boolean) => {
    if (treeItem && expand) {
        beansTreeView.reveal(treeItem, {
            expand: true
        });
    }
    beansNodeProvider.refresh(treeItem);
};

class EndpointsNodeProvider extends NodeProvider {
    
    async buildNodes(roots: nodes.BaseNode[], added: workspaceFolders.FolderData[], removed: workspaceFolders.FolderData[], _current: workspaceFolders.FolderData[]) {
        for (const remove of removed) {
            for (let index = 0; index < roots.length; index++) {
                if ((roots[index] as nodes.EndpointsFolderNode).getFolderData().getWorkspaceFolder() === remove.getWorkspaceFolder()) {
                    roots.splice(index, 1);
                    break;
                }
            }
        }
        for (const add of added) {
            const node = new nodes.EndpointsFolderNode(add, endpointsTreeChanged);
            roots.push(node);
        }
        endpointsTreeChanged();
    }

}

const endpointsNodeProvider = new EndpointsNodeProvider();
const endpointsTreeView = vscode.window.createTreeView(VIEW_ENDPOINTS, { treeDataProvider: endpointsNodeProvider });
const endpointsTreeChanged: nodes.TreeChanged = (treeItem?: vscode.TreeItem, expand?: boolean) => {
    if (treeItem && expand) {
        endpointsTreeView.reveal(treeItem, {
            expand: true
        });
    }
    endpointsNodeProvider.refresh(treeItem);
};