/*
 * Copyright (c) 2022, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as artifacts from 'oci-artifacts';
import * as nodes from '../nodes';
import * as dialogs from '../dialogs';
import * as ociUtils from './ociUtils';
import * as ociContext from './ociContext';
import * as ociService from './ociService';
import * as ociServices  from './ociServices';
import * as dataSupport from './dataSupport';
import * as ociNodes from './ociNodes';


export const DATA_NAME = 'containerRepositories';

export const ICON = 'extensions';
export const ITEM_ICON = 'primitive-square';

type ContainerRepository = {
    ocid: string,
    displayName: string
}

export function initialize(_context: vscode.ExtensionContext) {
    nodes.registerRenameableNode(ContainerRepositoryNode.CONTEXT);
    nodes.registerRemovableNode(ContainerRepositoryNode.CONTEXT);
    nodes.registerReloadableNode(ContainerRepositoryNode.CONTEXT);
    ociNodes.registerOpenInConsoleNode(ContainerRepositoryNode.CONTEXT);
}

export async function importServices(_oci: ociContext.Context): Promise<dataSupport.DataProducer | undefined> {
    // TODO: Might return populated instance of Service which internally called importServices()
    return undefined;
}

export function create(folder: vscode.WorkspaceFolder, oci: ociContext.Context, serviceData: any | undefined, dataChanged: dataSupport.DataChanged): ociService.Service {
    return new Service(folder, oci, serviceData, dataChanged);
}

export function findByNode(node: nodes.BaseNode): Service | undefined {
    const services = ociServices.findByNode(node);
    const service = services?.getService(DATA_NAME);
    return service instanceof Service ? service as Service : undefined;
}

async function selectContainerRepositories(oci: ociContext.Context, ignore: ContainerRepository[]): Promise<ContainerRepository[] | undefined> {
    function shouldIgnore(ocid: string) {
        for (const item of ignore) {
            if (item.ocid === ocid) {
                return true;
            }
        }
        return false;
    }
    async function listContainerRepositories(oci: ociContext.Context): Promise<artifacts.models.ContainerRepositorySummary[] | undefined> {
        // TODO: display the progress in QuickPick
        return await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Reading compartment container repositories...',
            cancellable: false
        }, (_progress, _token) => {
            return new Promise(async (resolve) => {
                resolve((await ociUtils.listContainerRepositories(oci.getProvider(), oci.getCompartment()))?.containerRepositoryCollection.items);
            });
        })
    }
    const containerRepositories: ContainerRepository[] = [];
    const existing = await listContainerRepositories(oci);
    if (existing) {
        let idx = 1;
        for (const item of existing) {
            if (!shouldIgnore(item.id)) {
                const displayName = item.displayName ? item.displayName : `Container Repository ${idx++}`;
                containerRepositories.push({
                    ocid: item.id,
                    displayName: displayName
                });
            }
        }
    }
    const choices: dialogs.QuickPickObject[] = [];
    for (const containerRepository of containerRepositories) {
        choices.push(new dialogs.QuickPickObject(`$(${ICON}) ${containerRepository.displayName}`, undefined, undefined, containerRepository));
    }
    // TODO: provide a possibility to create a new container repository
    // TODO: provide a possibility to select container repositories from different compartments
    if (choices.length === 0) {
        vscode.window.showWarningMessage('All container repositories already added or no container repositories available.')
    } else {
        const selection = await vscode.window.showQuickPick(choices, {
            placeHolder: 'Select Container Repository(s) to Add',
            canPickMany: true
        })
        if (selection && selection.length > 0) {
            const selected: ContainerRepository[] = [];
            for (const sel of selection) {
                selected.push(sel.object as ContainerRepository);
            }
            return selected;
        }
    }
    return undefined;
}

class Service extends ociService.Service {

    constructor(folder: vscode.WorkspaceFolder, oci: ociContext.Context, serviceData: any | undefined, dataChanged: dataSupport.DataChanged) {
        super(folder, oci, DATA_NAME, serviceData, dataChanged);
    }

    async addContent() {
        if (this.treeChanged) {
            const displayed = this.itemsData ? this.itemsData as ContainerRepository[] : [];
            const selected = await selectContainerRepositories(this.oci, displayed);
            if (selected) {
                const added: nodes.BaseNode[] = [];
                for (const pipeline of selected) {
                    added.push(new ContainerRepositoryNode(pipeline, this.oci, this.treeChanged));
                }
                this.addServiceNodes(added);
            }
        }
    }

    getAddContentChoices(): dialogs.QuickPickObject[] | undefined {
        return [
            new dialogs.QuickPickObject(`$(${ICON}) Add Container Repository`, undefined, 'Add existing container repository', () => this.addContent())
        ];
    }

    protected buildNodesImpl(oci: ociContext.Context, itemsData: any[], treeChanged: nodes.TreeChanged): nodes.BaseNode[] {
        const nodes: nodes.BaseNode[] = [];
        for (const itemData of itemsData) {
            const ocid = itemData.ocid;
            const displayName = itemData.displayName;
            if (ocid && displayName) {
                const object: ContainerRepository = {
                    ocid: ocid,
                    displayName: displayName
                }
                nodes.push(new ContainerRepositoryNode(object, oci, treeChanged));
            }
        }
        return nodes;
    }

}

class ContainerRepositoryNode extends nodes.AsyncNode implements nodes.RemovableNode, nodes.RenameableNode, nodes.ReloadableNode, ociNodes.CloudConsoleItem, dataSupport.DataProducer {

    static readonly DATA_NAME = 'containerRepositoryNode';
    static readonly CONTEXT = `gcn.oci.${ContainerRepositoryNode.DATA_NAME}`;

    private object: ContainerRepository;
    private oci: ociContext.Context;

    constructor(object: ContainerRepository, oci: ociContext.Context, treeChanged: nodes.TreeChanged) {
        super(object.displayName, undefined, ContainerRepositoryNode.CONTEXT, treeChanged);
        this.object = object;
        this.oci = oci;
        this.iconPath = new vscode.ThemeIcon(ICON);
        this.updateAppearance();
    }

    async computeChildren(): Promise<nodes.BaseNode[] | undefined> {
        const provider = this.oci.getProvider();
        const compartment = this.oci.getCompartment();
        const repository = this.object.ocid;
        const images = (await ociUtils.listContainerImages(provider, compartment, repository))?.containerImageCollection.items;
        if (images) {
            const children: nodes.BaseNode[] = []
            for (const image of images) {
                const ocid = image.id;
                let displayName = image.displayName;
                const unknownVersionIdx = displayName.indexOf(':unknown@');
                if (unknownVersionIdx > -1) {
                    // displayName = displayName.substring(0, unknownVersionIdx);
                    continue;
                }
                const imageDescription = `(${new Date(image.timeCreated).toLocaleString()})`;
                children.push(new ContainerImageNode(ocid, displayName, imageDescription));
            }
            return children;
        }
        return [ new nodes.NoItemsNode() ];
    }

    rename() {
        const service = findByNode(this);
        service?.renameServiceNode(this, 'Rename Container Repository', name => this.object.displayName = name);
    }

    remove() {
        const service = findByNode(this);
        service?.removeServiceNodes(this);
    }

    getAddress(): string {
        return `https://cloud.oracle.com/registry/containers/repos/${this.object.ocid}`;
    }

    getDataName() {
        return ContainerRepositoryNode.DATA_NAME;
    }

    getData(): any {
        return this.object;
    }

}

class ContainerImageNode extends nodes.BaseNode {

    static readonly CONTEXT = 'gcn.oci.containerImageNode';

    // private ocid: string;

    constructor(_ocid: string, displayName: string, imageDescription?: string) {
        super(displayName, imageDescription, ContainerImageNode.CONTEXT, undefined, undefined);
        // this.ocid = ocid;
        this.iconPath = new vscode.ThemeIcon(ITEM_ICON);
        this.updateAppearance();
    }

}
