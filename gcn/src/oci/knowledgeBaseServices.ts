/*
 * Copyright (c) 2022, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as nodes from '../nodes';
import * as ociUtils from './ociUtils';
import * as ociContext from './ociContext';
import * as ociServices from './ociServices';
import * as ociSupport from './ociSupport';

const audits : Map<vscode.WorkspaceFolder, ProjectAudit> = new Map();

export let auditService : ProjectAudit | undefined = undefined;

export interface ProjectAudit {
    
}

export function createFeaturePlugins(context: vscode.ExtensionContext): ociServices.ServicePlugin[] {
    const p : Plugin = new Plugin();
    // TODO: initialize actions using context

    context.subscriptions.push(vscode.commands.registerCommand('gcn.projectAudit.execute', (...args) => {
        let uri = undefined;

        if (args.length > 0) {
            uri = args[0]?.uri;
        }
        return uri ? p.executeProjectAudit(uri) : false;
    }));

    return [ p ];
}

interface AuditConfiguration {
    sourceKnowledgeBase? : string;
}

class Plugin extends ociServices.ServicePlugin implements ProjectAudit {
    // private _folder : vscode.WorkspaceFolder | undefined;
    private config : AuditConfiguration = {}
    private folder : vscode.WorkspaceFolder | undefined;
    
    constructor() {
        super('knowledgeBases');
        auditService = this;
    }

    async executeProjectAudit(uri : string) {
        if (!(await vscode.commands.getCommands(true)).includes('nbls.gcn.projectAudit.execute')) {
            vscode.window.showErrorMessage('Required Language Server is not ready.');
            return;
        }

        if (!this.config?.sourceKnowledgeBase) {
            vscode.window.showErrorMessage(`No KnowledgeBase bound for ${uri}.`);
            return;
        }
        
        const context = ociSupport.findOciConfiguration(vscode.workspace.getWorkspaceFolder(vscode.Uri.parse(uri)))
        if (!context) {
            vscode.window.showErrorMessage(`No OCI context configured for ${uri}.`);
            return;
        }

        return vscode.commands.executeCommand('nbls.gcn.projectAudit.execute', uri, 
            this.config.sourceKnowledgeBase, 
            context.getCompartment(), 
            context.getDevOpsProject()
        )
    }

    displayProjectAudit() {
        if (!this.config.sourceKnowledgeBase || !this.folder) {
            return;
        }
        const ctx = ociSupport.findOciConfiguration(this.folder);
        if (ctx) {
            vscode.commands.executeCommand('nbls.gcn.projectAudit.display', this.folder.uri, this.config.sourceKnowledgeBase, 
                ctx.getCompartment(), ctx.getDevOpsProject());
        }
    }

    tryDisplayProjectAudit(attempt : number) {
        vscode.commands.getCommands().then(cmds => {
            if (cmds.includes('nbls.gcn.projectAudit.display')) {
                this.displayProjectAudit();
                return;
            }
            if (attempt < 5) {
                setTimeout(() => this.tryDisplayProjectAudit(attempt + 1) , 2000);
            }
        });
    }

    initialize(folder : vscode.WorkspaceFolder, _data : any, _changed : ociSupport.DataChanged) {
        this.folder = folder;
        try {
            this.config = _data as AuditConfiguration;
        } catch (e) {}

        // this._folder = folder;
        audits.set(folder, this);

        // schedule fetching of existing data using the LS
        if (folder && this.config.sourceKnowledgeBase) {
            this.tryDisplayProjectAudit(0);
        }
    }

    buildInline(oci: ociContext.Context, knowledgeBases: any, treeChanged: nodes.TreeChanged): nodes.BaseNode[] | undefined {
        const items = knowledgeBases.inline;
        if (!items || items.length === 0) {
            return undefined;
        }
        const itemNodes = buildKnowledgeBaseNodes(items, oci, treeChanged);
        return itemNodes;
    }

    buildContainers(oci: ociContext.Context, knowledgeBases: any, treeChanged: nodes.TreeChanged): nodes.BaseNode[] | undefined {
        const containers = knowledgeBases.containers;
        if (!containers || containers.length === 0) {
            return undefined;
        }
        const containerNodes: nodes.BaseNode[] = [];
        for (const container of containers) {
            const type = container.type;
            if (type === 'compartment') {
                const displayName = container.displayName;
                const containerNode = new CompartmentKnowledgeBasesNode(displayName, oci, treeChanged);
                containerNodes.push(containerNode);
            } else if (type === 'custom') {
                const displayName = container.displayName;
                const containerNode = new CustomKnowledgeBasesNode(displayName, container.items, oci, treeChanged);
                containerNodes.push(containerNode);
            }
        }
        return containerNodes;
    }

}

function buildKnowledgeBaseNodes(items: any, oci: ociContext.Context, treeChanged: nodes.TreeChanged): nodes.BaseNode[] {
    const itemNodes: nodes.BaseNode[] = [];
    for (const item of items) {
        const ocid = item.ocid;
        const displayName = item.displayName;
        const knowledgeBaseNode = new KnowledgeBaseNode(ocid, oci, displayName, treeChanged);
        itemNodes.push(knowledgeBaseNode);
    }
    return itemNodes;
}

class CompartmentKnowledgeBasesNode extends nodes.AsyncNode {

    private oci: ociContext.Context

    constructor(displayName: string | undefined, oci: ociContext.Context, treeChanged: nodes.TreeChanged) {
        super(displayName ? displayName : 'Knowledge Bases', undefined, 'gcn.oci.compartmentKnowledgeBasesNode', treeChanged);
        this.oci = oci;
        this.iconPath = new vscode.ThemeIcon('book');
        this.updateAppearance();
    }

    async computeChildren(): Promise<nodes.BaseNode[] | undefined> {
        const provider = this.oci.getProvider();
        const compartment = this.oci.getCompartment();
        const knowledgeBases = (await ociUtils.listKnowledgeBases(provider, compartment))?.knowledgeBaseCollection.items;
        if (knowledgeBases) {
            const children: nodes.BaseNode[] = []
            for (const knowledgeBase of knowledgeBases) {
                const ocid = knowledgeBase.id;
                const displayName = knowledgeBase.displayName;
                children.push(new KnowledgeBaseNode(ocid, this.oci, displayName, this.treeChanged));
            }
            return children;
        }
        return [ new nodes.NoItemsNode() ];
    }
}

class CustomKnowledgeBasesNode extends nodes.AsyncNode {

    private items: any;
    private oci: ociContext.Context;

    constructor(displayName: string | undefined, items: any, oci: ociContext.Context, treeChanged: nodes.TreeChanged) {
        super(displayName ? displayName : 'Knowledge Bases (Custom)', undefined, 'gcn.oci.customKnowledgeBasesNode', treeChanged);
        this.items = items;
        this.oci = oci;
        this.iconPath = new vscode.ThemeIcon('book');
        this.updateAppearance();
    }

    async computeChildren(): Promise<nodes.BaseNode[] | undefined> {
        if (this.items?.length > 0) {
            const itemNodes = buildKnowledgeBaseNodes(this.items, this.oci, this.treeChanged);
            return itemNodes;
        }
        return [ new nodes.NoItemsNode() ];
    }
}

class KnowledgeBaseNode extends nodes.AsyncNode {

    private ocid: string;
    private oci: ociContext.Context;

    constructor(ocid: string, oci: ociContext.Context, displayName: string, treeChanged: nodes.TreeChanged) {
        super(displayName, undefined, 'gcn.oci.knowledgeBaseNode', treeChanged);
        this.ocid = ocid;
        this.oci = oci;
        this.iconPath = new vscode.ThemeIcon('book');
        this.updateAppearance();
    }

    async computeChildren(): Promise<nodes.BaseNode[] | undefined> {
        const provider = this.oci.getProvider();
        const compartment = this.oci.getCompartment();
        const knowledgeBase = this.ocid;
        const audits = (await ociUtils.listVulnerabilityAudits(provider, compartment, knowledgeBase))?.vulnerabilityAuditCollection.items;
        if (audits) {
            const children: nodes.BaseNode[] = []
            for (const audit of audits) {
                const ocid = audit.id;
                const displayName = audit.displayName;
                const vulnerableArtifactsCount = audit.vulnerableArtifactsCount;
                children.push(new AuditReportNode(ocid, displayName ? displayName : 'Audit', vulnerableArtifactsCount));
            }
            return children;
        }
        return [ new nodes.NoItemsNode() ];
    }

}

class AuditReportNode extends nodes.BaseNode {

    // private ocid: string;

    constructor(_ocid: string, displayName: string, vulnerableArtifactsCount: number) {
        super(displayName, vulnerableArtifactsCount === 0 ? undefined : `(${vulnerableArtifactsCount} ${vulnerableArtifactsCount === 1 ? 'problem' : 'problems'})`, 'gcn.oci.auditReportNode', undefined, undefined);
        // this.ocid = ocid;
        this.iconPath = new vscode.ThemeIcon('primitive-dot', new vscode.ThemeColor(vulnerableArtifactsCount === 0 ? 'charts.green' : 'charts.red'));
        this.updateAppearance();
    }

}
