/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as nodes from '../nodes';
import * as dialogs from '../dialogs';
import * as ociContext from './ociContext';
import * as dataSupport from './dataSupport';
import { QuickPickObject } from '../../../common/lib/dialogs';


export abstract class Service implements dataSupport.DataProducer {

    private readonly dataName: string;
    protected readonly folder: vscode.WorkspaceFolder;
    protected readonly oci: ociContext.Context;
    protected settingsData: any | undefined;
    protected itemsData: any | undefined;
    protected dataChanged: dataSupport.DataChanged | undefined;
    protected serviceNodes: nodes.BaseNode[] | undefined;
    protected containerNode: nodes.BaseNode | undefined;
    protected treeChanged: nodes.TreeChanged | undefined;

    constructor(folder: vscode.WorkspaceFolder, oci: ociContext.Context, dataName: string, serviceData: any | undefined, dataChanged: dataSupport.DataChanged) {
        this.folder = folder;
        this.oci = oci;
        this.dataName = dataName;
        this.settingsData = serviceData?.settings;
        this.itemsData = serviceData?.items;
        this.dataChanged = dataChanged;
    }

    getAddContentChoices(): QuickPickObject[] | undefined {
        return undefined;
    }

    getDataName(): string {
        return this.dataName;
    }

    getData(): any | undefined {
        if (this.settingsData || this.itemsData?.length > 0) {
            const data: any = {};
            if (this.settingsData) {
                data.settings = this.settingsData;
            }
            if (this.itemsData?.length > 0) {
                data.items = this.itemsData;
            }
            return data;
        }
        return undefined;
    }

    updateItemsData() {
        if (this.serviceNodes) {
            this.itemsData = [];
            for (const node of this.serviceNodes) {
                const dataProducer = dataSupport.getDataProducer(node);
                const nodeData = dataProducer?.getData();
                if (nodeData) {
                    this.itemsData.push(nodeData);
                }
            }
        } else {
            this.itemsData = undefined;
        }
    }

    buildNodes(treeChanged: nodes.TreeChanged): void {
        this.treeChanged = treeChanged;
        this.serviceNodes = [];
        this.containerNode = this.createContainerNode();
        const items = this.itemsData;
        if (items?.length > 0 && this.dataChanged) {
            this.serviceNodes.push(...this.buildNodesImpl(this.oci, items, this.treeChanged));
        }
        if (this.containerNode) {
            this.containerNode.setChildren(this.serviceNodes);
        }
    }

    protected buildNodesImpl(_oci: ociContext.Context, _itemsData: any[], _treeChanged: nodes.TreeChanged): nodes.BaseNode[] {
        return []; // Implement in subclass
    }

    addServiceNodes(added: nodes.BaseNode | nodes.BaseNode[]) {
        if (added instanceof nodes.BaseNode) {
            added = [ added ];
        }
        if (!this.serviceNodes) {
            this.serviceNodes = [];
            this.containerNode = this.createContainerNode();
        }
        const initiallyEmpty = this.serviceNodes.length === 0;
        this.serviceNodes.push(...added);
        if (this.containerNode) {
            this.containerNode.setChildren(this.serviceNodes);
        }
        this.updateItemsData();
        if (this.dataChanged) {
            this.dataChanged(this);
        }
        if (this.treeChanged) {
            if (this.containerNode && !initiallyEmpty) {
                this.treeChanged(this.containerNode);
            } else {
                this.treeChanged();
            }
        }
    }

    serviceNodesChanged(_changed: nodes.BaseNode | nodes.BaseNode[]) {
        this.updateItemsData();
        if (this.dataChanged) {
            this.dataChanged(this);
        }
    }

    renameServiceNode(node: nodes.BaseNode, caption: string, renameCallback?: (newName: string) => void) {
        const currentName = nodes.getLabel(node);
        const existingNames = this.getItemNames(node);
        dialogs.selectName(caption, currentName, existingNames).then(name => {
            if (name) {
                if (renameCallback) {
                    renameCallback(name);
                }
                node.label = name;
                node.updateAppearance();
                if (this.treeChanged) {
                    this.treeChanged(node);
                }
                this.serviceNodesChanged(node);
            }
        });
    }

    removeServiceNodes(removed: nodes.BaseNode | nodes.BaseNode[]) {
        if (!this.serviceNodes) {
            return;
        }
        if (removed instanceof nodes.BaseNode) {
            removed = [ removed ];
        }
        for (const node of removed) {
            if (this.serviceNodes.length > 1) {
                node.removeFromParent(this.treeChanged);
            }
            const idx = this.serviceNodes.indexOf(node);
            if (idx >= 0) {
                this.serviceNodes.splice(idx, 1);
            }
        }
        this.updateItemsData();
        if (this.dataChanged) {
            this.dataChanged(this); // will trigger treeChanged() in ociServices if last node was removed
        }
    }

    removeAllServiceNodes() {
        this.serviceNodes = [];
        this.containerNode = this.createContainerNode();
        this.updateItemsData();
        if (this.dataChanged) {
            this.dataChanged(this); // will trigger treeChanged() in ociServices
        }
    }

    getNodes(): nodes.BaseNode[] {
        if (!this.serviceNodes || this.serviceNodes.length === 0) return [];
        return this.containerNode ? [ this.containerNode ] : this.serviceNodes;
    }

    protected createContainerNode(): nodes.BaseNode | undefined {
        return undefined;
    }

    // NOTE: intended to be used for node operations (rename)
    //       needs to be computed from itemsData if used before nodes are built
    private getItemNames(skip?: nodes.BaseNode | nodes.BaseNode[]): string[] | undefined {
        if (skip instanceof nodes.BaseNode) {
            skip = [ skip ];
        }
        let names: string[] | undefined;
        if (this.serviceNodes) {
            for (const node of this.serviceNodes) {
                if (!skip || skip.indexOf(node) === -1) {
                    const label = nodes.getLabel(node);
                    if (label) {
                        if (!names) {
                            names = [];
                        }
                        names.push(label);
                    }
                }
            }
        }
        return names;
    }

}
