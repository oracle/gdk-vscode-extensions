/*
 * Copyright (c) 2022, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as common from 'oci-common';
import * as model from '../model';
import * as folderStorage from '../folderStorage';
import * as ociAuthentication from './ociAuthentication';
import * as ociContext from './ociContext';
import * as dataSupport from './dataSupport';
import * as ociServices from './ociServices';
import * as ociUtils from './ociUtils';
import * as importUtils from './importUtils';
import * as deployUtils from './deployUtils';
import * as undeployUtils from './undeployUtils';


const TYPE = 'oci';

let RESOURCES_FOLDER: string;

export function create(context: vscode.ExtensionContext): model.CloudSupport {
    context.subscriptions.push(vscode.commands.registerCommand('gcn.oci.initializeSshKeys', () => {
		initializeSshKeys();
	}));
    // TODO: --------------------
    // !!! NOT TO BE RELEASED !!!
    context.subscriptions.push(vscode.commands.registerCommand('gcn.oci.undeployFromCloud', () => {
        undeployUtils.undeployFolders();
	}));
    // !!! NOT TO BE RELEASED !!!
    // --------------------------
    RESOURCES_FOLDER = path.join(context.extensionPath, 'resources', 'oci');
    ociServices.initialize(context);
    return new OciSupport();
}

const workspaceContexts : Map<vscode.WorkspaceFolder, ociContext.Context> = new Map();

export function findOciConfiguration(location : vscode.WorkspaceFolder | vscode.Uri | string | undefined) : ociContext.Context | undefined {
    if (!location) {
        return undefined;
    }
    let wsf = undefined;
    let u = undefined;
    if (location instanceof vscode.Uri) {
        u = location as vscode.Uri;
    } else {
        let l = location;

        if ((location as any).uri) {
            l = (location as any).uri;
        }
        if (typeof l === 'string') {
            u = vscode.Uri.parse(l);
        } else if (l instanceof vscode.Uri) {
            u = l as vscode.Uri;
        }
    }
    if (!u) {
        return undefined;
    }
    wsf = vscode.workspace.getWorkspaceFolder(u);
    return wsf ? workspaceContexts.get(wsf) : undefined;
}

let sshKeyInitInProgress = false;
async function initializeSshKeys() {
    if (!sshKeyInitInProgress) {
        sshKeyInitInProgress = true;
        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Intializing SSH keys',
                cancellable: false
            }, (progress, _token) => {
                return new Promise<void>(async resolve => {
                    const defaultConfigLocation = path.join(os.homedir(), '.ssh', 'config');
                    const fileExists = fs.existsSync(defaultConfigLocation);
                    if (fileExists) {
                        const content = fs.readFileSync(defaultConfigLocation);
                        if (/^Host devops.scmservice.*.oci.oraclecloud.com/mi.test(content.toString())) {
                            progress.report({ message: 'Done.', increment: 100 });
                            resolve();
                            return;
                        }
                    }
                    let userName: string | undefined;
                    let tenancyName: string | undefined;
                    let identityFile: string | null | undefined;
                    try {
                        const provider = new common.ConfigFileAuthenticationDetailsProvider();
                        userName = (await ociUtils.getUser(provider))?.user.name;
                        tenancyName = (await ociUtils.getTenancy(provider))?.tenancy.name;
                        identityFile = common.ConfigFileReader.parseDefault(null).get('key_file');
                    } catch (err) {}
                    const uri = fileExists ? vscode.Uri.file(defaultConfigLocation) : vscode.Uri.parse('untitled:' + defaultConfigLocation);
                    const editor = await vscode.window.showTextDocument(uri);
                    if (userName && tenancyName && identityFile) {
                        const text = `Host devops.scmservice.*.oci.oraclecloud.com\n   User ${userName}@${tenancyName}\n   IdentityFile ${identityFile}\n\n`; 
                        editor.edit(editBuilder => editBuilder.replace(new vscode.Position(0, 0), text));
                    } else {
                        const snippet = new vscode.SnippetString('Host devops.scmservice.*.oci.oraclecloud.com\n');
                        if (userName && tenancyName) {
                            snippet.appendText(`   User ${userName}@${tenancyName}\n`);
                        } else {
                            snippet.appendPlaceholder('   User <USER_NAME>@<TENANCY_NAME>\n');
                        }
                        if (identityFile) {
                            snippet.appendText(`   IdentityFile ${identityFile}\n\n`)
                        } else {
                            snippet.appendPlaceholder('   IdentityFile <PATH_TO_PEM_FILE>\n\n')
                        }
                        editor.insertSnippet(snippet, new vscode.Position(0, 0));
                    }
                    progress.report({ message: 'Done.', increment: 100 });
                    resolve();
                });
            });
        } finally {
            sshKeyInitInProgress = false;
        }
    }
}

class OciSupport implements model.CloudSupport {

    getName(): string {
        return 'OCI'
    }

    getDescription(): string {
        return 'Oracle Cloud Infrastructure'
    }

    getType(): string {
        return TYPE;
    }

    importFolders(): Promise<model.ImportResult | undefined> {
        return importUtils.importFolders();
    }

    deployFolders(): Promise<undefined> {
        const saveConfig: deployUtils.SaveConfig = (folder: string, config: any) => {
            folderStorage.storeCloudSupportData(this, [ folder ], [ config ]);
            return true;
        }
        return deployUtils.deployFolders(RESOURCES_FOLDER, saveConfig);
    }

    getServices(folder: vscode.WorkspaceFolder, configuration: model.ServicesConfiguration): model.CloudServices | undefined {
        const data = configuration.data;
        const dataChanged: dataSupport.DataChanged = (dataProducer?: dataSupport.DataProducer) => {
            const dataName = dataProducer?.getDataName();
            if (dataProducer && dataName) {
                data[dataName] = dataProducer.getData();
            }
            configuration.dataChanged();
        }
        const authenticationData = data[ociAuthentication.DATA_NAME];
        const authentication = ociAuthentication.create(authenticationData, dataChanged);
        const contextData = data[ociContext.DATA_NAME];
        const oci = ociContext.create(authentication, contextData, dataChanged);
        //---
        // TODO: cleanup
        workspaceContexts.set(folder, oci);
        //---
        const servicesData = data[ociServices.DATA_NAME];
        const services = new ociServices.OciServices(oci, servicesData, dataChanged);
        return services;
    }

}
