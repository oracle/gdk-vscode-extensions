/*
 * Copyright (c) 2022, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as nodes from '../nodes';
import * as ociContext from './ociContext';
import * as ociService from './ociService';
import * as ociServices from "./ociServices";
import * as dataSupport from './dataSupport';


export const DATA_NAME = 'deployArtifacts';

type DeployArtifact = {
    ocid: string,
    displayName: string
}

export function initialize(_context: vscode.ExtensionContext): void {
    nodes.registerRenameableNode(DeployArtifactNode.CONTEXT);
    nodes.registerRemovableNode(DeployArtifactNode.CONTEXT);
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

class Service extends ociService.Service {

    constructor(folder: vscode.WorkspaceFolder, oci: ociContext.Context, serviceData: any | undefined, dataChanged: dataSupport.DataChanged) {
        super(folder, oci, DATA_NAME, serviceData, dataChanged);
    }

    // getAddContentChoices(): dialogs.QuickPickObject[] | undefined {
    //     const addContent = async () => {
    //         const choices: dialogs.QuickPickObject[] = [
    //             new dialogs.QuickPickObject('Add Project Build Artifact', undefined, 'Add a single project build artifact defined for the devops project'),
    //             new dialogs.QuickPickObject('Add Project Artifacts Container (All)', undefined, 'Add a container displaying all build artifacts defined for the devops project'),
    //             new dialogs.QuickPickObject('Add Project Artifacts Container (Custom)', undefined, 'Add a container displaying selected build artifacts defined for the devops project')
    //         ];
    //         const selection = await vscode.window.showQuickPick(choices, {
    //             placeHolder: 'Select Build Artifact(s) to Add'
    //         })
    //         if (selection?.object) {
    //             selection.object();
    //         }
    //     }
    //     return [
    //         new dialogs.QuickPickObject('Add Project Build Artifact(s)', undefined, 'Add a single project build artifact or a container displaying multiple project build artifacts', addContent)
    //     ];
    // }

    protected buildNodesImpl(oci: ociContext.Context, itemsData: any[], treeChanged: nodes.TreeChanged): nodes.BaseNode[] {
        const nodes: nodes.BaseNode[] = [];
        for (const itemData of itemsData) {
            const ocid = itemData.ocid;
            const displayName = itemData.displayName;
            if (ocid && displayName) {
                const object: DeployArtifact = {
                    ocid: ocid,
                    displayName: displayName
                }
                nodes.push(new DeployArtifactNode(object, oci, treeChanged));
            }
        }
        return nodes;
    }

}

// TODO: needs to be replaced by artifactServices.ArtifactImageNode and containerServices.ContainerImageNode
class DeployArtifactNode extends nodes.ChangeableNode implements nodes.RemovableNode, nodes.RenameableNode, dataSupport.DataProducer {

    static readonly DATA_NAME = 'deployArtifactNode';
    static readonly CONTEXT = `gcn.oci.${DeployArtifactNode.DATA_NAME}`;

    private object: DeployArtifact;
    // private oci: ociContext.Context;

    constructor(object: DeployArtifact, _oci: ociContext.Context, treeChanged: nodes.TreeChanged) {
        super(object.displayName, undefined, DeployArtifactNode.CONTEXT, undefined, undefined, treeChanged);
        this.object = object;
        // this.oci = oci;
        this.iconPath = new vscode.ThemeIcon('file-binary');
        this.updateAppearance();
        // this.description = description;
        // this.tooltip = tooltip ? `${this.label}: ${tooltip}` : (typeof this.label === 'string' ? this.label as string : (this.label as vscode.TreeItemLabel).label);
    }

    rename() {
        const currentName = typeof this.label === 'string' ? this.label as string : (this.label as vscode.TreeItemLabel).label
        vscode.window.showInputBox({
            title: 'Rename Project Artifact',
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
        return DeployArtifactNode.DATA_NAME;
    }

    getData(): any {
        return this.object;
    }

    // download() {
    //     const source = this.object.deployArtifactSource as devops.models.GenericDeployArtifactSource;
    //     const artifactPath = source.deployArtifactPath;
    //     ociUtils.getGenericArtifactContent(source.repositoryId, artifactPath, source.deployArtifactVersion).then(content => {
    //         if (content) {
    //             vscode.window.showSaveDialog({
    //                 defaultUri: vscode.Uri.file(artifactPath),
    //                 title: 'Save Artifact As'
    //             }).then(fileUri => {
    //                 if (fileUri) {
    //                     vscode.window.withProgress({
    //                         location: vscode.ProgressLocation.Notification,
    //                         title: `Downloading artifact ${artifactPath}...`,
    //                         cancellable: false
    //                       }, (_progress, _token) => {
    //                           return new Promise(async (resolve) => {
    //                             const data = content.value;
    //                             const file = fs.createWriteStream(fileUri.fsPath);
    //                             data.pipe(file);
    //                             data.on('end', () => {
    //                                 const open = 'Open File Location';
    //                                 vscode.window.showInformationMessage(`Artifact ${artifactPath} downloaded.`, open).then(choice => {
    //                                     if (choice === open) {
    //                                         vscode.commands.executeCommand('revealFileInOS', fileUri);
    //                                     }
    //                                 });
    //                                 resolve(true);
    //                             });
    //                           });
    //                       })
    //                 }
    //             });
    //         } else {
    //             vscode.window.showErrorMessage('Failed to download artifact.');
    //         }
    //     });
    // }

}
