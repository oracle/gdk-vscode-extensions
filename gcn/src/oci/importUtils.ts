/*
 * Copyright (c) 2022, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as common from 'oci-common';
import * as model from '../model';
import * as gitUtils from '../gitUtils';
import * as ociUtils from './ociUtils';
import * as ociSupport from './ociSupport';
import * as ociContext from './ociContext';

// TODO: extract functions shared by deployUtils.ts

export async function importFolders(): Promise<model.ImportResult | undefined> {
    let resolvedProvider: common.ConfigFileAuthenticationDetailsProvider | undefined;
    // TODO: implement support for additional authentication methods (custom file/profile, credentials, etc.)
    // TODO: should be implemented in ociContext.ts or authenticationUtils.ts
    try {
        resolvedProvider = new common.ConfigFileAuthenticationDetailsProvider();
    } catch (err) {
        vscode.window.showErrorMessage('Cannot access OCI using the default profile in .oci/config file, or config file not available.');
    }
    if (!resolvedProvider) {
        return undefined;
    }
    const provider = resolvedProvider;

    const compartment = await selectCompartment(provider);
    if (!compartment) {
        return undefined;
    }

    const devopsProject = await selectDevOpsProject(provider, compartment);
    if (!devopsProject) {
        return undefined;
    }

    const repositories = await selectCodeRepositories(provider, devopsProject.ocid);
    if (!repositories || repositories.length === 0) {
        return undefined;
    }

    // TODO: select https or ssh method, suggest configuring keys

    const targetDirectory = await selectTargetDirectory();
    if (!targetDirectory) {
        return undefined;
    }

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
                if (repository.httpUrl) { // TODO ssh
                    const cloned = await gitUtils.cloneRepository(repository.httpUrl, targetDirectory.fsPath);
                    if (!cloned) {
                        resolve(`Failed to clone repository ${repository.name}.`);
                        return;
                    }
                } else {
                    resolve(`Failed to clone repository ${repository.name}: http url not available.`);
                    return;
                }
            }

            for (const repository of repositories) {
                progress.report({
                    message: `Importing services for code repository ${repository.name}...`
                });
                const folder = path.join(targetDirectory.fsPath, repository.name); // TODO: name and toplevel dir might differ!
                folders.push(folder);

                const services = await importServices(provider, compartment, devopsProject.ocid, repository.ocid);
                servicesData.push(services);
            }

            resolve(undefined);
            return;
        });
    });

    if (error) {
        vscode.window.showErrorMessage(error);
        return undefined;
    }

    return {
        folders: folders,
        servicesData: servicesData
    };
}

export async function selectCompartment(provider: common.ConfigFileAuthenticationDetailsProvider): Promise<string | undefined> {
    // TODO: rewrite to multistep or anything else displaying progress in QuickPick area
    const choices: QuickPickObject[] | undefined = await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Reading available compartments...',
        cancellable: false
    }, (_progress, _token) => {
        return new Promise(async resolve => {
            ociUtils.listCompartments(provider).then(compartments => {
                if (!compartments) {
                    resolve(undefined);
                } else {
                    const choices: QuickPickObject[] = [];
                    for (const compartment of compartments.items) {
                        // const choice = new QuickPickObject(compartment.name, compartment.description, undefined, compartment.id);
                        const choice = new QuickPickObject(compartment.name, undefined, undefined, compartment.id);
                        choices.push(choice);
                    }
                    resolve(choices);
                }
            });
        });
    });

    if (!choices) {
        vscode.window.showErrorMessage('Failed to read compartments.');
        return undefined;
    }

    if (choices.length === 0) {
        vscode.window.showWarningMessage('No compartments available.');
        return undefined;
    }

    if (choices.length === 1) {
        return choices[0].object;
    }

    const choice = await vscode.window.showQuickPick(choices, {
        placeHolder: 'Select Compartment'
    });

    return choice ? choice.object : undefined;
}

type DevOpsProject = { ocid: string, name: string }
async function selectDevOpsProject(provider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string): Promise<DevOpsProject | undefined> {
    // TODO: rewrite to multistep or anything else displaying progress in QuickPick area
    const choices: QuickPickObject[] | undefined = await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Reading available devops projects...',
        cancellable: false
    }, (_progress, _token) => {
        return new Promise(async resolve => {
            ociUtils.listDevOpsProjects(provider, compartmentID).then(projects => {
                if (!projects) {
                    resolve(undefined);
                } else {
                    const choices: QuickPickObject[] = [];
                    for (const project of projects.projectCollection.items) {
                        // const choice = new QuickPickObject(project.name, project.description, undefined, project.id);
                        const choice = new QuickPickObject(project.name, undefined, undefined, { ocid: project.id, name: project.name });
                        choices.push(choice);
                    }
                    resolve(choices);
                }
            });
        });
    });

    if (!choices) {
        vscode.window.showErrorMessage('Failed to read projects.');
        return undefined;
    }

    if (choices.length === 0) {
        vscode.window.showWarningMessage('No projects available.');
        return undefined;
    }

    if (choices.length === 1) {
        return choices[0].object;
    }

    const choice = await vscode.window.showQuickPick(choices, {
        placeHolder: 'Select DevOps Project'
    });

    return choice ? choice.object : undefined;
}

type CodeRepository = { ocid: string, name: string, httpUrl: string | undefined, sshUrl: string | undefined }
async function selectCodeRepositories(provider: common.ConfigFileAuthenticationDetailsProvider, projectID: string): Promise<CodeRepository[] | undefined> {
    // TODO: rewrite to multistep or anything else displaying progress in QuickPick area
    const choices: QuickPickObject[] | undefined = await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Reading available code repositories...',
        cancellable: false
    }, (_progress, _token) => {
        return new Promise(async resolve => {
            ociUtils.listCodeRepositories(provider, projectID).then(repositories => {
                if (!repositories) {
                    resolve(undefined);
                } else {
                    const choices: QuickPickObject[] = [];
                    let idx = 0;
                    for (const repository of repositories.repositoryCollection.items) {
                        // const choice = new QuickPickObject(project.name, project.description, undefined, project.compartmentId);
                        // TODO: name must exist and must represent an unique directory name!
                        const name = repository.name ? repository.name : `CodeRepository${idx++}`;
                        const choice = new QuickPickObject(name, undefined, undefined, { ocid: repository.id, name: name, httpUrl: repository.httpUrl, sshUrl: repository.sshUrl });
                        choices.push(choice);
                    }
                    resolve(choices);
                }
            });
        });
    });

    if (!choices) {
        vscode.window.showErrorMessage('Failed to read code repositories.');
        return undefined;
    }

    if (choices.length === 0) {
        vscode.window.showWarningMessage('No code repositories available.');
        return undefined;
    }

    if (choices.length === 1) {
        return [ choices[0].object ];
    }

    const choice = await vscode.window.showQuickPick(choices, {
        placeHolder: 'Select Code Repositores',
        canPickMany: true
    });

    if (choice && choice.length > 0) {
        const repositories: CodeRepository[] = [];
        for (const repository of choice) {
            repositories.push(repository.object);
        }
        return repositories;
    }

    return undefined;
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

async function importServices(provider: common.ConfigFileAuthenticationDetailsProvider, compartment: string, devopsProject: string, repository: string): Promise<any> {
    const data: any = {
        version: '1.0'
    };
    const oci = new ociContext.Context(provider, compartment, devopsProject, repository);
    oci.store(data);

    const services: any = {};
    for (const servicePlugin of ociSupport.SERVICE_PLUGINS) {
        const featureServices = await servicePlugin.importServices(oci);
        if (featureServices) {
            services[servicePlugin.getServiceType()] = featureServices;
        }
    }
    data.services = services;
    return data;
}

export class QuickPickObject implements vscode.QuickPickItem {
    constructor(
        public readonly label: string,
        public readonly description : string | undefined,
        public readonly detail: string | undefined,
        public readonly object?: any
    ) {}
}
