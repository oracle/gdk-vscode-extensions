/*
 * Copyright (c) 2022, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';

export type TreeChanged = () => void;

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

    setChildren(children: BaseNode[] | undefined | null) {
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

    public updateAppearance() {
        this.tooltip = this.description ? `${this.label}: ${this.description}` : this.label;
    }

}

export class AsyncNode extends BaseNode {

    treeChanged: TreeChanged;

    constructor(label: string, description: string | undefined, contextValue: string | undefined, treeChanged: TreeChanged) {
        super(label, description, contextValue, null, false);
        this.description = description;
        this.contextValue = contextValue;
        this.treeChanged = treeChanged;
    }

    public getChildren(): BaseNode[] | undefined {
        if (this.children !== null) {
            return this.children;
        } else {
            this.computeChildren().then(children => {
                this.setChildren(children);
                this.treeChanged();
            }).catch(err => {
                console.log('>>> Error in async computeChildren()');
                console.log(err);
                this.setChildren([ new NoItemsNode() ]);
                this.treeChanged();
            });
            return [ new LoadingNode() ];
        }
    }

    async computeChildren(): Promise<BaseNode[] | undefined> {
        return [ new NoItemsNode() ];
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
