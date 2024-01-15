/*
 * Copyright (c) 2023, 2024, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as nodes from './nodes';
import * as symbols from './symbols';
import * as workspaceFolders from './workspaceFolders';
import * as logUtils from '../../../common/lib/logUtils';


const VIEW_APPLICATIONS = 'extension-micronaut-tools-applications';
const VIEW_BEANS = 'extension-micronaut-tools-beans';
const VIEW_ENDPOINTS = 'extension-micronaut-tools-endpoints';
const VIEW_MANAGEMENT = 'extension-micronaut-tools-management';

const COMMAND_SEARCH_FILTER_BEANS = 'extension.micronaut-tools.navigation.searchBeans';
const COMMAND_SEARCH_FILTER_ENDPOINTS = 'extension.micronaut-tools.navigation.searchEndpoints';
export const COMMAND_REVEAL_IN_ENDPOINTS = 'extension.micronaut-tools.navigation.revealInEndpoints';
export const COMMAND_NAME_REVEAL_IN_ENDPOINTS = vscode.l10n.t('Reveal in Endpoints');

let ICONS_FOLDER: vscode.Uri | undefined;

export function initialize(context: vscode.ExtensionContext) {
    ICONS_FOLDER = vscode.Uri.joinPath(context.extensionUri, 'images');

    context.subscriptions.push(vscode.commands.registerCommand(COMMAND_SEARCH_FILTER_BEANS, () => {
        searchFilterView(VIEW_BEANS);
	}));
    context.subscriptions.push(vscode.commands.registerCommand(COMMAND_SEARCH_FILTER_ENDPOINTS, () => {
        searchFilterView(VIEW_ENDPOINTS);
	}));
    context.subscriptions.push(vscode.commands.registerCommand(COMMAND_REVEAL_IN_ENDPOINTS, (symbol: symbols.Endpoint) => {
        if (symbol) {
            revealIn(VIEW_ENDPOINTS, symbol);
        }
	}));
    workspaceFolders.onUpdated((added, removed, current) => {
        applicationsNodeProvider.dataChanged(added, removed, current);
        beansNodeProvider.dataChanged(added, removed, current);
        endpointsNodeProvider.dataChanged(added, removed, current);
        managementNodeProvider.dataChanged(added, removed, current);
    });
    logUtils.logInfo(`[views] Initialized`);
}

async function searchFilterView(viewID: string) {
    await vscode.commands.executeCommand(`${viewID}.focus`);
    await vscode.commands.executeCommand('list.find');
}

async function revealIn(viewID: string, symbol: symbols.Symbol) {
    await vscode.commands.executeCommand(`${viewID}.focus`);
    const provider = viewID === VIEW_ENDPOINTS ? endpointsNodeProvider : viewID === VIEW_BEANS ? beansNodeProvider : undefined;
    const treeView = viewID === VIEW_ENDPOINTS ? endpointsTreeView : viewID === VIEW_BEANS ? beansTreeView : undefined;
    const item = provider?.getTreeItemBySymbol(symbol);
    if (item && treeView) {
        treeView.reveal(item, { focus: true });
    }
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

	getChildren(element?: vscode.TreeItem): vscode.TreeItem[] {
        if (!element) {
            return this.collapsesSingleRoot() && this.roots.length === 1 ? this.roots[0].getChildren() || [] : this.roots; // collapse single root node
        } else {
            return (element as nodes.BaseNode).getChildren() || [];
        }
	}

    getParent?(element: vscode.TreeItem): vscode.TreeItem | undefined {
        return (element as nodes.BaseNode).parent;
    }

    getTreeItemBySymbol(symbol: symbols.Symbol, element?: vscode.TreeItem): vscode.TreeItem | undefined {
        for (const e of this.getChildren(element)) {
            if (e instanceof nodes.SymbolNode && symbol.def.localeCompare((e as nodes.SymbolNode<symbols.Symbol>).getSymbol().def) === 0) {
                return this.getTreeItem(e);
            }
            const nested = this.getTreeItemBySymbol(symbol, e);
            if (nested) {
                return nested;
            }
        }
        return undefined;
    }

    collapsesSingleRoot(): boolean {
        return true;
    }
}

class ApplicationsNodeProvider extends NodeProvider {
    
    async buildNodes(roots: nodes.BaseNode[], added: workspaceFolders.FolderData[], removed: workspaceFolders.FolderData[], _current: workspaceFolders.FolderData[]) {
        for (const remove of removed) {
            for (let index = 0; index < roots.length; index++) {
                if ((roots[index] as nodes.ApplicationFolderNode).getFolderData().getWorkspaceFolder() === remove.getWorkspaceFolder()) {
                    roots.splice(index, 1);
                    break;
                }
            }
        }
        if (ICONS_FOLDER) {
            for (const add of added) {
                const node = new nodes.ApplicationFolderNode(add, ICONS_FOLDER, applicationsTreeChanged);
                roots.push(node);
            }
        }
        applicationsTreeChanged();
    }

    collapsesSingleRoot(): boolean {
        return false;
    }

}

const applicationsNodeProvider = new ApplicationsNodeProvider();
const applicationsTreeView = vscode.window.createTreeView(VIEW_APPLICATIONS, { treeDataProvider: applicationsNodeProvider });
const applicationsTreeChanged: nodes.TreeChanged = (treeItem?: vscode.TreeItem, expand?: boolean) => {
    if (treeItem && expand) {
        applicationsTreeView.reveal(treeItem, {
            expand: true
        });
    }
    applicationsNodeProvider.refresh(treeItem);
};

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

class ManagementNodeProvider extends NodeProvider {
    
    async buildNodes(roots: nodes.BaseNode[], added: workspaceFolders.FolderData[], removed: workspaceFolders.FolderData[], _current: workspaceFolders.FolderData[]) {
        for (const remove of removed) {
            for (let index = 0; index < roots.length; index++) {
                if ((roots[index] as nodes.ManagementFolderNode).getFolderData().getWorkspaceFolder() === remove.getWorkspaceFolder()) {
                    roots.splice(index, 1);
                    break;
                }
            }
        }
        for (const add of added) {
            const node = new nodes.ManagementFolderNode(add, managementTreeChanged);
            roots.push(node);
        }
        managementTreeChanged();
    }

}

const managementNodeProvider = new ManagementNodeProvider();
const managementTreeView = vscode.window.createTreeView(VIEW_MANAGEMENT, { treeDataProvider: managementNodeProvider });
const managementTreeChanged: nodes.TreeChanged = (treeItem?: vscode.TreeItem, expand?: boolean) => {
    if (treeItem && expand) {
        managementTreeView.reveal(treeItem, {
            expand: true
        });
    }
    managementNodeProvider.refresh(treeItem);
};
