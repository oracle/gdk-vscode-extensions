/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as persistenceUtils from '../persistenceUtils';


export const CONTAINER_INSTANCES_ENABLED: boolean = containerInstancesEnabled();
export const NI_PIPELINES_ENABLED: boolean = niPipelinesEnabled();
export const NON_PIPELINE_RESOURCES_ENABLED: boolean = nonPipelineResourcesEnabled();
export const MANAGE_VIEW_ITEMS_ENABLED: boolean = manageViewItemsEnabled();

const NI_RUNNER_SHAPE_DEFAULT_OCPUS = 2;
const NI_RUNNER_SHAPE_DEFAULT_MEMORY_GB = 16;


export function initialize() {
    if (CONTAINER_INSTANCES_ENABLED) {
        vscode.commands.executeCommand('setContext', 'oci.devops.containerInstancesEnabled', true);
    }
    if (MANAGE_VIEW_ITEMS_ENABLED) {
        vscode.commands.executeCommand('setContext', 'oci.devops.manageViewItemsEnabled', true);
    }
}


function containerInstancesEnabled(): boolean {
    return persistenceUtils.getWorkspaceConfiguration().get<boolean>('containerInstancesEnabled') === true;
}

function niPipelinesEnabled(): boolean {
    return persistenceUtils.getWorkspaceConfiguration().get<boolean>('niPipelinesEnabled') !== false;
}

export function niRunnerShapeConfig(): any {
    const shape = persistenceUtils.getWorkspaceConfiguration().get<any>('niRunnerShapeConfig') || {};
    if (!shape.ocpus) {
        shape.ocpus = NI_RUNNER_SHAPE_DEFAULT_OCPUS;
    }
    if (!shape.memoryInGBs) {
        shape.memoryInGBs = NI_RUNNER_SHAPE_DEFAULT_MEMORY_GB;
    }
    shape.buildRunnerType = 'CUSTOM';
    return shape;
}

function nonPipelineResourcesEnabled(): boolean {
    return persistenceUtils.getWorkspaceConfiguration().get<boolean>('nonPipelineResourcesEnabled') !== false;
}

function manageViewItemsEnabled(): boolean {
    return persistenceUtils.getWorkspaceConfiguration().get<boolean>('manageViewItemsEnabled') !== false;
}
