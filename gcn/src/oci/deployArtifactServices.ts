/*
 * Copyright (c) 2022, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as devops from 'oci-devops';
import * as artifacts from 'oci-artifacts';
import * as nodes from '../nodes';
import * as dialogs from '../dialogs';
import * as ociUtils from './ociUtils';
import * as ociContext from './ociContext';
import * as ociDialogs from './ociDialogs';
import * as ociService from './ociService';
import * as ociServices from './ociServices';
import * as dataSupport from './dataSupport';
import * as artifactServices from './artifactServices';
import * as containerServices from './containerServices';
import * as ociNodes from './ociNodes';
import * as ociFeatures from './ociFeatures';


export const DATA_NAME = 'deployArtifacts';

const ICON = 'layout';

type DeployArtifact = {
    ocid: string,
    displayName: string,
    type: string
}

export function initialize(context: vscode.ExtensionContext): void {
    context.subscriptions.push(vscode.commands.registerCommand('gcn.oci.downloadLatestGenericArtifact', (...params: any[]) => {
        if (params[0]?.download) {
            (params[0] as GenericDeployArtifactNode).download();
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('gcn.oci.pullLatestDockerImage', (...params: any[]) => {
        if (params[0]?.pull) {
            (params[0] as OcirDeployArtifactNode).pull();
        }
    }));

    nodes.registerAddContentNode(DeployArtifactsNode.CONTEXT);
    nodes.registerRemovableNode(DeployArtifactsNode.CONTEXT);
    nodes.registerRenameableNode(GenericDeployArtifactNode.CONTEXT);
    nodes.registerRemovableNode(GenericDeployArtifactNode.CONTEXT);
    ociNodes.registerOpenInConsoleNode(GenericDeployArtifactNode.CONTEXT);
    nodes.registerRenameableNode(OcirDeployArtifactNode.CONTEXT);
    nodes.registerRemovableNode(OcirDeployArtifactNode.CONTEXT);
    ociNodes.registerOpenInConsoleNode(OcirDeployArtifactNode.CONTEXT);
}

export async function importServices(_oci: ociContext.Context, _projectResources: any | undefined, _codeRepositoryResources: any | undefined): Promise<dataSupport.DataProducer | undefined> {
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
                    const items = await ociUtils.listDeployArtifacts(oci.getProvider(), oci.getDevOpsProject());
                    const codeRepoID = oci.getCodeRepository();
                    const projectItems: devops.models.DeployArtifactSummary[] = [];
                    for (const item of items) {
                        if (item.freeformTags?.gcn_tooling_codeRepoID === codeRepoID) {
                            projectItems.push(item);
                        }
                    }
                    resolve(projectItems.length ? projectItems : items);
                    return;
                } catch (err) {
                    resolve(undefined);
                    dialogs.showErrorMessage('Failed to read build artifacts', err);
                    return;
                }
            });
        })
    }
    const deployArtifacts: DeployArtifact[] = [];
    const descriptions: string[] = [];
    const existing = await listDeployArtifacts(oci);
    if (!existing) {
        return;
    }
    let idx = 1;
    for (const item of existing) {
        const type = item.deployArtifactSource.deployArtifactSourceType;
        if (type == devops.models.GenericDeployArtifactSource.deployArtifactSourceType || type === devops.models.OcirDeployArtifactSource.deployArtifactSourceType) {
            if (!shouldIgnore(item.id)) {
                const displayName = item.displayName ? item.displayName : `Build Artifact ${idx++}`;
                const description = item.description ? item.description : 'Build artifact';
                deployArtifacts.push({
                    ocid: item.id,
                    displayName: displayName,
                    type: item.deployArtifactSource.deployArtifactSourceType
                });
                descriptions.push(description);
            }
        }
    }
    const existingContentChoices: dialogs.QuickPickObject[] = [];
    for (let i = 0; i < deployArtifacts.length; i++) {
        const icon = getIconKey(deployArtifacts[i]);
        existingContentChoices.push(new dialogs.QuickPickObject(`$(${icon}) ${deployArtifacts[i].displayName}`, undefined, descriptions[i], deployArtifacts[i]));
    }
    dialogs.sortQuickPickObjectsByName(existingContentChoices);
    let existingContentMultiSelect;
    if (existingContentChoices.length > 1) {
        const multiSelectExisting = async (): Promise<DeployArtifact[] | undefined> => {
            const selection = await vscode.window.showQuickPick(existingContentChoices, {
                title: `${ociServices.ADD_ACTION_NAME}: Select Build Artifacts`,
                placeHolder: 'Select existing build artifacts to add',
                canPickMany: true
            });
            if (selection?.length) {
                const selected: DeployArtifact[] = [];
                for (const sel of selection) {
                    selected.push(sel.object as DeployArtifact);
                }
                return selected;
            } else {
                return undefined;
            }
        };
        existingContentMultiSelect = new dialogs.QuickPickObject('$(arrow-small-right) Add multiple existing build artifacts...', undefined, undefined, multiSelectExisting);
    }
    // TODO: provide a possibility to select build artifacts for different code repository / devops project / compartment
    const choices: dialogs.QuickPickObject[] = [];
    if (existingContentChoices.length) {
        choices.push(...existingContentChoices);
        if (existingContentMultiSelect) {
            choices.push(existingContentMultiSelect);
        }
    }
    if (choices.length === 0) {
        vscode.window.showWarningMessage('All build artifacts already added or no build artifacts available.')
    } else {
        const selection = await vscode.window.showQuickPick(choices, {
            title: `${ociServices.ADD_ACTION_NAME}: Select Build Artifact`,
            placeHolder: 'Select existing build artifact to add'
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

function getIconKey(object: DeployArtifact): string | undefined {
    switch (object.type) {
        case devops.models.GenericDeployArtifactSource.deployArtifactSourceType: {
            return artifactServices.ICON;
        }
        case devops.models.OcirDeployArtifactSource.deployArtifactSourceType: {
            return containerServices.ITEM_ICON;
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
        return ociFeatures.NON_PIPELINE_RESOURCES_ENABLED ? [
            new dialogs.QuickPickObject(`$(${ICON}) Add Build Artifact`, undefined, 'Add existing build artifact', () => this.addContent())
        ] : undefined;
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

abstract class DeployArtifactNode extends nodes.ChangeableNode implements nodes.RemovableNode, nodes.RenameableNode, ociNodes.CloudConsoleItem, ociNodes.OciResource, dataSupport.DataProducer {

    protected object: DeployArtifact;
    protected oci: ociContext.Context;

    constructor(object: DeployArtifact, oci: ociContext.Context, context: string, icon: string, treeChanged: nodes.TreeChanged) {
        super(object.displayName, undefined, context, undefined, undefined, treeChanged);
        this.object = object;
        this.oci = oci;
        this.iconPath = new vscode.ThemeIcon(icon);
        this.updateAppearance();
    }

    getId() {
        return this.object.ocid;
    }

    async getResource(): Promise<devops.models.DeployArtifact> {
        return ociUtils.getDeployArtifact(this.oci.getProvider(), this.object.ocid);
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
        const project = (await this.getResource()).projectId;
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

    download() {
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Reading build artifact...',
            cancellable: false
        }, async (_progress, _token) => {
            try {
                const deployArtifact = await this.getResource();
                const deployArtifactSource = deployArtifact.deployArtifactSource as devops.models.GenericDeployArtifactSource;
                const deployArtifactPath = deployArtifactSource.deployArtifactPath;
                const genericArtifacts = await ociUtils.listGenericArtifacts(this.oci.getProvider(), deployArtifact.compartmentId, deployArtifactSource.repositoryId, deployArtifactPath);
                const artifacts: artifacts.models.GenericArtifactSummary[] = [];
                for (const genericArtifact of genericArtifacts) {
                    if (genericArtifact.artifactPath === deployArtifactPath) {
                        artifacts.push(genericArtifact);
                    }
                }
                if (artifacts.length > 0) {
                    return artifacts[0];
                } else {
                    vscode.window.showWarningMessage('No build artifact available yet.');
                    return undefined;
                }
            } catch (err) {
                return new Error(dialogs.getErrorMessage('Failed to resolve build artifact', err));
            }
        }).then(result => {
            if (result instanceof Error) {
                dialogs.showError(result);
            } else if (result) {
                artifactServices.downloadGenericArtifactContent(this.oci, result.id, this.object.displayName, result.artifactPath, result.sizeInBytes);
            }
        });
    }

}

class OcirDeployArtifactNode extends DeployArtifactNode {

    static readonly DATA_NAME = 'ocirDeployArtifactNode';
    static readonly CONTEXT = `gcn.oci.${OcirDeployArtifactNode.DATA_NAME}`;

    constructor(object: DeployArtifact, oci: ociContext.Context, treeChanged: nodes.TreeChanged) {
        super(object, oci, OcirDeployArtifactNode.CONTEXT, containerServices.ITEM_ICON, treeChanged);
    }

    async getImageUrl(): Promise<string> {
        return new Promise<string>(async (resolve, reject) => {
            try {
                const deployArtifact = await this.getResource();
                const deployArtifactSource = deployArtifact.deployArtifactSource as devops.models.OcirDeployArtifactSource;
                resolve(deployArtifactSource.imageUri);
            } catch (err) {
                reject(dialogs.getErrorMessage('Failed to resolve build artifact', err));
            }
        });
    }

    pull() {
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Reading build artifact...',
            cancellable: false
        }, async (_progress, _token) => {
            try {
                const deployArtifact = await this.getResource();
                const deployArtifactSource = deployArtifact.deployArtifactSource as devops.models.OcirDeployArtifactSource;
                return deployArtifactSource.imageUri;
            } catch (err) {
                return new Error(dialogs.getErrorMessage('Failed to resolve build artifact', err));
            }
        }).then(result => {
            if (typeof result === 'string') {
                ociDialogs.pullImage(this.oci.getProvider(), result, 'Pull Latest Docker Image');
            } else if (result instanceof Error) {
                dialogs.showError(result);
            }
        });
    }

}
