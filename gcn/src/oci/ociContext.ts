/*
 * Copyright (c) 2022, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as common from 'oci-common';
const AUTH_TYPE_CONFIG_FILE = 'configFile';
const CONFIG_FILE_PATH_DEFAULT = 'default';
const CONFIG_FILE_PROFILE_DEFAULT = 'default';

export function create(folder: vscode.Uri, data: any): Context {
    const authorization = data.authorization;
    if (!authorization) {
        return new Context(folder, undefined, undefined, undefined, undefined, 'Authorization config missing');
    }
    const type: any = authorization.type;
    if (type !== AUTH_TYPE_CONFIG_FILE) {
        return new Context(folder, undefined, undefined, undefined, undefined, `Unsupported authorization type: ${type}`);
    }
    const path = authorization.path;
    if (path !== CONFIG_FILE_PATH_DEFAULT) {
        return new Context(folder, undefined, undefined, undefined, undefined, `Unsupported config file path: ${path}`);
    }
    const profile = authorization.profile;
    if (profile !== CONFIG_FILE_PROFILE_DEFAULT) {
        return new Context(folder, undefined, undefined, undefined, undefined, `Unsupported config file profile: ${profile}`);
    }
    let provider: common.ConfigFileAuthenticationDetailsProvider;
    try {
        provider = new common.ConfigFileAuthenticationDetailsProvider();
    } catch (err) {
        return new Context(folder, undefined, undefined, undefined, undefined, `Failed to initialize authorization provider: ${err}`);
    }
    const context = data.context;
    return new Context(folder, provider, context.compartment?.ocid, context.devopsProject?.ocid, context.codeRepository?.ocid);
}

export class Context  {

    private folder: vscode.Uri;
    private provider: common.ConfigFileAuthenticationDetailsProvider | undefined;
    private compartmentID: string | undefined;
    private devopsProjectID: string | undefined;
    private codeRepositoryID: string | undefined;

    private configurationProblem: string | undefined;

    constructor (folder: vscode.Uri, provider: common.ConfigFileAuthenticationDetailsProvider | undefined, compartmentID: string | undefined, devopsProjectID: string | undefined, codeRepositoryID: string | undefined, configurationProblem?: string | undefined) {
        this.folder = folder;
        this.provider = provider;
        this.compartmentID = compartmentID;
        this.devopsProjectID = devopsProjectID;
        this.codeRepositoryID = codeRepositoryID;
        this.configurationProblem = configurationProblem;
    }

    getConfigurationProblem(): string | undefined {
        return this.configurationProblem;
    }

    getFolder(): vscode.Uri {
        return this.folder;
    }

    getProvider(): common.ConfigFileAuthenticationDetailsProvider {
        if (!this.provider) {
            throw new Error('Authentication provider not initialized');
        }
        return this.provider;
    }

    getCompartment(): string {
        if (!this.compartmentID) {
            throw new Error('Compartment OCID not initialized');
        }
        return this.compartmentID;
    }

    getHomeCompartment(): string {
        return '';
    }

    getParentCompartment(): string {
        return '';
    }

    getDevOpsProject(): string {
        if (!this.devopsProjectID) {
            throw new Error('Devops project OCID not initialized');
        }
        return this.devopsProjectID;
    }

    getCodeRepository(): string {
        if (!this.codeRepositoryID) {
            throw new Error('Code repository OCID not initialized');
        }
        return this.codeRepositoryID;
    }

    store(data: any) {
        const authorization = {
            type: AUTH_TYPE_CONFIG_FILE,
            path: CONFIG_FILE_PATH_DEFAULT,
            profile: CONFIG_FILE_PROFILE_DEFAULT
        }
        data.authorization = authorization;
        const context = {
            compartment: {
                'ocid': this.compartmentID
            },
            devopsProject: {
                'ocid': this.devopsProjectID
            },
            codeRepository: {
                'ocid': this.codeRepositoryID
            }
        }
        data.context = context;
    }

}
