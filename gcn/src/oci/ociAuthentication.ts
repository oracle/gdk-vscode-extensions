/*
 * Copyright (c) 2022, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as common from 'oci-common';
import * as dialogs from '../dialogs';
import * as dataSupport from './dataSupport';


export const DATA_NAME = 'authentication';

const AUTH_TYPE_CONFIG_FILE = 'configFile';
const CONFIG_FILE_PATH_DEFAULT = 'default';
const CONFIG_FILE_PROFILE_DEFAULT = 'default';

export function create(data: any, _dataChanged?: dataSupport.DataChanged): Authentication {
    if (!data) {
        return new Authentication(undefined, 'authentication config missing');
    }
    const type: any | undefined = data.type;
    if (typeof type !== 'string') {
        return new Authentication(undefined, 'authentication type missing');
    }
    if (type !== AUTH_TYPE_CONFIG_FILE) {
        return new Authentication(undefined, `unsupported authentication type: ${type}`);
    }
    const path: any | undefined = data.path;
    if (typeof path !== 'string') {
        return new Authentication(undefined, 'config file path missing');
    }
    if (path !== CONFIG_FILE_PATH_DEFAULT) {
        return new Authentication(undefined, `unsupported config file path: ${path}`);
    }
    const profile: any | undefined = data.profile;
    if (typeof profile !== 'string') {
        return new Authentication(undefined, 'config file profile missing');
    }
    if (profile !== CONFIG_FILE_PROFILE_DEFAULT) {
        return new Authentication(undefined, `unsupported config file profile: ${profile}`);
    }
    return createDefault();
}

export function createDefault(): Authentication {
    let provider: common.ConfigFileAuthenticationDetailsProvider;
    try {
        provider = new common.ConfigFileAuthenticationDetailsProvider();
    } catch (err) {
        return new Authentication(undefined, dialogs.getErrorMessage('Failed to initialize OCI authentication', err));
    }
    return new Authentication(provider);
}

export class Authentication implements dataSupport.DataProducer {

    private provider: common.ConfigFileAuthenticationDetailsProvider | undefined;
    private configurationProblem: string | undefined;

    constructor (provider: common.ConfigFileAuthenticationDetailsProvider | undefined, configurationProblem?: string | undefined) {
        this.provider = provider;
        this.configurationProblem = configurationProblem;
    }

    getConfigurationProblem(): string | undefined {
        return this.configurationProblem;
    }

    getProvider(): common.ConfigFileAuthenticationDetailsProvider {
        if (!this.provider) {
            throw new Error('Authentication provider not initialized');
        }
        return this.provider;
    }

    getDataName(): string {
        return DATA_NAME;
    }

    getData(): any {
        const data = {
            type: AUTH_TYPE_CONFIG_FILE,
            path: CONFIG_FILE_PATH_DEFAULT,
            profile: CONFIG_FILE_PROFILE_DEFAULT
        };
        return data;
    }

}
