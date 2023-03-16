/*
 * Copyright (c) 2022, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as common from 'oci-common';
import * as adm from 'oci-adm';
import * as nodes from '../nodes';
import * as dialogs from '../dialogs';
import * as logUtils from '../logUtils';
import * as ociUtils from './ociUtils';
import * as ociContext from './ociContext';
import * as ociService from './ociService';
import * as ociServices  from './ociServices';
import * as dataSupport from './dataSupport';
import * as ociNodes from './ociNodes';
import * as ociDialogs from './ociDialogs';
import * as ociAuthentication from './ociAuthentication';
import * as path from 'path';
import * as ociFeatures from './ociFeatures';


export const DATA_NAME = 'knowledgeBases';

export const ACTION_NAME = 'Run Project Audit';

const ICON = 'book';

type KnowledgeBase = {
    ocid: string,
    displayName: string
}

type VulnerabilityAudit = {
    ocid: string,
    displayName: string
}

export function initialize(context: vscode.ExtensionContext) {
    function auditFolder(uri: vscode.Uri) {
        logUtils.logInfo(`[audit] Resolving OCI resource for audit of folder ${uri.fsPath}`);
        getFolderAuditsService(uri).then(service => {
            if (service) {
                // Executing for a deployed folder
                logUtils.logInfo(`[audit] Executing audit of deployed folder ${uri.fsPath}`);
                service.executeProjectAudit(uri);
            } else if (service === null) {
                // Executing for a not deployed folder
                logUtils.logInfo(`[audit] Executing audit of not deployed folder ${uri.fsPath}`);
                executeFolderAudit(uri);
            }
        });
    }
    context.subscriptions.push(vscode.commands.registerCommand('gcn.oci.projectAudit.execute', (...params: any[]) => {
        let u = params[0]?.uri || params[0]?.data?.['resourceUri']; // support also NB standard nodes
        if (u) {
            const uri = vscode.Uri.parse(u);
            logUtils.logInfo(`[audit] Invoked Audit for folder ${uri.fsPath}`);
            auditFolder(uri);
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('gcn.oci.projectAudit.execute_Global', () => {
        logUtils.logInfo(`[audit] Invoked Audit without folder context, selecting folder`);
        dialogs.selectFolder(ACTION_NAME, 'Select folder for which to perform the audit', null).then(folder => {
            if (folder) {
                const uri = folder.folder.uri;
                logUtils.logInfo(`[audit] Selected folder ${uri.fsPath}`);
                auditFolder(uri);
            } else if (folder === null) {
                logUtils.logInfo(`[audit] No folders open`);
                vscode.window.showWarningMessage('No folders to audit.');
            }
        });
    }));

    nodes.registerRenameableNode(KnowledgeBaseNode.CONTEXT);
    nodes.registerRemovableNode(KnowledgeBaseNode.CONTEXT);
    nodes.registerReloadableNode(KnowledgeBaseNode.CONTEXT);
    ociNodes.registerOpenInConsoleNode(KnowledgeBaseNode.CONTEXT);
    nodes.registerShowReportNode(VulnerabilityAuditNode.CONTEXT);
    ociNodes.registerOpenInConsoleNode(VulnerabilityAuditNode.CONTEXT);
}

async function executeFolderAudit(uri: vscode.Uri) {
    logUtils.logInfo(`[audit] Invoked generic audit of a not deployed folder ${uri.fsPath}`);

    const gcnConfiguration = vscode.workspace.getConfiguration('gcn');
    let profile: string | undefined = gcnConfiguration.get('sharedKnowledgeBaseProfile', undefined);
    let authentication;
    if (profile) {
        logUtils.logInfo(`[audit] Using saved profile ${profile}`);
        authentication = ociAuthentication.createCustom(undefined, profile);
    } else {
        logUtils.logInfo(`[audit] No profile selected yet`);
        authentication = await ociAuthentication.resolve(ACTION_NAME);
        if (!authentication) {
            return undefined;
        } else if (!authentication.getConfigurationProblem()) {
            profile = authentication.getProfile();
            logUtils.logInfo(`[audit] Saving selected profile ${profile}`);
            await gcnConfiguration.update('sharedKnowledgeBaseProfile', profile, true);
        }
    }
    const configurationProblem = authentication.getConfigurationProblem();
    if (configurationProblem) {
        dialogs.showErrorMessage(configurationProblem);
        return undefined;
    }
    const provider = authentication.getProvider();

    let auditsKnowledgeBase: string | undefined = gcnConfiguration.get('sharedKnowledgeBaseOcid', undefined);
    if (auditsKnowledgeBase) {
        logUtils.logInfo(`[audit] Using saved knowledge base ${auditsKnowledgeBase}`);
    } else {
        logUtils.logInfo(`[audit] No knowledge base selected yet`);
        const compartment = await ociDialogs.selectCompartment(provider, ACTION_NAME);
        if (!compartment) {
            return undefined;
        }
        logUtils.logInfo(`[audit] Resolving knowledge base in selected compartment ${compartment.name} (${compartment.ocid})`);
        auditsKnowledgeBase = await getSharedKnowledgeBase(provider, compartment.ocid, compartment.name);
        if (!auditsKnowledgeBase) {
            return undefined;
        } else {
            logUtils.logInfo(`[audit] Saving resolved knowledge base ${auditsKnowledgeBase}`);
            await gcnConfiguration.update('sharedKnowledgeBaseOcid', auditsKnowledgeBase, true);
        }
    }

    logUtils.logInfo(`[audit] Resolving NBLS project audit command`);    
    const nblsReady = (await vscode.commands.getCommands(true)).includes('nbls.gcn.projectAudit.execute');
    if (!nblsReady) {
        dialogs.showErrorMessage('Required Language Server is not ready.');
        return undefined;
    }

    logUtils.logInfo(`[audit] Executing generic audit of folder ${uri.fsPath}`);
    return vscode.commands.executeCommand('nbls.gcn.projectAudit.execute', uri.toString(), auditsKnowledgeBase, 
        { 
            profile: profile,
            auditName: folderName2AuditName(uri),
            returnData: true,
            displaySummary: false,
            suppressErrors: true
        }
    ).then(result => reportAuditResults(result), error => reportAuditError(error))
}

function reportAuditError(error : any) {
    if (error?.data && 'message' in error.data) {
        vscode.window.showErrorMessage(`Audit failed: ${error.data.message}`)
    }
}

function reportAuditResults(result : any) {
    if (result?.errorMessage) {
        vscode.window.showErrorMessage(`Audit of ${result.projectName} failed: ${result.errorMessage}`)
        return
    }
    if (!result.vulnerableCount) {
        vscode.window.showInformationMessage(`Vulnerability audit for project ${result.projectName} is done.\nNo vulnerability was found.`)
        return;
    } else if (result.vulnerableCount > 1) {
        vscode.window.showWarningMessage(`Vulnerability audit for project ${result.projectName} is done.\nOne vulnerability was found.\nThe vulnerability is listed in Problems window.`)
    } else {
        vscode.window.showWarningMessage(`Vulnerability audit for project ${result.projectName} is done.\n${result.vulnerableCount} vulnerabilities were found.\nThe vulnerability is listed in Problems window.`)
    }
}

function folderName2AuditName(uri : vscode.Uri) : string {
    const parts = uri.fsPath.split(path.sep);
    let folderName = parts.pop();
    if (folderName?.length == 0) {
        folderName = parts.pop();
    }
    const d = new Date();
    const auditName = `${folderName}_${d.getFullYear()}${pad2(d.getMonth())}${pad2(d.getDay())}_${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}_${d.getMilliseconds()}`
    return auditName;
}

function pad2(n : number) : string {
    let s : string = n.toString();
    if (s.length < 2) {
        return '0' + s;
    } else {
        return s;
    }
}

async function getSharedKnowledgeBase(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string, compartmentName: string): Promise<string | undefined> {
    logUtils.logInfo(`[audit] Listing existing knowledge bases in compartment ${compartmentName}`);
    return vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Resolving audits knowledge base for compartment ${compartmentName}`,
        cancellable: false
    }, (_progress, _token) => {
        return new Promise<string | undefined>(async resolve => {
            try {
                const knowledgeBases = await ociUtils.listKnowledgeBases(authenticationDetailsProvider, compartmentID);
                for (const knowledgeBase of knowledgeBases) {
                    if (knowledgeBase.freeformTags?.gcn_tooling_usage === 'gcn-shared-adm-audits') {
                        logUtils.logInfo(`[audit] Found existing shared audits knowledge base '${knowledgeBase.displayName}' in compartment ${compartmentName}`);
                        resolve(knowledgeBase.id);
                        return;
                    }
                }
                logUtils.logInfo(`[audit] Shared audits knowledge base not found in compartment ${compartmentName}`);
                const kb = await createSharedKnowledgeBase(authenticationDetailsProvider, compartmentID, compartmentName);
                logUtils.logInfo(`[audit] Created shared audits knowledge base in compartment ${compartmentName}`);
                resolve(kb);
                return;
            } catch (err) {
                dialogs.showErrorMessage(`Failed to search knowledge bases in compartment ${compartmentName}`, err);
                resolve(undefined);
                return;
            };
        });
    });
}

async function createSharedKnowledgeBase(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string, compartmentName: string): Promise<string> {
    logUtils.logInfo(`[audit] Creating shared audits knowledge base in compartment ${compartmentName}`);
    const workRequestId = await ociUtils.createKnowledgeBase(authenticationDetailsProvider, compartmentID, 'Generic', {
        'gcn_tooling_description': `Shared knowledge base for generic audits within compartment ${compartmentName}`,
        'gcn_tooling_usage': 'gcn-shared-adm-audits'
    });
    logUtils.logInfo(`[audit] Waiting to complete creation of shared audits knowledge base in compartment ${compartmentName}`);
    return ociUtils.admWaitForResourceCompletionStatus(authenticationDetailsProvider, `Shared audits knowledge base for compartment ${compartmentName}`, workRequestId);
}

export async function importServices(oci: ociContext.Context, projectResources: any | undefined, _codeRepositoryResources: any | undefined): Promise<dataSupport.DataProducer | undefined> {
    // TODO: Might return populated instance of Service which internally called importServices()
    if (projectResources?.knowledgeBases) {
        logUtils.logInfo('[import] Importing knowledge bases from list of generated resources');
        if (projectResources.knowledgeBases[0]) {
            const knowledgeBase = projectResources.knowledgeBases[0].ocid;
            logUtils.logInfo(`[import] Importing knowledge base ${knowledgeBase}`);
            const result: dataSupport.DataProducer = {
                getDataName: () => DATA_NAME,
                getData: () => {
                    return {
                        settings: {
                            folderAuditsKnowledgeBase: knowledgeBase
                        }
                    }
                }
            };
            return result;
        } else {
            logUtils.logInfo('[import] No knowledge bases found');
        }
    } else {
        logUtils.logInfo('[import] Importing knowledge bases - no list of generated resources');
        const provider = oci.getProvider();
        const compartment = oci.getCompartment();
        const knowledgeBases = await ociUtils.listKnowledgeBases(provider, compartment);
        if (knowledgeBases && knowledgeBases.length > 0) {
            const knowledgeBase = knowledgeBases[0].id;
            logUtils.logInfo(`[import] Importing knowledge base ${knowledgeBase}`);
            const result: dataSupport.DataProducer = {
                getDataName: () => DATA_NAME,
                getData: () => {
                    return {
                        settings: {
                            folderAuditsKnowledgeBase: knowledgeBase
                        }
                    }
                }
            };
            return result;
        } else {
            logUtils.logInfo('[import] No knowledge base found in project compartment');
        }
    }
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

export async function findByFolder(folder: vscode.Uri): Promise<Service[] | undefined> {
    const services = await ociServices.findByFolder(folder);
    if (!services) {
        return undefined;
    }
    const kbServices: Service[] = [];
    for (const service of services) {
        const kbService = service.getService(DATA_NAME);
        if (kbService instanceof Service) {
            kbServices.push(kbService as Service);
        }
    }
    return kbServices;
}

async function getFolderAuditsService(folder: vscode.Uri): Promise<Service | null | undefined> {
    let wsf = vscode.workspace.getWorkspaceFolder(folder);
    if (!wsf) {
        return null;
    }
    const services = await findByFolder(wsf.uri);
    if (!services || services.length === 0) {
        return null;
    }
    for (const service of services) {
        if (service.getAuditsKnowledgeBase()) {
            return service;
        }
    }
    // TODO: might silently select audits knowledge tagged for the project during Deploy
    // TODO: might silently select audits knowledge base from another folder if configured
    if (await services[0].setupAuditsKnowledgeBase()) {
        return services[0];
    }
    return undefined;
}

async function selectAuditKnowledgeBase(oci: ociContext.Context): Promise<string | undefined> {
    async function listKnowledgeBases(oci: ociContext.Context): Promise<adm.models.KnowledgeBaseSummary[] | undefined> {
        // TODO: display the progress in QuickPick
        return await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Reading compartment knowledge bases...',
            cancellable: false
        }, (_progress, _token) => {
            return new Promise(async (resolve) => {
                try {
                    const items = await ociUtils.listKnowledgeBases(oci.getProvider(), oci.getCompartment());
                    resolve(items);
                    return;
                } catch (err) {
                    resolve(undefined);
                    dialogs.showErrorMessage('Failed to read knowledge bases', err);
                    return;
                }
            });
        })
    }
    const existing = await listKnowledgeBases(oci);
    if (!existing) {
        dialogs.showErrorMessage('No knowledge bases available to run the project audit.');
        return undefined;
    } else {
        if (existing.length === 1) {
            return existing[0].id;
        }
        const choices: dialogs.QuickPickObject[] = [];
        for (const knowledgeBase of existing) {
            choices.push(new dialogs.QuickPickObject(`$(${ICON}) ${knowledgeBase.displayName}`, undefined, undefined, knowledgeBase));
        }
        // TODO: provide a possibility to create a new knowledge base
        // TODO: provide a possibility to select knowledge bases from different compartments
        const selection = await vscode.window.showQuickPick(choices, {
            title: `${ACTION_NAME}: Select Knowledge Base`,
            placeHolder: 'Select existing knowledge base to perform project audits'
        })
        return selection?.object.id;
    }
}

async function selectKnowledgeBases(oci: ociContext.Context, ignore?: KnowledgeBase[]): Promise<KnowledgeBase[] | undefined> {
    function shouldIgnore(ocid: string) {
        if (!ignore) {
            return false;
        }
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
            title: 'Reading knowledge bases...',
            cancellable: false
        }, (_progress, _token) => {
            return new Promise(async (resolve) => {
                try {
                    const items = await ociUtils.listKnowledgeBases(oci.getProvider(), oci.getCompartment());
                    const projectID = oci.getDevOpsProject();
                    const projectItems: adm.models.KnowledgeBaseSummary[] = [];
                    for (const item of items) {
                        if (item.freeformTags?.gcn_tooling_projectOCID === projectID) {
                            projectItems.push(item);
                        }
                    }
                    resolve(projectItems.length ? projectItems : items);
                    return;
                } catch (err) {
                    resolve(undefined);
                    dialogs.showErrorMessage('Failed to read knowledge bases', err);
                    return;
                }
            });
        })
    }
    const knowledgeBases: KnowledgeBase[] = [];
    const descriptions: string[] = [];
    let descriptionExists = false;
    const existing = await listKnowledgeBases(oci);
    if (existing) {
        let idx = 1;
        for (const item of existing) {
            if (!shouldIgnore(item.id)) {
                const displayName = item.displayName ? item.displayName : `Knowledge Base ${idx++}`;
                const descriptionTag = item.freeformTags?.['gcn_tooling_description'];
                if (descriptionTag) descriptionExists = true;
                const description = descriptionTag ? descriptionTag : 'Knowledge base';
                knowledgeBases.push({
                    ocid: item.id,
                    displayName: displayName
                });
                descriptions.push(description);
            }
        }
    }
    const existingContentChoices: dialogs.QuickPickObject[] = [];
    for (let i = 0; i < knowledgeBases.length; i++) {
        existingContentChoices.push(new dialogs.QuickPickObject(`$(${ICON}) ${knowledgeBases[i].displayName}`, undefined, descriptionExists ? descriptions[i] : undefined, knowledgeBases[i]));
    }
    dialogs.sortQuickPickObjectsByName(existingContentChoices);
    let existingContentMultiSelect;
    if (existingContentChoices.length > 1) {
        const multiSelectExisting = async (): Promise<KnowledgeBase[] | undefined> => {
            const selection = await vscode.window.showQuickPick(existingContentChoices, {
                title: `${ociServices.ADD_ACTION_NAME}: Select Knowledge Bases`,
                placeHolder: 'Select existing knowledge bases to add',
                canPickMany: true
            });
            if (selection?.length) {
                const selected: KnowledgeBase[] = [];
                for (const sel of selection) {
                    selected.push(sel.object as KnowledgeBase);
                }
                return selected;
            } else {
                return undefined;
            }
        };
        existingContentMultiSelect = new dialogs.QuickPickObject('$(arrow-small-right) Add multiple existing knowledge bases...', undefined, undefined, multiSelectExisting);
    }
    // TODO: provide a possibility to create a new knowledge base
    // TODO: provide a possibility to select knowledge bases from different compartments
    const choices: dialogs.QuickPickObject[] = [];
    if (existingContentChoices.length) {
        choices.push(...existingContentChoices);
        if (existingContentMultiSelect) {
            choices.push(existingContentMultiSelect);
        }
    }
    if (choices.length === 0) {
        vscode.window.showWarningMessage('All knowledge bases already added or no knowledge bases available.')
    } else {
        const selection = await vscode.window.showQuickPick(choices, {
            title: `${ociServices.ADD_ACTION_NAME}: Select Knowledge Base`,
            placeHolder: 'Select existing knowledge base to add'
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
        if (this.settingsData?.folderAuditsKnowledgeBase) {
            this.tryDisplayProjectAudit(0);
        }
    }

    async addContent() {
        if (this.treeChanged) {
            const displayed = this.itemsData ? this.itemsData as KnowledgeBase[] : [];
            const selected = await selectKnowledgeBases(this.oci, displayed);
            if (selected) {
                const added: nodes.BaseNode[] = [];
                for (const pipeline of selected) {
                    added.push(new KnowledgeBaseNode(pipeline, this.oci, this.treeChanged));
                }
                this.addServiceNodes(added);
            }
        }
    }

    getAddContentChoices(): dialogs.QuickPickObject[] | undefined {
        return ociFeatures.NON_PIPELINE_RESOURCES_ENABLED ? [
            new dialogs.QuickPickObject(`$(${ICON}) Add Knowledge Base`, undefined, 'Add existing knowledge base', () => this.addContent())
        ] : undefined;
    }

    public getAuditsKnowledgeBase(): string | undefined {
        return this.settingsData?.folderAuditsKnowledgeBase;
    }

    async setupAuditsKnowledgeBase(): Promise<string | undefined> {
        const knowledgeBase = await selectAuditKnowledgeBase(this.oci);
        if (knowledgeBase) {
            if (!this.settingsData) {
                this.settingsData = {};
            }
            this.settingsData.folderAuditsKnowledgeBase = knowledgeBase;
            if (this.dataChanged) {
                this.dataChanged(this);
            }
        }
        return knowledgeBase;
    }

    async executeProjectAudit(uri: vscode.Uri) {
        const auditsKnowledgeBase = this.getAuditsKnowledgeBase();

        if (!auditsKnowledgeBase) {
            // vscode.window.showErrorMessage(`No KnowledgeBase bound for ${uri}.`);
            return;
        }

        if (!(await vscode.commands.getCommands(true)).includes('nbls.gcn.projectAudit.execute')) {
            dialogs.showErrorMessage('Required Language Server is not ready.');
            return;
        }
        
        return vscode.commands.executeCommand('nbls.gcn.projectAudit.execute', uri.toString(), 
            auditsKnowledgeBase, 
            {
                profile: this.oci.getProfile(),
                returnData: true,
                displaySummary: false,
                suppressErrors: true
            }
        ).then(result => reportAuditResults(result), error => reportAuditError(error))
    }

    async displayProjectAudit() {
        const auditsKnowledgeBase = this.getAuditsKnowledgeBase();
        if (!auditsKnowledgeBase) {
            return;
        }
        vscode.commands.executeCommand('nbls.gcn.projectAudit.display', this.folder.uri.toString(), auditsKnowledgeBase, 
            { 
                force : true,
                profile: this.oci.getProfile(),
                returnData: true,
                displaySummary: false,
                suppressErrors: true
            }
        ).then(result => reportAuditResults(result), error => reportAuditError(error))
        const prjs: any[] = await vscode.commands.executeCommand('nbls.project.info', this.folder.uri.toString(), { recursive : true, projectStructure : true });

        if (prjs.length < 2) {
            return;
        }
        for (let i of prjs.slice(1)) {
            vscode.commands.executeCommand('nbls.gcn.projectAudit.display', i.projectDirectory, auditsKnowledgeBase,  
                { 
                    force : true,
                    profile: this.oci.getProfile(),
                    returnData: true,
                    displaySummary: false,
                    suppressErrors: true
                }
            ).then(result => reportAuditResults(result), error => reportAuditError(error))
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

class KnowledgeBaseNode extends nodes.AsyncNode implements nodes.RemovableNode, nodes.RenameableNode, nodes.ReloadableNode, ociNodes.CloudConsoleItem, ociNodes.OciResource, dataSupport.DataProducer {

    static readonly DATA_NAME = 'knowledgeBaseNode';
    static readonly CONTEXT = `gcn.oci.${KnowledgeBaseNode.DATA_NAME}`;
    
    private object: KnowledgeBase;
    private oci: ociContext.Context;

    constructor(object: KnowledgeBase, oci: ociContext.Context, treeChanged: nodes.TreeChanged) {
        super(object.displayName, undefined, KnowledgeBaseNode.CONTEXT, treeChanged);
        this.object = object;
        this.oci = oci;
        this.iconPath = new vscode.ThemeIcon(ICON);
        this.updateAppearance();
    }

    async computeChildren(): Promise<nodes.BaseNode[] | undefined> {
        const children: nodes.BaseNode[] = []
        const provider = this.oci.getProvider();
        const compartment = this.oci.getCompartment();
        const knowledgeBase = this.object.ocid;
        const audits = await ociUtils.listVulnerabilityAudits(provider, compartment, knowledgeBase);
        if (audits !== undefined && audits.length > 0) {
            let idx = 0;
            for (const audit of audits) {
                const auditObject = {
                    ocid: audit.id,
                    displayName: audit.displayName ? audit.displayName : `Audit ${idx++}`
                }
                children.push(new VulnerabilityAuditNode(auditObject, this.oci, audit));
            }
        }
        if (children.length === 0) {
            children.push(new nodes.NoItemsNode());
        }
        return children;
    }

    getId() {
        return this.object.ocid;
    }

    async getResource(): Promise<adm.models.KnowledgeBase> {
        return ociUtils.getKnowledgeBase(this.oci.getProvider(), this.object.ocid);
    }

    rename() {
        const service = findByNode(this);
        service?.renameServiceNode(this, 'Rename Knowledge Base', name => this.object.displayName = name);
    }

    remove() {
        const service = findByNode(this);
        service?.removeServiceNodes(this);
    }

    getAddress(): string {
        return `https://cloud.oracle.com/adm/knowledgeBases/${this.object.ocid}`;
    }

    getDataName() {
        return KnowledgeBaseNode.DATA_NAME;
    }

    getData(): any {
        return this.object;
    }

}

class VulnerabilityAuditNode extends nodes.BaseNode implements nodes.ShowReportNode, ociNodes.CloudConsoleItem, ociNodes.OciResource {

    static readonly CONTEXT = 'gcn.oci.vulnerabilityAuditNode';

    private static readonly ICON = 'circle-filled';
    private static readonly ICON_UNKNOWN = 'circle-outline';

    private static readonly V2_SCORE_RED = 6;
    private static readonly V3_SCORE_RED = 6;

    private object: VulnerabilityAudit;
    private oci: ociContext.Context;

    constructor(object: VulnerabilityAudit, oci: ociContext.Context, audit?: adm.models.VulnerabilityAuditSummary) {
        super(object.displayName, undefined, VulnerabilityAuditNode.CONTEXT, undefined, undefined);
        this.object = object;
        this.oci = oci;
        this.updateAppearance(audit);
    }

    updateAppearance(audit?: adm.models.VulnerabilityAuditSummary) {
        if (audit) {
            this.description = `(${new Date(audit.timeCreated).toLocaleString()})`;
            switch (audit.lifecycleState) {
                case adm.models.VulnerabilityAudit.LifecycleState.Active: {
                    const vulnerableArtifactsCount = audit.vulnerableArtifactsCount;
                    if (vulnerableArtifactsCount === 0) {
                        this.iconPath = new vscode.ThemeIcon(VulnerabilityAuditNode.ICON, new vscode.ThemeColor('charts.green'));
                        this.tooltip = 'No vulnerabilities found'
                    } else {
                        const maxV2Score = audit.maxObservedCvssV2Score;
                        const maxV3Score = audit.maxObservedCvssV3Score;
                        if (audit.isSuccess) {
                            this.iconPath = new vscode.ThemeIcon(VulnerabilityAuditNode.ICON, new vscode.ThemeColor('charts.green'));
                        } else if (maxV2Score >= VulnerabilityAuditNode.V2_SCORE_RED || maxV3Score >= VulnerabilityAuditNode.V3_SCORE_RED) {
                            this.iconPath = new vscode.ThemeIcon(VulnerabilityAuditNode.ICON, new vscode.ThemeColor('charts.red'));
                        } else {
                            this.iconPath = new vscode.ThemeIcon(VulnerabilityAuditNode.ICON, new vscode.ThemeColor('charts.orange'));
                        }
                        this.tooltip = `${vulnerableArtifactsCount} ${vulnerableArtifactsCount === 1 ? 'vulnerability' : 'vulnerabilities'} found, maximum observed CVSS v2 score: ${maxV2Score ? maxV2Score : '-'}, maximum observed CVSS v3 score: ${maxV3Score ? maxV3Score : '-'}`;
                    }
                    break;
                }
                default: {
                    this.iconPath = new vscode.ThemeIcon(VulnerabilityAuditNode.ICON_UNKNOWN);
                    super.updateAppearance();
                    break;
                }
                
            }
        } else {
            this.iconPath = new vscode.ThemeIcon(VulnerabilityAuditNode.ICON_UNKNOWN);
            super.updateAppearance();
        }
    }

    getId() {
        return this.object.ocid;
    }

    async getResource(): Promise<adm.models.VulnerabilityAudit> {
        return ociUtils.getVulnerabilityAudit(this.oci.getProvider(), this.object.ocid);
    }

    async getAddress(): Promise<string> {
        const knowledgeBase = await this.getResource();
        return `https://cloud.oracle.com/adm/knowledgeBases/${knowledgeBase.knowledgeBaseId}/vulnerabilityAudits/${this.object.ocid}`;
    }

    showReport() {
        ociNodes.openInConsole(this);
    }

}
