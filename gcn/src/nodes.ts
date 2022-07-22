/*
 * Copyright (c) 2022, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';

export type TreeChanged = (tree?: vscode.TreeItem) => void;

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
        this.tooltip = this.description ? `${this.label}: ${this.description}` : (typeof this.label === 'string' ? this.label as string : (this.label as vscode.TreeItemLabel).label);
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
