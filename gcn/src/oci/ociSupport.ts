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
import * as ociContext from './ociContext';
import * as ociServices from './ociServices';
import * as importUtils from './importUtils';
import * as deployUtils from './deployUtils';

const TYPE = 'oci';

export const SERVICE_PLUGINS: ociServices.ServicePlugin[] = [];

let RESOURCES_FOLDER: string;

export function create(context: vscode.ExtensionContext): model.CloudSupport {
    SERVICE_PLUGINS.push(
        ...require('./buildServices').createFeaturePlugins(context),
        ...require('./deploymentServices').createFeaturePlugins(context),
        ...require('./artifactServices').createFeaturePlugins(context),
        ...require('./containerServices').createFeaturePlugins(context),
        ...require('./knowledgeBaseServices').createFeaturePlugins(context)
    );
    RESOURCES_FOLDER = path.join(context.extensionPath, 'resources', 'oci');
    return new OciSupport();
}

export type DataChanged = () => void;

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

    getServices(folder : vscode.WorkspaceFolder, configuration: model.ServicesConfiguration): model.CloudServices | undefined {
        const data = configuration.data;
        const oci = ociContext.create(data);
        workspaceContexts.set(folder, oci);
        return new ociServices.OciServices(oci, folder, data, configuration.dataChanged);
    }

    async undeployFolder(folder: vscode.Uri): Promise<model.DeployResult> {
        await  deployUtils.undeployFolder(folder);
        return { folders: [ folder.fsPath ], servicesData: []};
    }

}


