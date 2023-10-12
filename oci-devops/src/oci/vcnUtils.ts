/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as common from 'oci-common';
import * as dialogs from '../../../common/lib/dialogs';
import * as ociUtils from './ociUtils';


export async function selectNetwork(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, vcnID: string): Promise<{id: string; compartmentID: string} | undefined> {
    return await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Reading cluster network configuration...',
        cancellable: false
    }, (_progress, _token) => {
        return new Promise(async resolve => {
            try {
                const vcn = await ociUtils.getVCN(authenticationDetailsProvider, vcnID);
                const subnets = await ociUtils.listSubnets(authenticationDetailsProvider, vcn.compartmentId, vcnID);
                for (const subnet of subnets) {
                    if (subnet.securityListIds) {
                        for (const secListId of subnet.securityListIds) {
                            const secList = await ociUtils.getSecurityList(authenticationDetailsProvider, secListId);
                            for (const rule of secList.egressSecurityRules) {
                                if (rule.protocol === 'all' && rule.destination === '0.0.0.0/0') {
                                    resolve({ id: subnet.id, compartmentID: subnet.compartmentId });
                                    return;
                                }
                            }
                        }
                    }
                }
                dialogs.showErrorMessage('Failed to resolve cluster network configuration');
                resolve(undefined);
            } catch (err) {
                dialogs.showErrorMessage('Failed to read cluster network configuration', err);
                resolve(undefined);
            }
        });
    });
}
