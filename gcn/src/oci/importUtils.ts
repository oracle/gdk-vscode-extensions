/*
 * Copyright (c) 2022, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as model from '../model';
import * as dialogs from '../dialogs';
import * as gitUtils from '../gitUtils';
import * as folderStorage from '../folderStorage';
import * as ociUtils from './ociUtils';
import * as ociServices from './ociServices';
import * as ociAuthentication from './ociAuthentication';
import * as ociContext from './ociContext';


// TODO: extract functions shared by deployUtils.ts

export async function importFolders(): Promise<model.ImportResult | undefined> {
    const authentication = ociAuthentication.createDefault();
    const configurationProblem = authentication.getConfigurationProblem();
    if (configurationProblem) {
        vscode.window.showErrorMessage(configurationProblem);
        return undefined;
    }

    const compartment = await selectCompartment(authentication);
    if (!compartment) {
        return undefined;
    }

    const devopsProject = await selectDevOpsProject(authentication, compartment);
    if (!devopsProject) {
        return undefined;
    }

    const repositories = await selectCodeRepositories(authentication, devopsProject.ocid);
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
                if (repository.sshUrl) { // TODO: https
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
                    servicesData.push(undefined);
                } else {
                    // GCN configuration does not exist in the cloud repository
                    progress.report({
                        message: `Importing services for code repository ${repository.name}...`
                    });
                    const services = await importServices(authentication, compartment, devopsProject.ocid, repository.ocid);
                    servicesData.push(services);
                }
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

export async function selectCompartment(authentication: ociAuthentication.Authentication): Promise<string | undefined> {
    // TODO: rewrite to multistep or anything else displaying progress in QuickPick area
    const choices: dialogs.QuickPickObject[] | undefined = await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Reading available compartments...',
        cancellable: false
    }, (_progress, _token) => {
        return new Promise(async resolve => {
            ociUtils.listCompartments(authentication.getProvider()).then(compartments => {
                if (!compartments) {
                    resolve(undefined);
                } else {
                    const choices: dialogs.QuickPickObject[] = [];
                    for (const compartment of compartments.items) {
                        // const choice = new dialogs.QuickPickObject(compartment.name, compartment.description, undefined, compartment.id);
                        const choice = new dialogs.QuickPickObject(compartment.name, undefined, undefined, compartment.id);
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
async function selectDevOpsProject(authentication: ociAuthentication.Authentication, compartmentID: string): Promise<DevOpsProject | undefined> {
    // TODO: rewrite to multistep or anything else displaying progress in QuickPick area
    const choices: dialogs.QuickPickObject[] | undefined = await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Reading available devops projects...',
        cancellable: false
    }, (_progress, _token) => {
        return new Promise(async resolve => {
            ociUtils.listDevOpsProjects(authentication.getProvider(), compartmentID).then(projects => {
                if (!projects) {
                    resolve(undefined);
                } else {
                    const choices: dialogs.QuickPickObject[] = [];
                    for (const project of projects.projectCollection.items) {
                        // const choice = new dialogs.QuickPickObject(project.name, project.description, undefined, project.id);
                        const choice = new dialogs.QuickPickObject(project.name, undefined, undefined, { ocid: project.id, name: project.name });
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
async function selectCodeRepositories(authentication: ociAuthentication.Authentication, projectID: string): Promise<CodeRepository[] | undefined> {
    // TODO: rewrite to multistep or anything else displaying progress in QuickPick area
    const choices: dialogs.QuickPickObject[] | undefined = await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Reading available code repositories...',
        cancellable: false
    }, (_progress, _token) => {
        return new Promise(async resolve => {
            ociUtils.listCodeRepositories(authentication.getProvider(), projectID).then(repositories => {
                if (!repositories) {
                    resolve(undefined);
                } else {
                    const choices: dialogs.QuickPickObject[] = [];
                    let idx = 0;
                    for (const repository of repositories.repositoryCollection.items) {
                        // const choice = new dialogs.QuickPickObject(project.name, project.description, undefined, project.compartmentId);
                        // TODO: name must exist and must represent an unique directory name!
                        const name = repository.name ? repository.name : `CodeRepository${idx++}`;
                        const choice = new dialogs.QuickPickObject(name, undefined, undefined, { ocid: repository.id, name: name, httpUrl: repository.httpUrl, sshUrl: repository.sshUrl });
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
