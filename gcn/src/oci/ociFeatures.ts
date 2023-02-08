/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';


export const CONTAINER_INSTANCES_ENABLED: boolean = containerInstancesEnabled();
export const NI_PIPELINES_ENABLED: boolean = niPipelinesEnabled();


export function initialize() {
    if (CONTAINER_INSTANCES_ENABLED) {
        vscode.commands.executeCommand('setContext', 'gcn.oci.containerInstancesEnabled', true);
    }
}


function containerInstancesEnabled(): boolean {
    return vscode.workspace.getConfiguration('gcn').get<boolean>('containerInstancesEnabled') === true;
}

function niPipelinesEnabled(): boolean {
    return vscode.workspace.getConfiguration('gcn').get<boolean>('niPipelinesEnabled') === true;
}
