/*
 * Copyright (c) 2022, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as nodes from '../nodes';
import * as dialogs from '../dialogs';
import * as ociContext from './ociContext';
import * as dataSupport from './dataSupport';


export abstract class Service implements dataSupport.DataProducer {

    private readonly dataName: string;
    protected readonly folder: vscode.WorkspaceFolder;
    protected readonly oci: ociContext.Context;
    protected settingsData: any | undefined;
    protected itemsData: any | undefined;
    protected dataChanged: dataSupport.DataChanged | undefined;
    protected serviceNodes: nodes.BaseNode[] | undefined;
    protected treeChanged: nodes.TreeChanged | undefined;

    constructor(folder: vscode.WorkspaceFolder, oci: ociContext.Context, dataName: string, serviceData: any | undefined, dataChanged: dataSupport.DataChanged) {
        this.folder = folder;
        this.oci = oci;
        this.dataName = dataName;
        this.settingsData = serviceData?.settings;
        this.itemsData = serviceData?.items;
        this.dataChanged = dataChanged;
    }

    getAddContentChoices(): dialogs.QuickPickObject[] | undefined {
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
        const items = this.itemsData;
        if (items?.length > 0 && this.dataChanged) {
            this.serviceNodes.push(...this.buildNodesImpl(this.oci, items, this.treeChanged));
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
        }
        this.serviceNodes.push(...added);
        this.updateItemsData();
        if (this.dataChanged) {
            this.dataChanged(this);
        }
    }

    serviceNodesChanged(_changed: nodes.BaseNode | nodes.BaseNode[]) {
        this.updateItemsData();
        if (this.dataChanged) {
            this.dataChanged(this);
        }
    }

    serviceNodesRemoved(removed: nodes.BaseNode | nodes.BaseNode[]) {
        if (removed instanceof nodes.BaseNode) {
            removed = [ removed ];
        }
        for (const node of removed) {
            const idx = this.serviceNodes?.indexOf(node);
            if (idx !== undefined && idx >= 0) {
                this.serviceNodes?.splice(idx, 1);
            }
        }
        this.updateItemsData();
        if (this.dataChanged) {
            this.dataChanged(this);
        }
    }

    getNodes(): nodes.BaseNode[] {
        return this.serviceNodes ? this.serviceNodes : [];
    }

    // NOTE: intended to be used for node operations (rename)
    //       needs to be computed from itemsData if used before nodes are built
    getItemNames(skip?: nodes.BaseNode | nodes.BaseNode[]): string[] | undefined {
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
