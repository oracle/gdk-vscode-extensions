/*
 * Copyright (c) 2022, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as adm from 'oci-adm';
import * as nodes from '../nodes';
import * as dialogs from '../dialogs';
import * as ociSupport from './ociSupport';
import * as ociUtils from './ociUtils';
import * as ociContext from './ociContext';
import * as ociService from './ociService';
import * as ociServices  from './ociServices';
import * as dataSupport from './dataSupport';


export const DATA_NAME = 'knowledgeBases';

type KnowledgeBase = {
    ocid: string,
    displayName: string
}

export function initialize(_context: vscode.ExtensionContext) {
    nodes.registerRenameableNode(KnowledgeBaseNode.CONTEXT);
    nodes.registerRemovableNode(KnowledgeBaseNode.CONTEXT);
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



const audits : Map<vscode.WorkspaceFolder, ProjectAudit> = new Map();

export let auditService : ProjectAudit | undefined = undefined;

export interface ProjectAudit {
    
}

// export function create(): ociServices.Service[] {
    // const p : Service = new Service();

    // context.subscriptions.push(vscode.commands.registerCommand('gcn.oci.projectAudit.execute', (...args) => {
    //     let uri = undefined;

    //     if (args.length > 0) {
    //         uri = args[0]?.uri;
    //     }
    //     return uri ? p.executeProjectAudit(uri) : false;
    // }));

    // return [ p ];
// }

interface AuditConfiguration {
    sourceKnowledgeBase? : string;
}



async function selectKnowledgeBases(oci: ociContext.Context, ignore: KnowledgeBase[]): Promise<KnowledgeBase[] | undefined> {
    function shouldIgnore(ocid: string) {
        for (const item of ignore) {
            if (item.ocid === ocid) {
                return true;
            }
        }
        return false;
    }
    async function listKnowledgeBases(oci: ociContext.Context): Promise<adm.models.KnowledgeBaseSummary[] | undefined> {
        // TODO: display the progress in QuickPick
        return await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Reading compartment knowledge bases...',
            cancellable: false
        }, (_progress, _token) => {
            return new Promise(async (resolve) => {
                resolve((await ociUtils.listKnowledgeBases(oci.getProvider(), oci.getCompartment()))?.knowledgeBaseCollection.items);
            });
        })
    }
    const knowledgeBases: KnowledgeBase[] = [];
    const existing = await listKnowledgeBases(oci);
    if (existing) {
        let idx = 1;
        for (const item of existing) {
            if (!shouldIgnore(item.id)) {
                const displayName = item.displayName ? item.displayName : `Knowledge Base ${idx++}`;
                knowledgeBases.push({
                    ocid: item.id,
                    displayName: displayName
                });
            }
        }
    }
    const choices: dialogs.QuickPickObject[] = [];
    for (const knowledgeBase of knowledgeBases) {
        choices.push(new dialogs.QuickPickObject(knowledgeBase.displayName, undefined, undefined, knowledgeBase));
    }
    // TODO: provide a possibility to create a new knowledge base
    // TODO: provide a possibility to select knowledge bases from different compartments
    if (choices.length === 0) {
        vscode.window.showWarningMessage('All knowledge bases already added or no knowledge bases available.')
    } else {
        const selection = await vscode.window.showQuickPick(choices, {
            placeHolder: 'Select Knowledge Base(s) to Add',
            canPickMany: true
        })
        if (selection && selection.length > 0) {
            const selected: KnowledgeBase[] = [];
            for (const sel of selection) {
                selected.push(sel.object as KnowledgeBase);
            }
            return selected;
        }
    }
    return undefined;
}

class Service extends ociService.Service implements ProjectAudit {
    // private _folder : vscode.WorkspaceFolder | undefined;
    private config : AuditConfiguration = {}
    private folder : vscode.WorkspaceFolder | undefined;
    
    constructor(oci: ociContext.Context, serviceData: any | undefined, dataChanged: dataSupport.DataChanged) {
        super(oci, DATA_NAME, serviceData, dataChanged);
        auditService = this;
    }

    getAddContentChoices(): dialogs.QuickPickObject[] | undefined {
        const addContent = async () => {
            if (this.treeChanged) {
                const displayed = this.itemsData ? this.itemsData as KnowledgeBase[] : [];
                const selected = await selectKnowledgeBases(this.oci, displayed);
                if (selected) {
                    const added: nodes.BaseNode[] = [];
                    for (const pipeline of selected) {
                        added.push(new KnowledgeBaseNode(pipeline, this.oci, this.treeChanged));
                    }
                    this.addServiceNodes(added);
                    this.treeChanged();
                }
            }
        }
        return [
            new dialogs.QuickPickObject('Add Knowledge Base', undefined, 'Add existing knowledge base', addContent)
        ];
    }

    async executeProjectAudit(uri : string) {
        if (!(await vscode.commands.getCommands(true)).includes('nbls.gcn.oci.projectAudit.execute')) {
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

        return vscode.commands.executeCommand('nbls.gcn.oci.projectAudit.execute', uri, 
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

    // initialize(folder : vscode.WorkspaceFolder, _data : any, _changed : ociSupport.DataChanged) {
    //     this.folder = folder;
    //     try {
    //         this.config = _data as AuditConfiguration;
    //     } catch (e) {}

    //     // this._folder = folder;
    //     audits.set(folder, this);

    //     // schedule fetching of existing data using the LS
    //     if (folder && this.config.sourceKnowledgeBase) {
    //         this.tryDisplayProjectAudit(0);
    //     }
    // }

    protected buildNodesImpl(oci: ociContext.Context, itemsData: any[], treeChanged: nodes.TreeChanged): nodes.BaseNode[] {
        const nodes: nodes.BaseNode[] = [];
        for (const itemData of itemsData) {
            const ocid = itemData.ocid;
            const displayName = itemData.displayName;
            if (ocid && displayName) {
                const object: KnowledgeBase = {
                    ocid: ocid,
                    displayName: displayName
                }
                nodes.push(new KnowledgeBaseNode(object, oci, treeChanged));
            }
        }
        return nodes;
    }

}

class KnowledgeBaseNode extends nodes.AsyncNode implements nodes.RemovableNode, nodes.RenameableNode, dataSupport.DataProducer {

    static readonly DATA_NAME = 'knowledgeBaseNode';
    static readonly CONTEXT = `gcn.oci.${KnowledgeBaseNode.DATA_NAME}`;
    
    private object: KnowledgeBase;
    private oci: ociContext.Context;

    constructor(object: KnowledgeBase, oci: ociContext.Context, treeChanged: nodes.TreeChanged) {
        super(object.displayName, undefined, KnowledgeBaseNode.CONTEXT, treeChanged);
        this.object = object;
        this.oci = oci;
        this.iconPath = new vscode.ThemeIcon('book');
        this.updateAppearance();
    }

    async computeChildren(): Promise<nodes.BaseNode[] | undefined> {
        const provider = this.oci.getProvider();
        const compartment = this.oci.getCompartment();
        const knowledgeBase = this.object.ocid;
        const audits = (await ociUtils.listVulnerabilityAudits(provider, compartment, knowledgeBase))?.vulnerabilityAuditCollection.items;
        if (audits !== undefined && audits.length > 0) {
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

    rename() {
        const currentName = typeof this.label === 'string' ? this.label as string : (this.label as vscode.TreeItemLabel).label
        vscode.window.showInputBox({
            title: 'Rename Knowledge Base',
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
        return KnowledgeBaseNode.DATA_NAME;
    }

    getData(): any {
        return this.object;
    }

}

class AuditReportNode extends nodes.BaseNode {

    static readonly CONTEXT = 'gcn.oci.auditReportNode';

    // private ocid: string;

    constructor(_ocid: string, displayName: string, vulnerableArtifactsCount: number) {
        super(displayName, vulnerableArtifactsCount === 0 ? undefined : `(${vulnerableArtifactsCount} ${vulnerableArtifactsCount === 1 ? 'problem' : 'problems'})`, AuditReportNode.CONTEXT, undefined, undefined);
        // this.ocid = ocid;
        this.iconPath = new vscode.ThemeIcon('primitive-dot', new vscode.ThemeColor(vulnerableArtifactsCount === 0 ? 'charts.green' : 'charts.red'));
        this.updateAppearance();
    }

}
