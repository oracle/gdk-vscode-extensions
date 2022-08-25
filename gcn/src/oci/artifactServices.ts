/*
 * Copyright (c) 2022, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as artifacts from 'oci-artifacts';
import * as nodes from '../nodes';
import * as dialogs from '../dialogs';
import * as ociUtils from './ociUtils';
import * as ociContext from './ociContext';
import * as ociService from './ociService';
import * as ociServices from './ociServices';
import * as dataSupport from './dataSupport';
import * as ociNodes from './ociNodes';


export const DATA_NAME = 'artifactRepositories';

export const ICON = 'file-binary';

type ArtifactRepository = {
    ocid: string,
    displayName: string
}

type GenericArtifact = {
    ocid: string,
    displayName: string
}

export function initialize(context: vscode.ExtensionContext): void {
    context.subscriptions.push(vscode.commands.registerCommand('gcn.oci.downloadGenericArtifact', (...params: any[]) => {
        if (params[0]) {
            (params[0] as GenericArtifactNode).download();
        }
    }));

    nodes.registerRenameableNode(ArtifactRepositoryNode.CONTEXT);
    nodes.registerRemovableNode(ArtifactRepositoryNode.CONTEXT);
    nodes.registerReloadableNode(ArtifactRepositoryNode.CONTEXT);
    ociNodes.registerOpenInConsoleNode(ArtifactRepositoryNode.CONTEXT);
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

async function selectArtifactRepositories(oci: ociContext.Context, ignore: ArtifactRepository[]): Promise<ArtifactRepository[] | undefined> {
    function shouldIgnore(ocid: string) {
        for (const item of ignore) {
            if (item.ocid === ocid) {
                return true;
            }
        }
        return false;
    }
    async function listArtifactRepositories(oci: ociContext.Context): Promise<artifacts.models.RepositorySummary[] | undefined> {
        // TODO: display the progress in QuickPick
        return await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Reading compartment artifact repositories...',
            cancellable: false
        }, (_progress, _token) => {
            return new Promise(async (resolve) => {
                resolve((await ociUtils.listArtifactRepositories(oci.getProvider(), oci.getCompartment()))?.repositoryCollection.items);
            });
        })
    }
    const artifactRepositories: ArtifactRepository[] = [];
    const existing = await listArtifactRepositories(oci);
    if (existing) {
        let idx = 1;
        for (const item of existing) {
            if (!shouldIgnore(item.id)) {
                const displayName = item.displayName ? item.displayName : `Artifact Repository ${idx++}`;
                artifactRepositories.push({
                    ocid: item.id,
                    displayName: displayName
                });
            }
        }
    }
    const choices: dialogs.QuickPickObject[] = [];
    for (const artifactRepository of artifactRepositories) {
        choices.push(new dialogs.QuickPickObject(`$(${ICON}) ${artifactRepository.displayName}`, undefined, undefined, artifactRepository));
    }
    // TODO: provide a possibility to create a new artifact repository
    // TODO: provide a possibility to select artifact repositories from different compartments
    if (choices.length === 0) {
        vscode.window.showWarningMessage('All container repositories already added or no container repositories available.')
    } else {
        const selection = await vscode.window.showQuickPick(choices, {
            placeHolder: 'Select Artifact Repository(s) to Add',
            canPickMany: true
        })
        if (selection && selection.length > 0) {
            const selected: ArtifactRepository[] = [];
            for (const sel of selection) {
                selected.push(sel.object as ArtifactRepository);
            }
            return selected;
        }
    }
    return undefined;
}

export class Service extends ociService.Service {

    constructor(folder: vscode.WorkspaceFolder, oci: ociContext.Context, serviceData: any | undefined, dataChanged: dataSupport.DataChanged) {
        super(folder, oci, DATA_NAME, serviceData, dataChanged);
    }

    async addContent() {
        if (this.treeChanged) {
            const displayed = this.itemsData ? this.itemsData as ArtifactRepository[] : [];
            const selected = await selectArtifactRepositories(this.oci, displayed);
            if (selected) {
                const added: nodes.BaseNode[] = [];
                for (const object of selected) {
                    added.push(new ArtifactRepositoryNode(object, this.oci, this.treeChanged));
                }
                this.addServiceNodes(added);
            }
        }
    }

    getAddContentChoices(): dialogs.QuickPickObject[] | undefined {
        return [
            new dialogs.QuickPickObject(`$(${ICON}) Add Artifact Repository`, undefined, 'Add existing artifact repository', () => this.addContent())
        ];
    }

    protected buildNodesImpl(oci: ociContext.Context, itemsData: any[], treeChanged: nodes.TreeChanged): nodes.BaseNode[] {
        const nodes: nodes.BaseNode[] = [];
        for (const itemData of itemsData) {
            const ocid = itemData.ocid;
            const displayName = itemData.displayName;
            if (ocid && displayName) {
                const object: ArtifactRepository = {
                    ocid: ocid,
                    displayName: displayName
                }
                nodes.push(new ArtifactRepositoryNode(object, oci, treeChanged));
            }
        }
        return nodes;
    }

}

class ArtifactRepositoryNode extends nodes.AsyncNode implements nodes.RemovableNode, nodes.RenameableNode, nodes.ReloadableNode, ociNodes.CloudConsoleItem, ociNodes.OciResource, dataSupport.DataProducer {

    static readonly DATA_NAME = 'artifactRepositoryNode';
    static readonly CONTEXT = `gcn.oci.${ArtifactRepositoryNode.DATA_NAME}`;

    private object: ArtifactRepository;
    private oci: ociContext.Context;

    constructor(object: ArtifactRepository, oci: ociContext.Context, treeChanged: nodes.TreeChanged) {
        super(object.displayName, undefined, ArtifactRepositoryNode.CONTEXT, treeChanged);
        this.object = object;
        this.oci = oci;
        this.iconPath = new vscode.ThemeIcon('file-binary');
        this.updateAppearance();
    }

    async computeChildren(): Promise<nodes.BaseNode[] | undefined> {
        const children: nodes.BaseNode[] = []
        const provider = this.oci.getProvider();
        const compartment = this.oci.getCompartment();
        const repository = this.object.ocid;
        try {
            const artifacts = (await ociUtils.listGenericArtifacts(provider, compartment, repository)).genericArtifactCollection.items;
            for (const artifact of artifacts) {
                const ocid = artifact.id;
                let displayName = artifact.displayName;
                const unknownVersionIdx = displayName.indexOf(':unknown@');
                if (unknownVersionIdx > -1) {
                    // displayName = displayName.substring(0, unknownVersionIdx);
                    continue;
                }
                const artifactObject = {
                    ocid: ocid,
                    displayName: displayName
                }
                children.push(new GenericArtifactNode(artifactObject, this.oci, artifact));
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

    async getResource(): Promise<artifacts.models.Repository> {
        return (await ociUtils.getArtifactRepository(this.oci.getProvider(), this.object.ocid)).repository;
    }

    rename() {
        const service = findByNode(this);
        service?.renameServiceNode(this, 'Rename Artifact Repository', name => this.object.displayName = name);
    }

    remove() {
        const service = findByNode(this);
        service?.removeServiceNodes(this);
    }

    getAddress(): string {
        return `https://cloud.oracle.com/registry/artifacts/${this.object.ocid}`;
    }

    getDataName() {
        return ArtifactRepositoryNode.DATA_NAME;
    }

    getData(): any {
        return this.object;
    }

}

class GenericArtifactNode extends nodes.BaseNode implements ociNodes.OciResource {

    static readonly CONTEXT = 'gcn.oci.genericArtifactNode';

    private object: ArtifactRepository;
    private oci: ociContext.Context;

    constructor(object: GenericArtifact, oci: ociContext.Context, artifact?: artifacts.models.GenericArtifactSummary) {
        super(object.displayName, undefined, GenericArtifactNode.CONTEXT, undefined, undefined);
        this.object = object;
        this.oci = oci;
        this.iconPath = new vscode.ThemeIcon(ICON);
        this.updateAppearance(artifact);
    }

    updateAppearance(artifact?: artifacts.models.GenericArtifactSummary) {
        if (artifact) {
            this.description = `(${new Date(artifact.timeCreated).toLocaleString()})`;
            this.tooltip = `Size: ${artifact.sizeInBytes.toLocaleString()} B`;
        } else {
            super.updateAppearance();
        }
    }

    getId() {
        return this.object.ocid;
    }

    async getResource(): Promise<artifacts.models.GenericArtifact> {
        return (await ociUtils.getGenericArtifact(this.oci.getProvider(), this.object.ocid)).genericArtifact;
    }

    download() {
        let filename = this.object.displayName;
        // TODO: separate artifact name and version
        const versionSeparatorIdx = filename.indexOf(':');
        if (versionSeparatorIdx > 0) {
            filename = filename.substring(0, versionSeparatorIdx);
        }
        downloadGenericArtifactContent(this.oci, this.object.ocid, this.object.displayName, filename);
    }
}

export function downloadGenericArtifactContent(oci: ociContext.Context, artifactID: string, displayName: string, filename: string) {
    vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Reading build artifact content...',
        cancellable: false
    }, async (_progress, _token) => {
        try {
            return await ociUtils.getGenericArtifactContent(oci.getProvider(), artifactID);
        } catch (err) {
            if ((err as any).message) {
                return new Error(`Failed to resolve build artifact content: ${(err as any).message}`);
            } else {
                return new Error('Failed to resolve build artifact content');
            }
        }
    }).then(result => {
        if (result instanceof Error) {
            vscode.window.showErrorMessage(result.message);
        } else {
            vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file(filename),
                title: 'Save Artifact As'
            }).then(fileUri => {
                if (fileUri) {
                    vscode.window.withProgress({
                        location: vscode.ProgressLocation.Notification,
                        title: `Downloading artifact ${displayName}...`,
                        cancellable: false
                    }, (_progress, _token) => {
                        return new Promise(async (resolve) => {
                            const data = result.value;
                            const file = fs.createWriteStream(fileUri.fsPath);
                            data.pipe(file);
                            data.on('error', (err: Error) => {
                                vscode.window.showErrorMessage(err.message);
                                file.destroy();
                                resolve(false);
                            });
                            data.on('end', () => {
                                const open = 'Open File Location';
                                vscode.window.showInformationMessage(`Artifact ${displayName} downloaded.`, open).then(choice => {
                                    if (choice === open) {
                                        vscode.commands.executeCommand('revealFileInOS', fileUri);
                                    }
                                });
                                resolve(true);
                            });
                        });
                    })
                }
            });
        }
    })
}
