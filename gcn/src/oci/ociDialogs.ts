/*
 * Copyright (c) 2022, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as common from 'oci-common';
import * as dialogs from '../dialogs';
import * as dockerUtils from '../dockerUtils';
import * as kubernetesUtils from '../kubernetesUtils';
import * as logUtils from '../logUtils';
import * as ociNodes from './ociNodes';
import * as ociUtils from './ociUtils';

export async function selectOciProfileFromList(profiles: string[], autoselect: boolean, actionName?: string): Promise<string | null | undefined> {
    if (!profiles.length) {
        return null;
    }
    if (autoselect && profiles.length === 1) {
        return profiles[0];
    }
    const choices: dialogs.QuickPickObject[] = [];
    for (const p of profiles) {
        choices.push(new dialogs.QuickPickObject(p, undefined, undefined));
    }
    const selected = await vscode.window.showQuickPick(choices, {
        title: actionName ? `${actionName}: Select OCI Profile` : undefined,
        placeHolder: 'Select OCI profile'
    });
    if (selected) {
        return selected.label;
    }
    return undefined;
}

export async function selectCompartment(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, actionName?: string, ignore?: string[]): Promise<{ ocid: string, name: string } | undefined> {
    // TODO: rewrite to multistep or anything else displaying progress in QuickPick area
    // TODO: add root compartment
    const choices: dialogs.QuickPickObject[] | undefined = await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Reading available compartments...',
        cancellable: false
    }, (_progress, _token) => {
        return new Promise(async resolve => {
            ociUtils.listCompartments(authenticationDetailsProvider).then(async compartments => {
                if (!compartments) {
                    resolve(undefined);
                } else {
                    const compartmentsMap: any = {};
                    for (const compartment of compartments) {
                        compartmentsMap[compartment.id] = compartment;
                    }
                    const choices: dialogs.QuickPickObject[] = [];
                    for (const compartment of compartments) {
                        if (!ignore?.includes(compartment.id)) { // doesn't filter-out root compartment
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
                    }
                    dialogs.sortQuickPickObjectsByName(choices);
                    const tenancy = await ociUtils.getTenancy(authenticationDetailsProvider);
                    const rootCompartmentName = tenancy.name ? `${tenancy.name} (root)` : 'root';
                    choices.unshift(new dialogs.QuickPickObject(rootCompartmentName, `Root of the${tenancy.name ? ' ' + tenancy.name : ''} tenancy`, undefined, { ocid: tenancy.id, name: rootCompartmentName }));
                    resolve(choices);
                }
            }).catch(err => {
                dialogs.showErrorMessage('Failed to read compartments', err);
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
        title: actionName ? `${actionName}: Select Compartment` : undefined,
        placeHolder: 'Select compartment'
    });

    return choice ? choice.object : undefined;
}

export async function selectDevOpsProject(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartment: { ocid: string, name?: string }, actionName?: string): Promise<{ ocid: string, name: string } | undefined> {
    // TODO: rewrite to multistep or anything else displaying progress in QuickPick area
    const choices: dialogs.QuickPickObject[] | undefined = await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Reading available devops projects...',
        cancellable: false
    }, (_progress, _token) => {
        return new Promise(async resolve => {
            ociUtils.listDevOpsProjects(authenticationDetailsProvider, compartment.ocid).then(projects => {
                const choices: dialogs.QuickPickObject[] = [];
                for (const project of projects) {
                    const description = project.description ? project.description : 'DevOps Project';
                    const choice = new dialogs.QuickPickObject(project.name, description, undefined, { ocid: project.id, name: project.name });
                    choices.push(choice);
                }
                resolve(choices);
            }).catch(err => {
                dialogs.showErrorMessage('Failed to read devops projects', err);
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
        title: actionName ? `${actionName}: Select DevOps Project` : undefined,
        placeHolder: 'Select devops project'
    });

    return choice ? choice.object : undefined;
}

export async function selectDevOpsProjectFromList(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, projects: string[], autoselect: boolean, actionName?: string): Promise<{ ocid: string, name: string, compartment: string } | null | undefined> {
    if (!projects.length) {
        return null;
    }
    const choices: dialogs.QuickPickObject[] = await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Processing devops projects...',
        cancellable: false
    }, (_progress, _token) => {
        return new Promise(async resolve => {
            const choices: dialogs.QuickPickObject[] = [];
            for (const projectOCID of projects) {
                try {
                    const project = await ociUtils.getDevopsProject(authenticationDetailsProvider, projectOCID);
                    const description = project.description ? project.description : 'DevOps Project';
                    const choice = new dialogs.QuickPickObject(project.name, description, undefined, { ocid: project.id, name: project.name, compartment: project.compartmentId });
                    choices.push(choice);
                } catch (err) {
                    logUtils.logError(dialogs.getErrorMessage('Failed to process devops project', err));
                }
            }
            resolve(choices);
        });
    });

    if (!choices.length) {
        return null;
    }

    if (autoselect && choices.length === 1) {
        return choices[0].object;
    }

    const choice = await vscode.window.showQuickPick(choices, {
        title: actionName ? `${actionName}: Select DevOps Project` : undefined,
        placeHolder: 'Select devops project'
    });

    return choice ? choice.object : undefined;
}

export async function selectCodeRepositories(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, project: { ocid: string, name?: string }, autoselect: boolean, actionName?: string, ignore?: string[]): Promise<{ ocid: string, name: string, httpUrl: string | undefined, sshUrl: string | undefined }[] | undefined> {
    // TODO: rewrite to multistep or anything else displaying progress in QuickPick area
    const choices: dialogs.QuickPickObject[] | undefined = await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Reading available code repositories...',
        cancellable: false
    }, (_progress, _token) => {
        return new Promise(async resolve => {
            ociUtils.listCodeRepositories(authenticationDetailsProvider, project.ocid).then(repositories => {
                if (!repositories) {
                    resolve(undefined);
                } else {
                    const choices: dialogs.QuickPickObject[] = [];
                    let idx = 0;
                    for (const repository of repositories) {
                        if (!ignore || !ignore.includes(repository.id)) {
                            if (repository.freeformTags?.gcn_tooling_deployIncomplete !== 'true') {
                                const name = repository.name ? repository.name : `CodeRepository${idx++}`;
                                const description = repository.description ? repository.description : 'Code Repository';
                                const choice = new dialogs.QuickPickObject(name, description, undefined, { ocid: repository.id, name: name, httpUrl: repository.httpUrl, sshUrl: repository.sshUrl });
                                choices.push(choice);
                            }
                        }
                    }
                    resolve(choices);
                }
            }).catch(err => {
                dialogs.showErrorMessage('Failed to read code repositories', err);
                resolve(undefined);
            });
        });
    });

    if (choices === undefined) {
        return undefined;
    }

    if (choices.length === 0) {
        vscode.window.showWarningMessage(`All code repositories already imported or no code repositories available in ${project.name ? 'devops project ' + project.name : 'the devops project'}.`);
        return undefined;
    }

    if (autoselect && choices.length === 1) {
        return [ choices[0].object ];
    }

    const choice = await vscode.window.showQuickPick(choices, {
        title: actionName ? `${actionName}: Select Code Repositories` : undefined,
        placeHolder: 'Select code repositories',
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

export async function getUserCredentials(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, actionName?: string, namespace?: string): Promise<{ username: string, password: string, tokenId?: string } | undefined> {
    try {
        const user = await ociUtils.getUser(authenticationDetailsProvider, authenticationDetailsProvider.getUser());
        let authToken: any;
        try {
            authToken = await ociUtils.createAuthToken(authenticationDetailsProvider);
        } catch (err) {}
        const password = authToken?.token ? authToken?.token : await inputPassword(user.name, actionName);
        if (password === undefined) {
            return undefined;
        }
        if (!namespace) {
            namespace = await ociUtils.getObjectStorageNamespace(authenticationDetailsProvider);
        }
        if (authToken) {
            await ociUtils.completion(1000, () => ociUtils.getAuthToken(authenticationDetailsProvider, authToken.id).then(token => token?.lifecycleState));
        }
        return { username: `${namespace}/${user.name}`, password, tokenId: authToken?.id };
    } catch (err) {
        dialogs.showErrorMessage('Failed to get username and password', err);
        return undefined;
    }
}

export async function getKubeSecret(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, okeCluster: string, secretName: string, actionName?: string, namespace?: string): Promise<string | null | undefined> {
    return vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Creating K8s secret to enable pulling Docker Images from private OCIR repository...',
        cancellable: false
    }, (_progress, _token) => {
        return new Promise(async resolve => {
            if (!await kubernetesUtils.isCurrentCluster(okeCluster)) {
                const setup = 'Setup local access to destination OKE cluster';
                if (setup === await dialogs.showErrorMessage('Kuberners extension not configured to access the destination OKE cluster.', undefined, setup)) {
                    ociNodes.openInConsole({ getAddress: () => `https://cloud.oracle.com/containers/clusters/${okeCluster}/quick-start?region=${authenticationDetailsProvider.getRegion().regionId}` });
                }
                resolve(undefined);
                return;
            }
            const secret = await kubernetesUtils.getSecret(secretName);
            if (!secret) {
                const credentials = await getUserCredentials(authenticationDetailsProvider, actionName, namespace);
                if (credentials === undefined) {
                    resolve(undefined);
                    return;
                }
                if (!namespace) {
                    namespace = await ociUtils.getObjectStorageNamespace(authenticationDetailsProvider);
                }
                const success = await kubernetesUtils.createSecret(secretName, `${authenticationDetailsProvider.getRegion().regionCode}.ocir.io`, credentials.username, credentials.password);
                if (!success) {
                    dialogs.showErrorMessage('Cannot create K8s secret to enable pulling Docker Images from private OCIR repository.');
                    resolve(null);
                    return;
                }
            }
            resolve(secretName);
        });
    });
}

export async function pullImage(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, image: string, actionName?: string): Promise<void> {
    return vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: actionName,
        cancellable: true
    }, (progress, token) => {
        const registryEndpoint = `${authenticationDetailsProvider.getRegion().regionCode}.ocir.io`;
        return new Promise<string | null | undefined>(async resolve => {
            let tokenId: string | undefined;
            try {
                progress.report({ message: 'Getting user credentials...' });
                const credentials = await getUserCredentials(authenticationDetailsProvider, actionName);
                if (credentials === undefined) {
                    resolve(null);
                    return;
                }
                tokenId = credentials.tokenId;
                if (token.isCancellationRequested) {
                    resolve(tokenId);
                    return;
                }
                progress.report({ message: 'Docker login...' });
                dockerUtils.login(registryEndpoint, credentials.username, credentials.password);
                if (token.isCancellationRequested) {
                    resolve(tokenId);
                    return;
                }
                progress.report({ message: 'Pulling image...' });
                const process = dockerUtils.pullImage(image);
                token.onCancellationRequested(() => {
                    if (!process.killed) {
                        process.kill();
                    }
                });
                let errMsg = '';
                process.stderr?.on('data', (data) => {
                    errMsg += data;
                });
                process.on('close', () => {
                    if (errMsg) {
                        dialogs.showErrorMessage(errMsg);
                    }
                    resolve(tokenId);
                });
            } catch(err) {
                dialogs.showErrorMessage(undefined, err);
                resolve(tokenId);
            }
        }).then(async tokenId => {
            if (tokenId !== null) {
                try {
                    progress.report({ message: 'Docker logout...' });
                    dockerUtils.logout(registryEndpoint);
                } catch(err) {}
            }
            if (tokenId) {
                try {
                    progress.report({ message: 'Deleting token...' });
                    await ociUtils.deleteAuthToken(authenticationDetailsProvider,tokenId);
                } catch(err) {}
            }
        });
    });
}

async function inputPassword(userName: string, actionName?: string) {
	const selected = await vscode.window.showInputBox({
        title: actionName ? `${actionName}: Input Auth Token` : undefined,
		prompt: `Input Auth Token for '${userName}' to access OCI container registries`,
		password: true,
		ignoreFocusOut: true
    });
    return selected;
}
