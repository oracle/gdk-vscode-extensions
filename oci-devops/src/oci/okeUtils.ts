/*
 * Copyright (c) 2022, 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as common from 'oci-common';
import * as dialogs from '../../../common/lib/dialogs';
import * as logUtils from '../../../common/lib/logUtils';
import * as ociUtils from './ociUtils';
import * as ociDialogs from './ociDialogs';
import * as ociFeatures from './ociFeatures';


const ACTION_NAME = 'Select OKE Cluster';

export async function selectOkeCluster(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string, region: string, autoSelect: boolean = false, compartmentName: string | undefined = undefined, allowSkip: boolean = false): Promise<{id: string; compartmentId: string; vcnID?: string} | null | undefined> {
    const existingContentChoices: dialogs.QuickPickObject[] | undefined = await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Reading available OKE clusters...',
        cancellable: false
    }, (_progress, _token) => {
        return new Promise(async resolve => {
            if (!compartmentName) {
                try {
                    compartmentName = (await ociUtils.getCompartment(authenticationDetailsProvider, compartmentID)).name;
                } catch (_err) {
                    compartmentName = '<unknown>';
                }
            }
            logUtils.logInfo(`[oci] Listing clusters in compartment ${compartmentID}`);
            ociUtils.listClusters(authenticationDetailsProvider, compartmentID).then(clusters => {
                const choices: dialogs.QuickPickObject[] = [];
                for (const cluster of clusters) {
                    if (cluster.name && cluster.id  && cluster.compartmentId) {
                        const description = `Kubernetes version: ${cluster.kubernetesVersion ? cluster.kubernetesVersion : 'unknown'}`;
                        choices.push(new dialogs.QuickPickObject(`$(globe) ${cluster.name}`, undefined, description, { id: cluster.id, compartmentId: cluster.compartmentId, vcnID: cluster.vcnId }));
                    }
                }
                resolve(choices);
            }).catch(err => {
                logUtils.logError(`[oci] Could not list OKE clusters from compartment ${compartmentID}`);
                dialogs.showErrorMessage('Failed to read available OKE clusters', err);
                resolve(undefined);
            });
        });
    });

    logUtils.logInfo(`[oci] Listed existing clusters: ${JSON.stringify(existingContentChoices)}`);

    if (allowSkip && !existingContentChoices?.length) {
        const createOption = 'Create New or Choose Existing OKE Cluster';
        const cancelOption = 'Skip OKE Support';
        const options = ociFeatures.MANAGE_VIEW_ITEMS_ENABLED ? [createOption, cancelOption] : [createOption];
        const msg = 'No OKE cluster in compartment.';
        const sel = await vscode.window.showWarningMessage(msg, ...options);
        if (!sel) {
            logUtils.logInfo(`[oci] Clusters skipped.`);
            return undefined;
        } else if (sel === cancelOption) {
            logUtils.logInfo(`[oci] Deployment cancelled because of no clusters.`);
            return null;
        }
    }

    // NOTE: If there's exactly one OKE cluster in the selected compartment, we'll select it implicitly for the user
    //       This makes it easier to use in preconfigured (demo) environments, but might not be the best approach for real usage
    if (autoSelect && existingContentChoices && existingContentChoices.length === 1) {
        logUtils.logInfo(`[oci] Selected cluster ${existingContentChoices[0].object.id}`);
        return existingContentChoices[0].object;
    }

    const newContent = async (): Promise<undefined> => {
        dialogs.openInBrowser(`https://cloud.oracle.com/containers/clusters/quick?region=${region}`);
        // TODO: display notification to wait for a while?
        return undefined;
    };
    const newContentChoice: dialogs.QuickPickObject = new dialogs.QuickPickObject(`$(add) New OKE Cluster`, undefined, 'Create new OKE cluster in this compartment', newContent);
    
    const switchCompartment = async (): Promise<{id: string; compartmentId: string; vcnID?: string} | null | undefined> => {
        const compartment = await ociDialogs.selectCompartment(authenticationDetailsProvider, ACTION_NAME, [ compartmentID ]);
        if (compartment) {
            return selectOkeCluster(authenticationDetailsProvider, compartment.ocid, region, false, compartment.name, false);
        }
        return undefined;
    };
    const switchCompartmentChoice: dialogs.QuickPickObject = new dialogs.QuickPickObject(`$(arrow-small-right) Change OKE compartment...`, undefined, undefined, switchCompartment);
    
    const choices: dialogs.QuickPickObject[] = [];
    if (existingContentChoices?.length) {
        choices.push(dialogs.QuickPickObject.separator('Create New'));
    }
    choices.push(newContentChoice);
    if (existingContentChoices?.length) {
        choices.push(dialogs.QuickPickObject.separator('Add Existing'));
        choices.push(...existingContentChoices);
    }
    choices.push(switchCompartmentChoice);

    logUtils.logInfo(`[oci] Selecting OKE cluster: ${JSON.stringify(choices)}`);
    const choice = await vscode.window.showQuickPick(choices, {
        title: `${ACTION_NAME} in ${compartmentName}`,
        placeHolder: `Select target OKE cluster${existingContentChoices?.length ? '' : ' (no clusters available in this compartment)'}`
    });

    if (choice) {
        if (typeof choice.object === 'function') {
            return await choice.object();
        } else {
            return choice.object;
        }
    }
    return undefined;
}
