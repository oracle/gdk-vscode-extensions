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
import * as ociAuthentication from './ociAuthentication';
import * as ociContext from './ociContext';
import * as dataSupport from './dataSupport';
import * as ociServices from './ociServices';
import * as importUtils from './importUtils';
import * as deployUtils from './deployUtils';


const TYPE = 'oci';

let RESOURCES_FOLDER: string;

export function create(context: vscode.ExtensionContext): model.CloudSupport {
    RESOURCES_FOLDER = path.join(context.extensionPath, 'resources', 'oci');
    ociServices.initialize(context);
    return new OciSupport();
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

    deployFolders(folders: vscode.WorkspaceFolder[]): Promise<undefined> {
        const saveConfig: deployUtils.SaveConfig = (folder: string, config: any) => {
            folderStorage.storeCloudSupportData(this, [ folder ], [ config ]);
            return true;
        }
        return deployUtils.deployFolders(folders, RESOURCES_FOLDER, saveConfig);
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
        return services;
    }

}
