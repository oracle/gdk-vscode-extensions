/*
 * Copyright (c) 2022, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
// import * as devops from 'oci-devops';
import * as nodes from '../nodes';
import * as ociUtils from './ociUtils';
import * as ociContext from './ociContext';
import * as ociServices from './ociServices';

export function createFeaturePlugins(_context: vscode.ExtensionContext): ociServices.ServicePlugin[] {
    // TODO: initialize actions using context
    return [ new ProjectArtifactsPlugin(), new ArtifactRepositoryPlugin() ];
}

class ProjectArtifactsPlugin extends ociServices.ServicePlugin {

    constructor() {
        super('projectArtifacts');
    }

    buildInline(_oci: ociContext.Context, projectArtifacts: any, _treeChanged: nodes.TreeChanged): nodes.BaseNode[] | undefined {
        const items = projectArtifacts.inline;
        if (!items || items.length === 0) {
            return undefined;
        }
        const itemNodes = buildProjectArtifactNodes(items);
        return itemNodes;
    }

    buildContainers(oci: ociContext.Context, projectArtifacts: any, treeChanged: nodes.TreeChanged): nodes.BaseNode[] | undefined {
        const containers = projectArtifacts.containers;
        if (!containers || containers.length === 0) {
            return undefined;
        }
        const containerNodes: nodes.BaseNode[] = [];
        for (const container of containers) {
            const type = container.type;
            if (type === 'project') {
                const displayName = container.displayName;
                const containerNode = new ProjectArtifactsNode(displayName, oci, treeChanged);
                containerNodes.push(containerNode);
            } else if (type === 'custom') {
                const displayName = container.displayName;
                const containerNode = new CustomProjectArtifactsNode(displayName, container.items, treeChanged);
                containerNodes.push(containerNode);
            }
        }
        return containerNodes;
    }

}

export class ArtifactRepositoryPlugin extends ociServices.ServicePlugin {

    constructor() {
        super('artifactRepository');
    }

    buildInline(oci: ociContext.Context, artifactRepository: any, treeChanged: nodes.TreeChanged): nodes.BaseNode[] | undefined {
        const items = artifactRepository.inline;
        if (!items || items.length === 0) {
            return undefined;
        }
        const itemNodes = buildArtifactRepositoryNodes(items, oci, treeChanged);
        return itemNodes;
    }

    buildContainers(oci: ociContext.Context, artifactRepository: any, treeChanged: nodes.TreeChanged): nodes.BaseNode[] | undefined {
        const containers = artifactRepository.containers;
        if (!containers || containers.length === 0) {
            return undefined;
        }
        const containerNodes: nodes.BaseNode[] = [];
        for (const container of containers) {
            const type = container.type;
            if (type === 'compartment') {
                const displayName = container.displayName;
                const containerNode = new CompartmentArtifactRepositoriesNode(displayName, oci, treeChanged);
                containerNodes.push(containerNode);
            } else if (type === 'custom') {
                const displayName = container.displayName;
                const containerNode = new CustomArtifactRepositoriesNode(displayName, container.items, oci, treeChanged);
                containerNodes.push(containerNode);
            }
        }
        return containerNodes;
    }

}

function buildProjectArtifactNodes(items: any): nodes.BaseNode[] {
    const itemNodes: nodes.BaseNode[] = [];
    for (const item of items) {
        const ocid = item.ocid;
        const displayName = item.displayName;
        const buildPipelineNode = new ProjectArtifactNode(ocid, displayName);
        itemNodes.push(buildPipelineNode);
    }
    return itemNodes;
}

function buildArtifactRepositoryNodes(items: any, oci: ociContext.Context, treeChanged: nodes.TreeChanged): nodes.BaseNode[] {
    const itemNodes: nodes.BaseNode[] = [];
    for (const item of items) {
        const ocid = item.ocid;
        const displayName = item.displayName;
        const buildPipelineNode = new ArtifactRepositoryNode(ocid, oci, displayName, treeChanged);
        itemNodes.push(buildPipelineNode);
    }
    return itemNodes;
}

class ProjectArtifactsNode extends nodes.AsyncNode {

    private oci: ociContext.Context;

    constructor(displayName: string | undefined, oci: ociContext.Context, treeChanged: nodes.TreeChanged) {
        super(displayName ? displayName : 'Project Artifacts', undefined, 'gcn.oci.projectArtifactsNode', treeChanged);
        this.oci = oci;
        this.iconPath = new vscode.ThemeIcon('file-binary');
        this.updateAppearance();
    }

    async computeChildren(): Promise<nodes.BaseNode[] | undefined> {
        const provider = this.oci.getProvider();
        const project = this.oci.getDevOpsProject();
        const artifacts = (await ociUtils.listProjectDeployArtifacts(provider, project))?.deployArtifactCollection.items;
        if (artifacts) {
            const children: nodes.BaseNode[] = []
            for (const artifact of artifacts) {
                const ocid = artifact.id;
                const displayName = artifact.displayName ? artifact.displayName : 'Unknown Artifact';
                let description: string | undefined;
                if (artifact.deployArtifactType === 'GENERIC_FILE') {
                    description = '(generic file)';
                } else if (artifact.deployArtifactType === 'DOCKER_IMAGE') {
                    description = '(docker image)';
                }
                children.push(new ProjectArtifactNode(ocid, displayName, description));
                // const artifactType = artifact.deployArtifactType;
                // if (artifactType === devops.models.GenericDeployArtifactSource.deployArtifactSourceType) {
                //     const displayName = (artifact.deployArtifactSource as devops.models.GenericDeployArtifactSource).deployArtifactPath;
                //     const description = artifact.description;
                //     children.push(new ProjectArtifactNode(ocid, displayName, description));
                // } else if (artifactType === devops.models.GenericDeployArtifactSource.deployArtifactSourceType) {
                //     const displayName = (artifact.deployArtifactSource as devops.models.GenericDeployArtifactSource).deployArtifactPath;
                //     const description = artifact.description;
                //     children.push(new ProjectArtifactNode(ocid, displayName, description));
                // }
            }
            return children;
        }
        return [ new nodes.NoItemsNode() ];
    }

}

class CustomProjectArtifactsNode extends nodes.AsyncNode {

    private items: any;

    constructor(displayName: string | undefined, items: any, treeChanged: nodes.TreeChanged) {
        super(displayName ? displayName : 'Project Artifacts', undefined, 'gcn.oci.customProjectArtifactsNode', treeChanged);
        this.items = items;
        this.iconPath = new vscode.ThemeIcon('file-binary');
        this.updateAppearance();
    }

    async computeChildren(): Promise<nodes.BaseNode[] | undefined> {
        if (this.items?.length > 0) {
            const itemNodes = buildProjectArtifactNodes(this.items);
            return itemNodes;
        }
        return [ new nodes.NoItemsNode() ];
    }

}

class CompartmentArtifactRepositoriesNode extends nodes.AsyncNode {

    private oci: ociContext.Context;

    constructor(displayName: string | undefined, oci: ociContext.Context, treeChanged: nodes.TreeChanged) {
        super(displayName ? displayName : 'Artifact Repositories', undefined, 'gcn.oci.compartmentArtifactRepositoriesNode', treeChanged);
        this.oci = oci;
        this.iconPath = new vscode.ThemeIcon('file-binary');
        this.updateAppearance();
    }

    async computeChildren(): Promise<nodes.BaseNode[] | undefined> {
        const provider = this.oci.getProvider();
        const compartment = this.oci.getCompartment();
        const repositories = (await ociUtils.listArtifactRepositories(provider, compartment))?.repositoryCollection.items;
        if (repositories) {
            const children: nodes.BaseNode[] = []
            for (const repository of repositories) {
                const ocid = repository.id;
                const displayName = repository.displayName;
                children.push(new ArtifactRepositoryNode(ocid, this.oci, displayName, this.treeChanged));
            }
            return children;
        }
        return [ new nodes.NoItemsNode() ];
    }
}

class CustomArtifactRepositoriesNode extends nodes.AsyncNode {

    private items: any;
    private oci: ociContext.Context;

    constructor(displayName: string | undefined, items: any, oci: ociContext.Context, treeChanged: nodes.TreeChanged) {
        super(displayName ? displayName : 'Artifact Repositories (Custom)', undefined, 'gcn.oci.customArtifactRepositoriesNode', treeChanged);
        this.items = items;
        this.oci = oci;
        this.iconPath = new vscode.ThemeIcon('file-binary');
        this.updateAppearance();
    }

    async computeChildren(): Promise<nodes.BaseNode[] | undefined> {
        if (this.items?.length > 0) {
            const itemNodes = buildArtifactRepositoryNodes(this.items, this.oci, this.treeChanged);
            return itemNodes;
        }
        return [ new nodes.NoItemsNode() ];
    }
}

class ArtifactRepositoryNode extends nodes.AsyncNode {

    private ocid: string;
    private oci: ociContext.Context;

    constructor(ocid: string, oci: ociContext.Context, displayName: string | undefined, treeChanged: nodes.TreeChanged) {
        super(displayName ? displayName : 'Artifact Repository', undefined, 'gcn.oci.artifactRepositoryNode', treeChanged);
        this.ocid = ocid;
        this.oci = oci;
        this.iconPath = new vscode.ThemeIcon('file-binary');
        this.updateAppearance();
    }

    async computeChildren(): Promise<nodes.BaseNode[] | undefined> {
        const provider = this.oci.getProvider();
        const compartment = this.oci.getCompartment();
        const repository = this.ocid;
        const artifacts = (await ociUtils.listGenericArtifacts(provider, compartment, repository))?.genericArtifactCollection.items;
        if (artifacts) {
            const children: nodes.BaseNode[] = []
            for (const artifact of artifacts) {
                // const ocid = item.id;
                // const displayName = (item.deployArtifactSource as devops.models.GenericDeployArtifactSource).deployArtifactPath;
                // const description = item.description;
                // itemNodes.push(new ServicesProjectArtifactNode(ocid, displayName, description));

                const ocid = artifact.id;
                const displayName = artifact.displayName;
                const artifactNode = new ProjectArtifactNode(ocid, displayName);
                children.push(artifactNode);
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

}

class ProjectArtifactNode extends nodes.BaseNode {

    // private ocid: string;

    constructor(_ocid: string, displayName: string, description?: string, tooltip?: string) {
        super(displayName, undefined, 'gcn.oci.projectArtifactNode', undefined, undefined);
        // this.ocid = ocid;
        this.iconPath = new vscode.ThemeIcon('file-binary');
        this.description = description;
        this.tooltip = tooltip ? `${this.label}: ${tooltip}` : (typeof this.label === 'string' ? this.label as string : (this.label as vscode.TreeItemLabel).label);
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
