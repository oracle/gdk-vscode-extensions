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
import * as gcnServices from '../gcnServices';
import * as ociServices from './ociServices';
import * as ociAuthentication from './ociAuthentication';
import * as ociContext from './ociContext';
import * as ociDialogs from './ociDialogs';
import * as sshUtils from './sshUtils';


const ACTION_NAME = 'Import from OCI';

// TODO: extract functions shared by deployUtils.ts

export async function importFolders(): Promise<model.ImportResult | undefined> {
    logUtils.logInfo('[import] Invoked import existing devops project');

    const openContexts: ociContext.Context[] = [];

    const folderData = gcnServices.getFolderData();
    for (const data of folderData) {
        const services = ociServices.findByFolderData(data);
        for (const service of services) {
            const context = service.getContext();
            if (!context.getConfigurationProblem()) {
                openContexts.push(context);
            }
        }
    }

    let auth: ociAuthentication.Authentication | undefined;
    if (openContexts.length) {
        const profiles: string[] = [];
        for (const context of openContexts) {
            const contextProfile = context.getProfile();
            if (!profiles.includes(contextProfile)) {
                profiles.push(contextProfile);
            }
        }
        const selectedProfile = await ociDialogs.selectOciProfileFromList(profiles, true, ACTION_NAME);
        if (!selectedProfile) {
            return undefined;
        }
        auth = ociAuthentication.createCustom(undefined, selectedProfile);
    } else {
        auth = await ociAuthentication.resolve(ACTION_NAME);
    }
    const authentication = auth;
    if (!authentication) {
        return undefined;
    }
    const configurationProblem = authentication.getConfigurationProblem();
    if (configurationProblem) {
        dialogs.showErrorMessage(configurationProblem);
        return undefined;
    }
    const provider = authentication.getProvider();

    let compartment: { ocid: string, name: string } | undefined;
    let devopsProject: { ocid: string, name: string } | undefined;

    if (openContexts.length) {
        const projects: string[] = [];
        for (const context of openContexts) {
            const contextProject = context.getDevOpsProject();
            if (!projects.includes(contextProject)) {
                projects.push(contextProject);
            }
        }
        const selectedProject = await ociDialogs.selectDevOpsProjectFromList(provider, projects, true, ACTION_NAME);
        if (!selectedProject) {
            // TODO: if (selectedProject === null) display error/warning
            return undefined;
        }
        devopsProject = selectedProject;
        compartment = { ocid: selectedProject.compartment, name: selectedProject.compartment };
    } else {
        compartment = await ociDialogs.selectCompartment(provider, ACTION_NAME);
        if (!compartment) {
            return undefined;
        }
        devopsProject = await ociDialogs.selectDevOpsProject(provider, compartment, ACTION_NAME);
        if (!devopsProject) {
            return undefined;
        }
    }

    const ignoreRepositories: string[] = [];
    if (openContexts.length) {
        for (const context of openContexts) {
            const contextRepository = context.getCodeRepository();
            if (!ignoreRepositories.includes(contextRepository)) {
                ignoreRepositories.push(contextRepository);
            }
        }
    }
    const repositories = await ociDialogs.selectCodeRepositories(provider, devopsProject, openContexts.length === 0, ACTION_NAME, ignoreRepositories);
    if (!repositories || repositories.length === 0) {
        return undefined;
    }

    const targetDirectories: string[] = [];
    if (openContexts.length) {
        for (const data of folderData) {
            const targetDirectory = path.dirname(data.folder.uri.fsPath);
            if (!targetDirectories.includes(targetDirectory)) {
                targetDirectories.push(targetDirectory);
            }
        }
    }
    const targetDirectory = await dialogs.selectDirectory(targetDirectories, ACTION_NAME, 'Select Target Directory', 'Import Here');
    if (!targetDirectory) {
        return undefined;
    }

    logUtils.logInfo(`[import] Configured to import devops project '${devopsProject.name}' in compartment '${compartment.name}', ${repositories.length} code repository(s) will be cloned to ${targetDirectory}`);

    const folders: string[] = [];
    const servicesData: any[] = [];

    const error: string | undefined = await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Importing from OCI',
        cancellable: false
    }, (progress, _token) => {
        return new Promise(async resolve => {
            for (const repository of repositories) {
                progress.report({
                    message: `Cloning code repository ${repository.name}...`
                });
                logUtils.logInfo(`[import] Cloning code repository '${repository.name}'`);
                if (repository.sshUrl) { // TODO: https
                    await sshUtils.checkSshConfigured(provider, repository.sshUrl);
                    const cloned = await gitUtils.cloneRepository(repository.sshUrl, targetDirectory);
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
                const folder = path.join(targetDirectory, repository.name); // TODO: name and toplevel dir might differ!
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
                    // Do not track local changes to .vscode/gcn.json
                    const gcnConfig = folderStorage.getDefaultLocation();
                    gitUtils.skipWorkTree(folder, gcnConfig); // [GCN-1141] Only works if file present in the remote repo
                } else {
                    // GCN configuration does not exist in the cloud repository
                    progress.report({
                        message: `Importing services for code repository ${repository.name}...`
                    });
                    logUtils.logInfo(`[import] Importing OCI services and creating gcn.json in the locally cloned code repository '${repository.name}'`);
                    const services = await importServices(authentication, (compartment as { ocid: string, name: string }).ocid, (devopsProject as { ocid: string, name: string }).ocid, repository.ocid);
                    servicesData.push(services);
                    // TODO: .vscode/gcn.json will be marked as locally new (not in the remote repo)
                }
            }

            logUtils.logInfo('[import] Existing devops project successfully imported');

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
