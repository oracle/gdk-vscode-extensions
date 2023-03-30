/*
 * Copyright (c) 2022, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as nodes from './nodes';
import * as vscode from 'vscode';
import { DeployOptions } from './oci/deployUtils';

export type DumpDeployData = (data?: any) => any;

export class ServicesConfiguration {

    private type: string;
    private name: string;
    private saveData: () => void;

    public data: any;

    constructor(type: string, name: string, data: any, saveData: () => void) {
        this.type = type;
        this.name = name;
        this.data = data;
        this.saveData = saveData;
    }

    getType(): string {
        return this.type;
    }

    getName(): string {
        return this.name;
    }

    dataChanged() {
        this.saveData();
    }

}

export interface CloudSupport {

    getName(): string;

    getDescription(): string;

    getType(): string;

    importFolders(getFromExisting: boolean): Promise<ImportResult | undefined>;

    deployFolders(folders: vscode.WorkspaceFolder[], addToExisting: boolean, dump: DumpDeployData, DeployOptions? : DeployOptions): Promise<boolean>;

    getServices(folder: vscode.WorkspaceFolder, configuration: ServicesConfiguration): CloudServices | undefined;

    buildingServices(): void;

    populatingView(): void;

    servicesReady(): void;

}

export interface CloudServices {

    setDecorableContainer(container: nodes.DecorableNode): void;

    addContent(): void;

    buildNodes(treeChanged: nodes.TreeChanged): void;

    getNodes(): nodes.BaseNode[];

}

export type ImportResult = {
    folders: string[];
    servicesData: any[];
};
