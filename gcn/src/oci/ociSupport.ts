/*
 * Copyright (c) 2022, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as model from '../model';
import * as folderStorage from '../folderStorage';
import * as persistenceUtils from '../persistenceUtils';
import * as servicesView from '../servicesView';
import * as ociAuthentication from './ociAuthentication';
import * as ociContext from './ociContext';
import * as dataSupport from './dataSupport';
import * as ociServices from './ociServices';
import * as importUtils from './importUtils';
import * as deployUtils from './deployUtils';


const TYPE = 'oci';

let RESOURCES_FOLDER: string;

const DEVOPS_DECORATIONS_KEY = 'gcn.oci.devOpsDecorations';
let CURRENT_SERVICES: ociServices.OciServices[] = [];
let CURRENT_DEVOPS_PROJECTS: string[] = [];
let devopsDecorations: boolean = false;

export function create(context: vscode.ExtensionContext): model.CloudSupport {
    initialize(context);
    ociServices.initialize(context);
    return new OciSupport();
}

function initialize(context: vscode.ExtensionContext) {
    RESOURCES_FOLDER = path.join(context.extensionPath, 'resources', 'oci');

    context.subscriptions.push(vscode.commands.registerCommand('gcn.oci.enableDevOpsDecorations', () => {
        updateDevOpsDecorations(true);
	}));
    context.subscriptions.push(vscode.commands.registerCommand('gcn.oci.disableDevOpsDecorations', () => {
        updateDevOpsDecorations(false);
	}));
}

function updateDevOpsDecorations(enabled?: boolean) {
    if (enabled !== undefined) {
        devopsDecorations = enabled;
        persistenceUtils.setWorkspaceObject(DEVOPS_DECORATIONS_KEY, enabled);
    } else {
        const workspaceSetting: boolean | undefined = persistenceUtils.getWorkspaceObject(DEVOPS_DECORATIONS_KEY);
        devopsDecorations = workspaceSetting === undefined ? CURRENT_DEVOPS_PROJECTS.length > 1 : workspaceSetting;
    }
    vscode.commands.executeCommand('setContext', 'gcn.oci.devOpsDecorations', devopsDecorations);
    for (const services of CURRENT_SERVICES) {
        services.decorateContainer(devopsDecorations);
    }
    servicesView.refresh();
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

    deployFolders(folders: vscode.WorkspaceFolder[], dump: model.DumpDeployData): Promise<boolean> {
        const saveConfig: deployUtils.SaveConfig = (folder: string, config: any) => {
            folderStorage.storeCloudSupportData(this, [ folder ], [ config ]);
            return true;
        }
        return deployUtils.deployFolders(folders, RESOURCES_FOLDER, saveConfig, dump);
    }

    buildingServices() {
        CURRENT_SERVICES = [];
        CURRENT_DEVOPS_PROJECTS = [];
    }

    populatingView() {
        for (const services of CURRENT_SERVICES) {
            const devopsProject = services.getContext().getDevOpsProject();
            if (!CURRENT_DEVOPS_PROJECTS.includes(devopsProject)) {
                CURRENT_DEVOPS_PROJECTS.push(devopsProject);
            }
        }
    }

    servicesReady() {
        updateDevOpsDecorations();
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
        const servicesData = data[ociServices.DATA_NAME];
        const services = new ociServices.OciServices(folder, oci, servicesData, dataChanged);
        CURRENT_SERVICES.push(services);
        return services;
    }

}
