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
import * as ociServices from "./ociServices";
import * as dataSupport from './dataSupport';


export const DATA_NAME = 'artifactRepositories';

type ArtifactRepository = {
    ocid: string,
    displayName: string
}

export function initialize(_context: vscode.ExtensionContext): void {
    nodes.registerRenameableNode(ArtifactRepositoryNode.CONTEXT);
    nodes.registerRemovableNode(ArtifactRepositoryNode.CONTEXT);
}

export async function importServices(_oci: ociContext.Context): Promise<dataSupport.DataProducer | undefined> {
    // TODO: Might return populated instance of Service which internally called importServices()
    return undefined;
}

export function create(oci: ociContext.Context, serviceData: any | undefined, dataChanged: dataSupport.DataChanged): ociService.Service {
    return new Service(oci, serviceData, dataChanged);
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
        choices.push(new dialogs.QuickPickObject(artifactRepository.displayName, undefined, undefined, artifactRepository));
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

    constructor(oci: ociContext.Context, serviceData: any | undefined, dataChanged: dataSupport.DataChanged) {
        super(oci, DATA_NAME, serviceData, dataChanged);
    }

    getAddContentChoices(): dialogs.QuickPickObject[] | undefined {
        const addContent = async () => {
            if (this.treeChanged) {
                const displayed = this.itemsData ? this.itemsData as ArtifactRepository[] : [];
                const selected = await selectArtifactRepositories(this.oci, displayed);
                if (selected) {
                    const added: nodes.BaseNode[] = [];
                    for (const pipeline of selected) {
                        added.push(new ArtifactRepositoryNode(pipeline, this.oci, this.treeChanged));
                    }
                    this.addServiceNodes(added);
                    this.treeChanged();
                }
            }
        }
        return [
            new dialogs.QuickPickObject('Add Artifact Repository', undefined, 'Add existing artifact repository', addContent)
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

class ArtifactRepositoryNode extends nodes.AsyncNode implements nodes.RemovableNode, nodes.RenameableNode, dataSupport.DataProducer {

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
        const provider = this.oci.getProvider();
        const compartment = this.oci.getCompartment();
        const repository = this.object.ocid;
        const images = (await ociUtils.listGenericArtifacts(provider, compartment, repository))?.genericArtifactCollection.items;
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
                children.push(new ArtifactImageNode(ocid, displayName, imageDescription));
            }
            return children;
        }
        // const repositories = (await ociUtils.listArtifactRepositories(this.settings.compartment.ocid))?.repositoryCollection.items;
        // if (repositories) {
        //     const children: nodes.BaseNode[] = []
        //     for (const repository of repositories) {
        //         const ocid = repository.id;
        //         const displayName = repository.displayName;
        //         children.push(new ServicesProjectArtifactNode(ocid, displayName));
        //     }
        //     return children;
        // }
        return [ new nodes.NoItemsNode() ];
    }

    rename() {
        const currentName = typeof this.label === 'string' ? this.label as string : (this.label as vscode.TreeItemLabel).label
        vscode.window.showInputBox({
            title: 'Rename Artifact Repository',
            value: currentName
        }).then(name => {
            if (name) {
                this.object.displayName = name;
                this.label = this.object.displayName;
                this.updateAppearance();
                this.treeChanged(this);
                const service = findByNode(this);
                service?.serviceNodesChanged(this)
            }
        });
    }

    remove() {
        const service = findByNode(this);
        this.removeFromParent(this.treeChanged);
        service?.serviceNodesRemoved(this)
    }

    getDataName() {
        return ArtifactRepositoryNode.DATA_NAME;
    }

    getData(): any {
        return this.object;
    }

}

class ArtifactImageNode extends nodes.BaseNode {

    static readonly CONTEXT = 'gcn.oci.artifactImageNode';

    // private ocid: string;

    constructor(_ocid: string, displayName: string, imageDescription?: string) {
        super(displayName, imageDescription, ArtifactImageNode.CONTEXT, undefined, undefined);
        // this.ocid = ocid;
        this.iconPath = new vscode.ThemeIcon('file-binary');
        this.updateAppearance();
    }

}

// class ProjectArtifactNode extends nodes.ChangeableNode implements nodes.RemovableNode, nodes.RenameableNode, dataSupport.DataProducer {

//     static readonly DATA_NAME = 'projectArtifactNode';
//     static readonly CONTEXT = `gcn.oci.${ProjectArtifactNode.DATA_NAME}`;

//     private object: ProjectArtifact;
//     private oci: ociContext.Context;

//     constructor(object: ProjectArtifact, oci: ociContext.Context, treeChanged: nodes.TreeChanged) {
//         super(object.displayName, undefined, ProjectArtifactNode.CONTEXT, undefined, undefined, treeChanged);
//         this.object = object;
//         this.oci = oci;
//         this.iconPath = new vscode.ThemeIcon('file-binary');
//         this.updateAppearance();
//         // this.description = description;
//         // this.tooltip = tooltip ? `${this.label}: ${tooltip}` : (typeof this.label === 'string' ? this.label as string : (this.label as vscode.TreeItemLabel).label);
//     }

//     rename() {
//         const currentName = typeof this.label === 'string' ? this.label as string : (this.label as vscode.TreeItemLabel).label
//         vscode.window.showInputBox({
//             title: 'Rename Project Artifact',
//             value: currentName
//         }).then(name => {
//             if (name) {
//                 this.object.displayName = name;
//                 this.label = this.object.displayName;
//                 this.updateAppearance();
//                 this.treeChanged(this);
//                 const service = findByNode(this);
//                 service?.serviceNodesChanged(this)
//             }
//         });
//     }

//     remove() {
//         const service = findProjectArtifactsServiceByNode(this);
//         this.removeFromParent(this.treeChanged);
//         service?.serviceNodesRemoved(this)
//     }

//     getDataName() {
//         return ProjectArtifactNode.DATA_NAME;
//     }

//     getData(): any {
//         return this.object;
//     }

//     // download() {
//     //     const source = this.object.deployArtifactSource as devops.models.GenericDeployArtifactSource;
//     //     const artifactPath = source.deployArtifactPath;
//     //     ociUtils.getGenericArtifactContent(source.repositoryId, artifactPath, source.deployArtifactVersion).then(content => {
//     //         if (content) {
//     //             vscode.window.showSaveDialog({
//     //                 defaultUri: vscode.Uri.file(artifactPath),
//     //                 title: 'Save Artifact As'
//     //             }).then(fileUri => {
//     //                 if (fileUri) {
//     //                     vscode.window.withProgress({
//     //                         location: vscode.ProgressLocation.Notification,
//     //                         title: `Downloading artifact ${artifactPath}...`,
//     //                         cancellable: false
//     //                       }, (_progress, _token) => {
//     //                           return new Promise(async (resolve) => {
//     //                             const data = content.value;
//     //                             const file = fs.createWriteStream(fileUri.fsPath);
//     //                             data.pipe(file);
//     //                             data.on('end', () => {
//     //                                 const open = 'Open File Location';
//     //                                 vscode.window.showInformationMessage(`Artifact ${artifactPath} downloaded.`, open).then(choice => {
//     //                                     if (choice === open) {
//     //                                         vscode.commands.executeCommand('revealFileInOS', fileUri);
//     //                                     }
//     //                                 });
//     //                                 resolve(true);
//     //                             });
//     //                           });
//     //                       })
//     //                 }
//     //             });
//     //         } else {
//     //             vscode.window.showErrorMessage('Failed to download artifact.');
//     //         }
//     //     });
//     // }

// }
