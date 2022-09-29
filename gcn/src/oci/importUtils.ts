/*
 * Copyright (c) 2022, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as model from '../model';
import * as gitUtils from '../gitUtils';
import * as folderStorage from '../folderStorage';
import * as dialogs from '../dialogs';
import * as logUtils from '../logUtils';
import * as ociServices from './ociServices';
import * as ociAuthentication from './ociAuthentication';
import * as ociContext from './ociContext';
import * as ociDialogs from './ociDialogs';
import * as sshUtils from './sshUtils';


// TODO: extract functions shared by deployUtils.ts

export async function importFolders(): Promise<model.ImportResult | undefined> {
    logUtils.logInfo('[import] Invoked import from OCI');

    const authentication = await ociAuthentication.resolve();
    if (!authentication) {
        return undefined;
    }
    const configurationProblem = authentication.getConfigurationProblem();
    if (configurationProblem) {
        dialogs.showErrorMessage(configurationProblem);
        return undefined;
    }
    const provider = authentication.getProvider();

    const compartment = await ociDialogs.selectCompartment(provider);
    if (!compartment) {
        return undefined;
    }

    const devopsProject = await ociDialogs.selectDevOpsProject(provider, compartment);
    if (!devopsProject) {
        return undefined;
    }

    const repositories = await ociDialogs.selectCodeRepositories(provider, devopsProject);
    if (!repositories || repositories.length === 0) {
        return undefined;
    }

    // TODO: select https or ssh method, suggest configuring keys

    const targetDirectory = await selectTargetDirectory();
    if (!targetDirectory) {
        return undefined;
    }

    logUtils.logInfo(`[import] Configured to import devops project '${devopsProject.name}' in compartment '${compartment.name}', ${repositories.length} code repository(s) will be cloned to ${targetDirectory.fsPath}`);

    const folders: string[] = [];
    const servicesData: any[] = [];

    const error: string | undefined = await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Importing devops project ${devopsProject.name}`,
        cancellable: false
    }, (progress, _token) => {
        return new Promise(async resolve => {
            for (const repository of repositories) {
                progress.report({
                    message: `Cloning code repository ${repository.name}...`
                });
                logUtils.logInfo(`[import] Cloning code repository '${repository.name}'`);
                if (repository.sshUrl) { // TODO: https
                    await sshUtils.checkSshConfigured(repository.sshUrl);
                    const cloned = await gitUtils.cloneRepository(repository.sshUrl, targetDirectory.fsPath);
                    if (!cloned) {
                        resolve(`Failed to clone repository ${repository.name}.`);
                        return;
                    }
                } else {
                    resolve(`Failed to clone repository ${repository.name}: ssh url not available.`);
                    return;
                }
            }

            for (const repository of repositories) {
                const folder = path.join(targetDirectory.fsPath, repository.name); // TODO: name and toplevel dir might differ!
                folders.push(folder);

                if (folderStorage.storageExists(folder)) {
                    // GCN configuration already exists in the cloud repository
                    // NOTE: overwriting the OCI authentication for the local profile
                    // TODO: needs a better approach!
                    logUtils.logInfo(`[import] Updating OCI profile in gcn.json in the locally cloned code repository '${repository.name}'`);
                    const configuration = folderStorage.read(folder);
                    const cloudServices: any[] = configuration.cloudServices;
                    for (const cloudService of cloudServices) {
                        if (cloudService.type === 'oci') {
                            cloudService.data[authentication.getDataName()] = authentication.getData();
                        }
                    }
                    folderStorage.store(folder, configuration, true);
                    servicesData.push(undefined);
                } else {
                    // GCN configuration does not exist in the cloud repository
                    progress.report({
                        message: `Importing services for code repository ${repository.name}...`
                    });
                    logUtils.logInfo(`[import] Importing OCI services and creating gcn.json in the locally cloned code repository '${repository.name}'`);
                    const services = await importServices(authentication, compartment.ocid, devopsProject.ocid, repository.ocid);
                    servicesData.push(services);
                }
                // Do not track changes to .vscode/gcn.json
                const gcnConfig = folderStorage.getDefaultLocation();
                gitUtils.skipWorkTree(folder, gcnConfig);
            }

            logUtils.logInfo('[import] Import from OCI successfully completed');

            resolve(undefined);
            return;
        });
    });

    if (error) {
        dialogs.showErrorMessage(error);
        return undefined;
    }

    return {
        folders: folders,
        servicesData: servicesData
    };
}

async function selectTargetDirectory(): Promise<vscode.Uri | undefined> {
    const target = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        title: 'Choose Target Directory',
        openLabel: 'Clone Here'
    });
    return target && target.length === 1 ? target[0] : undefined;
}

async function importServices(authentication: ociAuthentication.Authentication, compartment: string, devopsProject: string, repository: string): Promise<any> {
    const data: any = {
        version: '1.0'
    };
    data[authentication.getDataName()] = authentication.getData();
    const oci = new ociContext.Context(authentication, compartment, devopsProject, repository);
    data[oci.getDataName()] = oci.getData();
    const services = await ociServices.importServices(oci);
    data[services.getDataName()] = services.getData();
    return data;
}
