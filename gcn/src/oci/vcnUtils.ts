/*
 * Copyright (c) 2022, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as common from 'oci-common';
import * as dialogs from '../dialogs';
import * as ociUtils from './ociUtils';
import * as ociDialogs from './ociDialogs';


const ACTION_NAME = 'Select Network Configuration';

export async function selectNetwork(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string, vcnID?: string, autoSelect: boolean = true, compartmentName: string | undefined = undefined): Promise<{vcnID: string; subnetID: string} | undefined> {
    const existingChoices: dialogs.QuickPickObject[] | undefined = await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Reading available network configurations...',
        cancellable: false
    }, (_progress, _token) => {
        return new Promise(async resolve => {
            try {
                if (autoSelect && vcnID) {
                    const vcn = await ociUtils.getVCN(authenticationDetailsProvider, vcnID);
                    const subnets = await ociUtils.listSubnets(authenticationDetailsProvider, vcn.compartmentId, vcnID);
                    for (const subnet of subnets) {
                        if (subnet.prohibitPublicIpOnVnic) {
                            resolve([new dialogs.QuickPickObject(`$(gear) ${subnet.displayName}`, undefined, undefined, { vcnID, subnetID: subnet.id })]);
                            return;
                        }
                    }
                }
                if (!compartmentName) {
                    try {
                        compartmentName = (await ociUtils.getCompartment(authenticationDetailsProvider, compartmentID)).name;
                    } catch (_err) {
                        compartmentName = '<unknown>';
                    }
                }
                const choices: dialogs.QuickPickObject[] = [];
                const vcns = await ociUtils.listVCNs(authenticationDetailsProvider, compartmentID);
                for (const vcn of vcns) {
                    const subnets = await ociUtils.listSubnets(authenticationDetailsProvider, vcn.compartmentId, vcn.id);
                    if (subnets.length) {
                        choices.push(dialogs.QuickPickObject.separator(vcn.displayName || ''));
                    }
                    for (const subnet of subnets) {
                        choices.push(new dialogs.QuickPickObject(`$(gear) ${subnet.displayName}`, undefined, undefined, { vcnID, subnetID: subnet.id }));
                    }
                }
                resolve(choices);
            } catch (err) {
                dialogs.showErrorMessage('Failed to read available network configurations', err);
                resolve(undefined);
            }
        });
    });

    if (autoSelect && existingChoices?.length === 1) {
        return existingChoices[0].object;
    }

    const newContent = async (): Promise<undefined> => {
        dialogs.openInBrowser(`https://cloud.oracle.com/networking/vcns?region=${authenticationDetailsProvider.getRegion().regionId}`);
        return undefined;
    };
    const newContentChoice: dialogs.QuickPickObject = new dialogs.QuickPickObject(`$(add) New VCN`, undefined, 'Create new Virtual Cloud Network', newContent);

    const switchCompartment = async (): Promise<{vcnID: string; subnetID: string} | undefined> => {
        const compartment = await ociDialogs.selectCompartment(authenticationDetailsProvider, ACTION_NAME, [ compartmentID ]);
        if (compartment) {
            return selectNetwork(authenticationDetailsProvider, compartment.ocid, undefined, false);
        }
        return undefined;
    };
    const switchCompartmentChoice: dialogs.QuickPickObject = new dialogs.QuickPickObject(`$(arrow-small-right) Change compartment...`, undefined, undefined, switchCompartment);

    const choices: dialogs.QuickPickObject[] = [];
    if (existingChoices?.length) {
        choices.push(dialogs.QuickPickObject.separator('Create New'));
    }
    choices.push(newContentChoice);
    if (existingChoices?.length) {
        choices.push(...existingChoices);
    }
    choices.push(switchCompartmentChoice);

    const choice = await vscode.window.showQuickPick(choices, {
        title: `${ACTION_NAME} in ${compartmentName}`,
        placeHolder: `Select target network configuration${existingChoices?.length ? '' : ' (no network configurations available in this compartment)'}`
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
