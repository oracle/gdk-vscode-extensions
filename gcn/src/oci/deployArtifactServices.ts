/*
 * Copyright (c) 2022, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as devops from 'oci-devops';
import * as nodes from '../nodes';
import * as dialogs from '../dialogs';
import * as ociUtils from './ociUtils';
import * as ociContext from './ociContext';
import * as ociService from './ociService';
import * as ociServices from './ociServices';
import * as dataSupport from './dataSupport';
import * as artifactServices from './artifactServices';
import * as containerServices from './containerServices';
import * as ociNodes from './ociNodes';


export const DATA_NAME = 'deployArtifacts';

const ICON = 'layout';

type DeployArtifact = {
    ocid: string,
    displayName: string,
    type: string
}

export function initialize(_context: vscode.ExtensionContext): void {
    nodes.registerAddContentNode(DeployArtifactsNode.CONTEXT);
    nodes.registerRemovableNode(DeployArtifactsNode.CONTEXT);
    nodes.registerRenameableNode(GenericDeployArtifactNode.CONTEXT);
    nodes.registerRemovableNode(GenericDeployArtifactNode.CONTEXT);
    ociNodes.registerOpenInConsoleNode(GenericDeployArtifactNode.CONTEXT);
    nodes.registerRenameableNode(OcirDeployArtifactNode.CONTEXT);
    nodes.registerRemovableNode(OcirDeployArtifactNode.CONTEXT);
    ociNodes.registerOpenInConsoleNode(OcirDeployArtifactNode.CONTEXT);
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

async function selectDeployArtifacts(oci: ociContext.Context, ignore: DeployArtifact[]): Promise<DeployArtifact[] | undefined> {
    function shouldIgnore(ocid: string) {
        for (const item of ignore) {
            if (item.ocid === ocid) {
                return true;
            }
        }
        return false;
    }
    async function listDeployArtifacts(oci: ociContext.Context): Promise<devops.models.DeployArtifactSummary[] | undefined> {
        // TODO: display the progress in QuickPick
        return await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Reading build artifacts...',
            cancellable: false
        }, (_progress, _token) => {
            return new Promise(async(resolve) => {
                try {
                    // TODO: should list deploy artifacts per source repository
                    const artifacts = (await ociUtils.listDeployArtifacts(oci.getProvider(), oci.getDevOpsProject()))?.deployArtifactCollection.items;
                    resolve(artifacts);
                    return;
                } catch (err: any) {
                    resolve(undefined);
                    let msg = 'Failed to read build artifacts';
                    if (err.message) {
                        msg += `: ${err.message}`;
                    } else {
                        msg += '.';
                    }
                    vscode.window.showErrorMessage(msg);
                    return;
                }
            });
        })
    }
    const deployArtifacts: DeployArtifact[] = [];
    const existing = await listDeployArtifacts(oci);
    if (!existing) {
        return;
    }
    let idx = 1;
    for (const item of existing) {
        if (!shouldIgnore(item.id)) {
            const displayName = item.displayName ? item.displayName : `Build Artifact ${idx++}`;
            deployArtifacts.push({
                ocid: item.id,
                displayName: displayName,
                type: item.deployArtifactSource.deployArtifactSourceType
            });
        }
    }
    const choices: dialogs.QuickPickObject[] = [];
    for (const deployArtifact of deployArtifacts) {
        const icon = getIconKey(deployArtifact);
        if (icon) {
            choices.push(new dialogs.QuickPickObject(`$(${icon}) ${deployArtifact.displayName}`, undefined, undefined, deployArtifact));
        }
    }
    // TODO: provide a possibility to select build artifacts for different code repository / devops project / compartment
    if (choices.length === 0) {
        vscode.window.showWarningMessage('All build artifacts already added or no build artifacts available.')
    } else {
        const selection = await vscode.window.showQuickPick(choices, {
            placeHolder: 'Select Build Artifact(s) to Add',
            canPickMany: true
        })
        if (selection && selection.length > 0) {
            const selected: DeployArtifact[] = [];
            for (const sel of selection) {
                selected.push(sel.object as DeployArtifact);
            }
            return selected;
        }
    }
    return undefined;
}

function getIconKey(object: DeployArtifact): string | undefined {
    switch (object.type) {
        case devops.models.GenericDeployArtifactSource.deployArtifactSourceType: {
            return artifactServices.ICON;
        }
        case devops.models.OcirDeployArtifactSource.deployArtifactSourceType: {
            return containerServices.ICON;
        }
        default: {
            // TODO: missing support for devops.models.InlineDeployArtifactSource and devops.models.HelmRepositoryDeployArtifactSource
            return undefined
        }
    }
}

function createNode(object: DeployArtifact, oci: ociContext.Context, treeChanged: nodes.TreeChanged): nodes.BaseNode | undefined {
    switch (object.type) {
        case devops.models.GenericDeployArtifactSource.deployArtifactSourceType: {
            return new GenericDeployArtifactNode(object, oci, treeChanged);
        }
        case devops.models.OcirDeployArtifactSource.deployArtifactSourceType: {
            return new OcirDeployArtifactNode(object, oci, treeChanged);
        }
        default: {
            // TODO: missing support for devops.models.InlineDeployArtifactSource and devops.models.HelmRepositoryDeployArtifactSource
            return undefined
        }
    }
}

class Service extends ociService.Service {

    constructor(folder: vscode.WorkspaceFolder, oci: ociContext.Context, serviceData: any | undefined, dataChanged: dataSupport.DataChanged) {
        super(folder, oci, DATA_NAME, serviceData, dataChanged);
    }
    
    async addContent() {
        if (this.treeChanged) {
            const displayed = this.itemsData ? this.itemsData as DeployArtifact[] : [];
            const selected = await selectDeployArtifacts(this.oci, displayed);
            if (selected) {
                const added: nodes.BaseNode[] = [];
                for (const object of selected) {
                    const node = createNode(object, this.oci, this.treeChanged);
                    if (node) {
                        added.push(node);
                    }
                }
                this.addServiceNodes(added);
            }
        }
    }

    getAddContentChoices(): dialogs.QuickPickObject[] | undefined {
        return [
            new dialogs.QuickPickObject(`$(${ICON}) Add Build Artifact`, undefined, 'Add existing build artifact', () => this.addContent())
        ];
    }

    protected buildNodesImpl(oci: ociContext.Context, itemsData: any[], treeChanged: nodes.TreeChanged): nodes.BaseNode[] {
        const nodes: nodes.BaseNode[] = [];
        for (const itemData of itemsData) {
            const ocid = itemData.ocid;
            const displayName = itemData.displayName;
            const type = itemData.type;
            if (ocid && displayName && type) {
                const object: DeployArtifact = {
                    ocid: ocid,
                    displayName: displayName,
                    type: type
                }
                const node = createNode(object, oci, treeChanged);
                if (node) {
                    nodes.push(node);
                }
            }
        }
        return nodes;
    }

    protected createContainerNode(): nodes.BaseNode | undefined {
        return new DeployArtifactsNode();
    }

}

class DeployArtifactsNode extends nodes.BaseNode implements nodes.AddContentNode, nodes.RemovableNode {

    static readonly CONTEXT = 'gcn.oci.DeployArtifactsNode';

    constructor() {
        super('Build Artifacts', undefined, DeployArtifactsNode.CONTEXT, [], false);
        this.iconPath = new vscode.ThemeIcon(ICON);
        this.updateAppearance();
    }

    addContent() {
        const service = findByNode(this);
        service?.addContent();
    }

    remove() {
        const service = findByNode(this);
        service?.removeAllServiceNodes();
    }

}

abstract class DeployArtifactNode extends nodes.ChangeableNode implements nodes.RemovableNode, nodes.RenameableNode, ociNodes.CloudConsoleItem, dataSupport.DataProducer {

    protected object: DeployArtifact;
    private oci: ociContext.Context;

    constructor(object: DeployArtifact, oci: ociContext.Context, context: string, icon: string, treeChanged: nodes.TreeChanged) {
        super(object.displayName, undefined, context, undefined, undefined, treeChanged);
        this.object = object;
        this.oci = oci;
        this.iconPath = new vscode.ThemeIcon(icon);
        this.updateAppearance();
    }

    rename() {
        const service = findByNode(this);
        service?.renameServiceNode(this, 'Rename Build Artifact', name => this.object.displayName = name);
    }

    remove() {
        const service = findByNode(this);
        service?.removeServiceNodes(this);
    }

    async getAddress(): Promise<string> {
        const project = (await ociUtils.getDeployArtifact(this.oci.getProvider(), this.object.ocid)).deployArtifact.id;
        return `https://cloud.oracle.com/devops-deployment/projects/${project}/artifacts/${this.object.ocid}`;
    }

    getDataName() {
        return GenericDeployArtifactNode.DATA_NAME;
    }

    getData(): any {
        return this.object;
    }

}

class GenericDeployArtifactNode extends DeployArtifactNode {

    static readonly DATA_NAME = 'genericDeployArtifactNode';
    static readonly CONTEXT = `gcn.oci.${GenericDeployArtifactNode.DATA_NAME}`;

    constructor(object: DeployArtifact, oci: ociContext.Context, treeChanged: nodes.TreeChanged) {
        super(object, oci, GenericDeployArtifactNode.CONTEXT, artifactServices.ICON, treeChanged);
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

class OcirDeployArtifactNode extends DeployArtifactNode {

    static readonly DATA_NAME = 'ocirDeployArtifactNode';
    static readonly CONTEXT = `gcn.oci.${OcirDeployArtifactNode.DATA_NAME}`;

    constructor(object: DeployArtifact, oci: ociContext.Context, treeChanged: nodes.TreeChanged) {
        super(object, oci, GenericDeployArtifactNode.CONTEXT, containerServices.ITEM_ICON, treeChanged);
    }

}
