/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as workspaceFolders from './workspaceFolders';
import * as symbols from './symbols';
import * as actions from './actions';


export type TreeChanged = (treeItem?: vscode.TreeItem, expand?: boolean) => void;

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
            this.parent = undefined;
            if (parent.removeChild(this)) {
                if (treeChanged) {
                    treeChanged(parent);
                }
                return true;
            }
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

}

export class TextNode extends BaseNode {

    constructor(text: string, contextValue?: string) {
        super('', text, contextValue ? contextValue : 'textNode', undefined, undefined);
        this.tooltip = `${this.description}`;
    }

}

export class NoItemsNode extends TextNode {

    constructor(subject?: string) {
        super(subject ? vscode.l10n.t('No {0}', subject) : vscode.l10n.t('No items'));
    }

}

export class LoadingNode extends TextNode {

    constructor(subject?: string) {
        super(subject ? vscode.l10n.t('loading {0}...', subject) : vscode.l10n.t('loading...'));
    }

}

export abstract class SymbolNode<T extends symbols.Symbol> extends BaseNode {

    private readonly symbol: T;

    protected constructor(name: string, detail: string | undefined, tooltip: string | undefined, icon: string, context: string, symbol: T) {
        super(name, detail, context, undefined, undefined);
        this.tooltip = tooltip;
        this.iconPath = new vscode.ThemeIcon(icon);
        this.symbol = symbol;
        this.command = {
            title: actions.COMMAND_NAME_GO_TO_DEFINITION,
            command: actions.COMMAND_GO_TO_DEFINITION,
            arguments: [ this ]
        }
    }

    getSymbol(): T {
        return this.symbol;
    }

}

export class BeanNode extends SymbolNode<symbols.Bean> {

    private static readonly CONTEXT = 'extension.micronaut-tools.navigation.BeanNode';
    private static readonly ICON = 'json';

    private constructor(name: string, detail: string | undefined, tooltip: string | undefined, bean: symbols.Bean) {
        super(name, detail, tooltip, BeanNode.ICON, BeanNode.CONTEXT, bean);
    }

    static create(bean: symbols.Bean) {
        const def = bean.def;

        let name = def.substring('@+ \''.length);
        const nameEndIdx = name.indexOf('\'');
        name = name.substring(0, nameEndIdx);

        const tooltip = vscode.workspace.asRelativePath(bean.uri, false);

        return new BeanNode(name, undefined, tooltip, bean);
    }

}

export class EndpointNode extends SymbolNode<symbols.Endpoint> {

    private static readonly CONTEXT = 'extension.micronaut-tools.navigation.EndpointNode';
    private static readonly ICON = 'link';

    private constructor(name: string, detail: string | undefined, tooltip: string | undefined, endpoint: symbols.Endpoint) {
        super(name, detail, tooltip, EndpointNode.ICON, EndpointNode.CONTEXT + endpoint.type, endpoint);
    }

    static create(endpoint: symbols.Endpoint) {
        const tooltip = vscode.workspace.asRelativePath(endpoint.uri, false);
        return new EndpointNode(endpoint.name, endpoint.type, tooltip, endpoint);
    }

}

export class BeansFolderNode extends BaseNode {

    private static readonly CONTEXT = 'extension.micronaut-tools.navigation.FolderNode';
    private static readonly SUBJECT = vscode.l10n.t('beans');

    private readonly folderData: workspaceFolders.FolderData;

    constructor(folder: workspaceFolders.FolderData, treeChanged: TreeChanged) {
        super(folder.getWorkspaceFolder().name, undefined, BeansFolderNode.CONTEXT, [ new LoadingNode(BeansFolderNode.SUBJECT) ], true);
        this.tooltip = folder.getWorkspaceFolder().uri.fsPath;
        this.folderData = folder;
        folder.onUpdated((kind: string[], beans: symbols.Bean[], _endpoints: symbols.Endpoint[]) => {
            if (symbols.isBeanKind(kind)) {
                this.reloadSymbol(beans, treeChanged);
            }
        });
    }

    private reloadSymbol(beans: symbols.Bean[], treeChanged: TreeChanged) {
        const children: BaseNode[] = [];
        for (const bean of beans) {
            const beanNode = BeanNode.create(bean);
            children.push(beanNode);
        }
        if (!children.length) {
            children.push(new NoItemsNode(BeansFolderNode.SUBJECT));
        }
        this.setChildren(children);
        treeChanged(this);
    }

    getFolderData(): workspaceFolders.FolderData {
        return this.folderData;
    }

}

export class EndpointsFolderNode extends BaseNode {

    private static readonly CONTEXT = 'extension.micronaut-tools.navigation.FolderNode';
    private static readonly SUBJECT = vscode.l10n.t('endpoints');

    private readonly folderData: workspaceFolders.FolderData;

    constructor(folder: workspaceFolders.FolderData, treeChanged: TreeChanged) {
        super(folder.getWorkspaceFolder().name, undefined, EndpointsFolderNode.CONTEXT, [ new LoadingNode(EndpointsFolderNode.SUBJECT) ], true);
        this.tooltip = folder.getWorkspaceFolder().uri.fsPath;
        this.folderData = folder;
        folder.onUpdated((kind: string[], _beans: symbols.Bean[], endpoints: symbols.Endpoint[]) => {
            if (symbols.isEndpointKind(kind)) {
                this.reloadSymbol(endpoints, treeChanged);
            }
        });
    }

    private reloadSymbol(endpoints: symbols.Endpoint[], treeChanged: TreeChanged) {
        const children: BaseNode[] = [];
        for (const endpoint of endpoints) {
            const beanNode = EndpointNode.create(endpoint);
            children.push(beanNode);
        }
        if (!children.length) {
            children.push(new NoItemsNode(EndpointsFolderNode.SUBJECT));
        }
        this.setChildren(children);
        treeChanged(this);
    }

    getFolderData(): workspaceFolders.FolderData {
        return this.folderData;
    }

}
