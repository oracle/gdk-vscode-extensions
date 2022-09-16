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
            ociUtils.listCompartments(authentication.getProvider()).then(async compartments => {
                if (!compartments) {
                    resolve(undefined);
                } else {
                    const compartmentsMap: any = {};
                    for (const compartment of compartments) {
                        compartmentsMap[compartment.id] = compartment;
                    }
                    const choices: dialogs.QuickPickObject[] = [];
                    for (const compartment of compartments) {
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
                    choices.sort((o1, o2) => o1.label.localeCompare(o2.label));
                    const tenancy = await ociUtils.getTenancy(authentication.getProvider());
                    const rootCompartmentName = tenancy.name ? `${tenancy.name} (root)` : 'root';
                    choices.unshift(new dialogs.QuickPickObject(rootCompartmentName, `Root of the${tenancy.name ? ' ' + tenancy.name : ''} tenancy`, undefined, { ocid: tenancy.id, name: rootCompartmentName }));
                    resolve(choices);
                }
            }).catch(err => {
                vscode.window.showErrorMessage('Failed to read compartments: ' + err.message);
                resolve(undefined);
            });
        });
    });

    if (choices === undefined) {
        return undefined;
    }

    if (choices.length === 0) {
        vscode.window.showWarningMessage('No compartments available.');
        return undefined;
    }

    // if (choices.length === 1) {
    //     return choices[0].object;
    // }

    const choice = await vscode.window.showQuickPick(choices, {
        placeHolder: 'Select Compartment'
    });

    return choice ? choice.object : undefined;
}

export async function selectDevOpsProject(authentication: ociAuthentication.Authentication, compartment: { ocid: string, name?: string }): Promise<{ ocid: string, name: string } | undefined> {
    // TODO: rewrite to multistep or anything else displaying progress in QuickPick area
    const choices: dialogs.QuickPickObject[] | undefined = await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Reading available devops projects...',
        cancellable: false
    }, (_progress, _token) => {
        return new Promise(async resolve => {
            ociUtils.listDevOpsProjects(authentication.getProvider(), compartment.ocid).then(projects => {
                const choices: dialogs.QuickPickObject[] = [];
                for (const project of projects) {
                    const description = project.description ? project.description : 'DevOps Project';
                    const choice = new dialogs.QuickPickObject(project.name, description, undefined, { ocid: project.id, name: project.name });
                    choices.push(choice);
                }
                resolve(choices);
            }).catch(err => {
                vscode.window.showErrorMessage('Failed to read devops projects: ' + err.message);
                resolve(undefined);
            });
        });
    });

    if (choices === undefined) {
        return undefined;
    }

    if (choices.length === 0) {
        vscode.window.showWarningMessage(`No projects available ${compartment.name ? 'in compartment ' + compartment.name : 'in the compartment'}.`);
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

export async function selectCodeRepositories(authentication: ociAuthentication.Authentication, project: { ocid: string, name?: string }): Promise<{ ocid: string, name: string, httpUrl: string | undefined, sshUrl: string | undefined }[] | undefined> {
    // TODO: rewrite to multistep or anything else displaying progress in QuickPick area
    const choices: dialogs.QuickPickObject[] | undefined = await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Reading available code repositories...',
        cancellable: false
    }, (_progress, _token) => {
        return new Promise(async resolve => {
            ociUtils.listCodeRepositories(authentication.getProvider(), project.ocid).then(repositories => {
                if (!repositories) {
                    resolve(undefined);
                } else {
                    const choices: dialogs.QuickPickObject[] = [];
                    let idx = 0;
                    for (const repository of repositories) {
                        const name = repository.name ? repository.name : `CodeRepository${idx++}`;
                        const description = repository.description ? repository.description : 'Code Repository';
                        const choice = new dialogs.QuickPickObject(name, description, undefined, { ocid: repository.id, name: name, httpUrl: repository.httpUrl, sshUrl: repository.sshUrl });
                        choices.push(choice);
                    }
                    resolve(choices);
                }
            }).catch(err => {
                vscode.window.showErrorMessage('Failed to read code repositories: ' + err.message);
                resolve(undefined);
            });
        });
    });

    if (choices === undefined) {
        return undefined;
    }

    if (choices.length === 0) {
        vscode.window.showWarningMessage(`No code repositories available ${project.name ? 'in devops project ' + project.name : 'in the devops project'}.`);
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

export async function selectOkeCluster(authentication: ociAuthentication.Authentication, compartmentID: string, region: string): Promise<string | undefined> {
    const choices: dialogs.QuickPickObject[] | undefined = await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Reading available OKE clusters...',
        cancellable: false
    }, (_progress, _token) => {
        return new Promise(async resolve => {
            ociUtils.listClusters(authentication.getProvider(), compartmentID).then(clusters => {
                const choices: dialogs.QuickPickObject[] = [];
                for (const cluster of clusters) {
                    if (cluster.name && cluster.id) {
                        choices.push(new dialogs.QuickPickObject(cluster.name, undefined, undefined, cluster.id));
                    }
                }
                resolve(choices);
            }).catch(err => {
                vscode.window.showErrorMessage('Failed to read OKE clusters: ' + err.message);
                resolve(undefined);
            });
        });
    });

    if (choices === undefined) {
        return undefined;
    }

    if (choices.length === 0) {
        const createOption = 'Quick Create Cluster';
        if (createOption === await vscode.window.showWarningMessage('No OKE cluster available.', createOption)) {
            dialogs.openInBrowser(`https://cloud.oracle.com/containers/clusters/quick?region=${region}`);
        }
        return undefined;
    }

    if (choices.length === 1) {
        return choices[0].object;
    }

    const choice = await vscode.window.showQuickPick(choices, {
        placeHolder: 'Select OKE Cluster'
    });

    return choice ? choice.object : undefined;
}
