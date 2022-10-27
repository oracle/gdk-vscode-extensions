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
import * as dockerUtils from '../dockerUtils';
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

type ContainerImage = {
    ocid: string,
    displayName: string
}

export function initialize(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.commands.registerCommand('gcn.oci.pullDockerImage', (...params: any[]) => {
        if (params[0]?.pull) {
            (params[0] as ContainerImageNode).pull();
        }
    }));

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
                try {
                    const items = await ociUtils.listContainerRepositories(oci.getProvider(), oci.getCompartment());
                    resolve(items);
                    return;
                } catch (err) {
                    resolve(undefined);
                    dialogs.showErrorMessage('Failed to read container repositories', err);
                    return;
                }
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
    const existingContentChoices: dialogs.QuickPickObject[] = [];
    for (const containerRepository of containerRepositories) {
        existingContentChoices.push(new dialogs.QuickPickObject(`$(${ICON}) ${containerRepository.displayName}`, undefined, undefined, containerRepository));
    }
    dialogs.sortQuickPickObjectsByName(existingContentChoices);
    let existingContentMultiSelect;
    if (existingContentChoices.length > 1) {
        const multiSelectExisting = async (): Promise<ContainerRepository[] | undefined> => {
            const selection = await vscode.window.showQuickPick(existingContentChoices, {
                title: `${ociServices.ADD_ACTION_NAME}: Select Container Repositories`,
                placeHolder: 'Select existing container repositories to add',
                canPickMany: true
            });
            if (selection?.length) {
                const selected: ContainerRepository[] = [];
                for (const sel of selection) {
                    selected.push(sel.object as ContainerRepository);
                }
                return selected;
            } else {
                return undefined;
            }
        };
        existingContentMultiSelect = new dialogs.QuickPickObject('$(arrow-small-right) Add multiple existing container repositories...', undefined, undefined, multiSelectExisting);
    }
    // TODO: provide a possibility to create a new container repository
    // TODO: provide a possibility to select container repositories from different compartments
    const choices: dialogs.QuickPickObject[] = [];
    if (existingContentChoices.length) {
        choices.push(...existingContentChoices);
        if (existingContentMultiSelect) {
            choices.push(existingContentMultiSelect);
        }
    }
    if (choices.length === 0) {
        vscode.window.showWarningMessage('All container repositories already added or no container repositories available.')
    } else {
        const selection = await vscode.window.showQuickPick(choices, {
            title: `${ociServices.ADD_ACTION_NAME}: Select Container Repository`,
            placeHolder: 'Select existing container repository to add'
        })
        if (selection) {
            if (typeof selection.object === 'function') {
                return await selection.object();
            } else {
                return [ selection.object ];
            }
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

class ContainerRepositoryNode extends nodes.AsyncNode implements nodes.RemovableNode, nodes.RenameableNode, nodes.ReloadableNode, ociNodes.CloudConsoleItem, ociNodes.OciResource, dataSupport.DataProducer {

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
        const children: nodes.BaseNode[] = []
        const provider = this.oci.getProvider();
        const compartment = this.oci.getCompartment();
        const repository = this.object.ocid;
        try {
            const images = await ociUtils.listContainerImages(provider, compartment, repository)
            for (const image of images) {
                const ocid = image.id;
                let displayName = image.displayName;
                const unknownVersionIdx = displayName.indexOf(':unknown@');
                if (unknownVersionIdx > -1) {
                    // displayName = displayName.substring(0, unknownVersionIdx);
                    continue;
                }
                const imageObject = {
                    ocid: ocid,
                    displayName: displayName
                }
                children.push(new ContainerImageNode(imageObject, this.oci, image));
            }
        } catch (err) {
            // TODO: notify error (add a nodes.TextNode with error message?)
        }
        if (children.length === 0) {
            children.push(new nodes.NoItemsNode());
        }
        return children;
    }

    getId() {
        return this.object.ocid;
    }

    async getResource(): Promise<artifacts.models.ContainerRepository> {
        return ociUtils.getContainerRepository(this.oci.getProvider(), this.object.ocid);
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

class ContainerImageNode extends nodes.BaseNode implements ociNodes.OciResource {

    static readonly CONTEXT = 'gcn.oci.containerImageNode';

    private object: ContainerImage;
    private oci: ociContext.Context;

    constructor(object: ContainerImage, oci: ociContext.Context, image?: artifacts.models.ContainerImageSummary) {
        super(object.displayName, undefined, ContainerImageNode.CONTEXT, undefined, undefined);
        this.object = object;
        this.oci = oci;
        this.iconPath = new vscode.ThemeIcon(ITEM_ICON);
        this.updateAppearance(image);
    }
    
    updateAppearance(image?: artifacts.models.ContainerImageSummary) {
        if (image) {
            this.description = `(${new Date(image.timeCreated).toLocaleString()})`;
        }
        super.updateAppearance();
    }

    getId() {
        return this.object.ocid;
    }

    async getResource(): Promise<artifacts.models.ContainerImage> {
        return ociUtils.getContainerImage(this.oci.getProvider(), this.object.ocid);
    }

    // NOTE: Doesn't work reliably in the Cloud Console, mostly opens just the Container Registry overview
    // async getAddress(): Promise<string> {
    //     const image = await this.getResource();
    //     return `https://cloud.oracle.com/registry/containers/repos/${image.repositoryId}/images/${this.object.ocid}`;
    // }

    pull() {
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Reading docker image...',
            cancellable: false
        }, async () => {
            try {
                const regionKey = this.oci.getProvider().getRegion().regionCode;
                const namespace = await ociUtils.getObjectStorageNamespace(this.oci.getProvider());
                if (namespace) {
                    const resource = await this.getResource();
                    const repositoryName = resource.repositoryName;
                    const version = resource.version;
                    if (version) {
                        const target = `${regionKey}.ocir.io/${namespace}/${repositoryName}:${version}`; // https://docs.oracle.com/en-us/iaas/Content/Registry/Tasks/registrypullingimagesusingthedockercli.htm
                        return target;
                    } else {
                        return new Error('Failed to resolve docker pull command - unknown image version.');
                    }
                } else {
                    return new Error('Failed to resolve docker pull command - unknown tenancy name.');
                }
            } catch (err) {
                return new Error(dialogs.getErrorMessage('Failed to resolve docker pull command', err));
            }
        }).then(result => {
            if (typeof result === 'string') {
                dockerUtils.pullImage(result as string);
            } else if (result instanceof Error) {
                dialogs.showError(result);
            }
        });
    }

}
