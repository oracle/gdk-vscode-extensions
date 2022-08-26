/*
 * Copyright (c) 2022, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';


export type TreeChanged = (treeItem?: vscode.TreeItem) => void;

export interface DeployNode {
    deploy(): void;
}

const DEPLOY_NODES: string[] = [];

export async function registerDeployNode(context: string | string[]) {
    if (typeof context === 'string' || context instanceof String) {
        DEPLOY_NODES.push(context as string);
    } else {
        DEPLOY_NODES.push(...context);
    }
    await vscode.commands.executeCommand('setContext', 'gcn.deployToCloudNodes', DEPLOY_NODES);
}

export interface RenameableNode {
    rename(): void;
}

export interface AddContentNode {
    addContent(): void;
}

const ADD_CONTENT_NODES: string[] = [];

export async function registerAddContentNode(context: string | string[]) {
    if (typeof context === 'string' || context instanceof String) {
        ADD_CONTENT_NODES.push(context as string);
    } else {
        ADD_CONTENT_NODES.push(...context);
    }
    await vscode.commands.executeCommand('setContext', 'gcn.addContentNodes', ADD_CONTENT_NODES);
}

export interface RenameableNode {
    rename(): void;
}

const RENAMEABLE_NODES: string[] = [];

export async function registerRenameableNode(context: string | string[]) {
    if (typeof context === 'string' || context instanceof String) {
        RENAMEABLE_NODES.push(context as string);
    } else {
        RENAMEABLE_NODES.push(...context);
    }
    await vscode.commands.executeCommand('setContext', 'gcn.renameableNodes', RENAMEABLE_NODES);
}

export interface RemovableNode {
    remove(): void;
}

const REMOVABLE_NODES: string[] = [];

export async function registerRemovableNode(context: string | string[]) {
    if (typeof context === 'string' || context instanceof String) {
        REMOVABLE_NODES.push(context as string);
    } else {
        REMOVABLE_NODES.push(...context);
    }
    await vscode.commands.executeCommand('setContext', 'gcn.removableNodes', REMOVABLE_NODES);
}

export interface ReloadableNode {
    reload(): void;
}

const RELOADABLE_NODES: string[] = [];

export async function registerReloadableNode(context: string | string[]) {
    if (typeof context === 'string' || context instanceof String) {
        RELOADABLE_NODES.push(context as string);
    } else {
        RELOADABLE_NODES.push(...context);
    }
    await vscode.commands.executeCommand('setContext', 'gcn.reloadableNodes', RELOADABLE_NODES);
}

export interface ShowReportNode {
    showReport(): void;
}

const SHOW_REPORT_NODES: string[] = [];

export async function registerShowReportNode(context: string | string[]) {
    if (typeof context === 'string' || context instanceof String) {
        SHOW_REPORT_NODES.push(context as string);
    } else {
        SHOW_REPORT_NODES.push(...context);
    }
    await vscode.commands.executeCommand('setContext', 'gcn.showReportNodes', SHOW_REPORT_NODES);
}

export function getLabel(node: BaseNode): string | undefined {
    return typeof node.label === 'string' ? node.label as string : (node.label as vscode.TreeItemLabel).label;
}

export class BaseNode extends vscode.TreeItem {

    parent: BaseNode | undefined;
    children: BaseNode[] | undefined | null;

    constructor(label: string, description: string | undefined, contextValue: string | undefined, children: BaseNode[] | undefined | null, expanded: boolean | undefined) {
        super(label);
        this.description = description;
        this.contextValue = contextValue;
        this.setChildren(children);
        if (!children || expanded === undefined) {
            this.collapsibleState = vscode.TreeItemCollapsibleState.None;
        } if (expanded === true) {
            this.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
        } else if (expanded === false) {
            this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
        }
    }

    public setChildren(children: BaseNode[] | undefined | null) {
        if (this.children) {
            for (const child of this.children) {
                child.parent = undefined;
            }
        }
        this.children = children;
        if (this.children) {
            for (const child of this.children) {
                child.parent = this;
            }
        }
    }

    public getChildren(): BaseNode[] | undefined {
        return this.children ? this.children : undefined;
    }

    public removeFromParent(treeChanged?: TreeChanged): boolean {
        const parent = this.parent;
        if (parent) {
            if (parent.removeChild(this)) {
                if (treeChanged) {
                    treeChanged(parent);
                }
                return true;
            }
            this.parent = undefined;
        }
        return false;
    }

    removeChild(child: BaseNode): boolean {
        if (this.children) {
            const idx = this.children.indexOf(child);
            if (idx >= 0) {
                this.children.splice(idx, 1);
                return true;
            }
        }
        return false;
    }

    public updateAppearance() {
        this.tooltip = this.description ? `${this.label}: ${this.description}` : getLabel(this);
    }

}

export class ChangeableNode extends BaseNode {

    constructor(label: string, description: string | undefined, contextValue: string | undefined, children: BaseNode[] | undefined | null, expanded: boolean | undefined, protected readonly treeChanged: TreeChanged) {
        super(label, description, contextValue, children, expanded);
    }

}

export class AsyncNode extends ChangeableNode {

    constructor(label: string, description: string | undefined, contextValue: string | undefined, treeChanged: TreeChanged) {
        super(label, description, contextValue, null, false, treeChanged);
        this.description = description;
        this.contextValue = contextValue;
    }

    public getChildren(): BaseNode[] | undefined {
        if (this.children !== null) {
            return this.children;
        } else {
            this.computeChildren().then(children => {
                this.setChildren(children);
                this.treeChanged(this);
            }).catch(err => {
                console.log('>>> Error in async computeChildren()');
                console.log(err);
                this.setChildren([ new NoItemsNode() ]);
                this.treeChanged(this);
            });
            return [ new LoadingNode() ];
        }
    }

    async computeChildren(): Promise<BaseNode[] | undefined> {
        return [ new NoItemsNode() ];
    }

    public reload() {
        if (this.children !== null) {
            this.setChildren(null);
            this.treeChanged(this);
        }
    }

}

export class TextNode extends BaseNode {

    constructor(text: string, contextValue?: string) {
        super('', text, contextValue ? contextValue : 'gcn.textNode', undefined, undefined);
        this.tooltip = `${this.description}`;
    }

}

export class NoItemsNode extends TextNode {

    constructor() {
        super('<no items>');
    }

}

export class LoadingNode extends TextNode {

    constructor() {
        super('<loading...>');
    }

}

export class ServicesDeployNode extends BaseNode {

    constructor(children: BaseNode[]) {
        super('Deploy', undefined, 'gcn.servicesDeployNode', children.length === 0 ? [ new TextNode('<not implemented yet>') ] : children, false);
        this.iconPath = new vscode.ThemeIcon('rocket');
        this.updateAppearance();
    }

}
