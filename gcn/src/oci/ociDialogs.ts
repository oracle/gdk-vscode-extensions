/*
 * Copyright (c) 2022, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as dialogs from '../dialogs';
import * as ociUtils from './ociUtils';
import * as ociAuthentication from './ociAuthentication';


export async function selectCompartment(authentication: ociAuthentication.Authentication): Promise<{ ocid: string, name: string } | undefined> {
    // TODO: rewrite to multistep or anything else displaying progress in QuickPick area
    // TODO: add root compartment
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
                    const compartmentsMap: any = {};
                    for (const compartment of compartments.items) {
                        compartmentsMap[compartment.id] = compartment;
                    }
                    const choices: dialogs.QuickPickObject[] = [];
                    for (const compartment of compartments.items) {
                        let name = compartment.name;
                        let parent = compartmentsMap[compartment.compartmentId]; // will be undefined for root compartment
                        while (parent) {
                            name = `${parent.name}/${name}`;
                            parent = compartmentsMap[parent.compartmentId];
                        }
                        const description = compartment.description ? compartment.description : undefined;
                        const choice = new dialogs.QuickPickObject(name, description, undefined, { ocid: compartment.id, name: name });
                        choices.push(choice);
                    }
                    resolve(choices.sort((o1, o2) => o1.label.localeCompare(o2.label)));
                }
            }).catch(err => {
                vscode.window.showErrorMessage('Failed to read compartments: ' + err.message);
                resolve(undefined);
            });
        });
    });

    if (!choices) {
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

export async function selectDevOpsProject(authentication: ociAuthentication.Authentication, compartmentID: string): Promise<{ ocid: string, name: string } | undefined> {
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
                        const description = project.description ? project.description : 'DevOps Project';
                        const choice = new dialogs.QuickPickObject(project.name, undefined, description, { ocid: project.id, name: project.name });
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

export async function selectCodeRepositories(authentication: ociAuthentication.Authentication, projectID: string): Promise<{ ocid: string, name: string, httpUrl: string | undefined, sshUrl: string | undefined }[] | undefined> {
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
                        const name = repository.name ? repository.name : `CodeRepository${idx++}`;
                        const description = repository.description ? repository.description : 'Code Repository';
                        const choice = new dialogs.QuickPickObject(name, undefined, description, { ocid: repository.id, name: name, httpUrl: repository.httpUrl, sshUrl: repository.sshUrl });
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
        const repositories: { ocid: string, name: string, httpUrl: string | undefined, sshUrl: string | undefined }[] = [];
        for (const repository of choice) {
            repositories.push(repository.object);
        }
        return repositories;
    }

    return undefined;
}
