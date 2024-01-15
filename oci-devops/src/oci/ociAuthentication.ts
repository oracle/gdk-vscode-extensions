/*
 * Copyright (c) 2022, 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as common from 'oci-common';
import * as dialogs from '../../../common/lib/dialogs';
import * as dataSupport from './dataSupport';
import * as ociDialogs from './ociDialogs';


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
    return createCustom(undefined, profile === CONFIG_FILE_PROFILE_DEFAULT ? undefined : profile);
}

export function createDefault(): Authentication {
    let provider: common.ConfigFileAuthenticationDetailsProvider;
    try {
        provider = createProvider();
    } catch (err) {
        return new Authentication(undefined, dialogs.getErrorMessage('Failed to initialize OCI authentication', err));
    }
    return new Authentication(provider);
}

export function createCustom(configFile: string | undefined, profile: string | undefined): Authentication {
    let provider: common.ConfigFileAuthenticationDetailsProvider;
    try {
        provider = createProvider(configFile, profile);
    } catch (err) {
        return new Authentication(undefined, dialogs.getErrorMessage('Failed to initialize OCI authentication', err));
    }
    return new Authentication(provider);
}

export async function resolve(actionName?: string, profile?: string): Promise<Authentication | undefined> {
    try {
        const defaultConfig = getDefaultConfigFile();
        if (!fs.existsSync(defaultConfig)) {
            return new Authentication(undefined, `Required config file missing: ${defaultConfig}. Follow [the documentation](https://docs.oracle.com/en-us/iaas/Content/API/Concepts/sdkconfig.htm) to create the config file.`);
        }
        const profiles = listProfiles(defaultConfig);
        if (profiles.length) {
            let provider: common.ConfigFileAuthenticationDetailsProvider;
            if (!profile && profiles.length === 1 && profiles[0] === common.ConfigFileReader.DEFAULT_PROFILE_NAME) {
                provider = createProvider(defaultConfig);
            } else if (profile && profiles.includes(profile)) {
                provider = createProvider(defaultConfig, profile);
            } else {
                const selected = await ociDialogs.selectOciProfileFromList(profiles, false, actionName);
                if (!selected) {
                    return undefined;
                }
                provider = createProvider(defaultConfig, selected);
            }
            return new Authentication(provider);
        } else {
            return new Authentication(undefined, `No profiles defined in config file ${defaultConfig}. Follow [the documentation](https://docs.oracle.com/en-us/iaas/Content/API/Concepts/sdkconfig.htm) to setup the config file.`);
        }
    } catch (err) {
        return new Authentication(undefined, dialogs.getErrorMessage('Failed to initialize OCI authentication', err));
    }
}

export function createProvider(configurationFilePath?: string, profile?: string): common.ConfigFileAuthenticationDetailsProvider {
    const provider = new common.ConfigFileAuthenticationDetailsProvider(configurationFilePath, profile);
    fixCurrentProfile(provider, profile);
    return provider;
}

function fixCurrentProfile(provider: common.ConfigFileAuthenticationDetailsProvider, profile: string | undefined) {
    const credentials = provider.getProfileCredentials();
    if (credentials) {
        credentials.currentProfile = profile ? profile : common.ConfigFileReader.DEFAULT_PROFILE_NAME;
    }
}

export function getDefaultConfigFile(): string {
    const defaultPath = common.ConfigFileReader.DEFAULT_FILE_PATH;
    const expandedPath = common.ConfigFileReader.expandUserHome(defaultPath);
    const normalizedPath = path.normalize(expandedPath);
    return normalizedPath;
}

export function listProfiles(configFile: string): string[] {
    const profiles: string[] = [];
    const file = fs.readFileSync(configFile).toString();
    const lines = file.length === 0 ? [] : file.split(/\r?\n/);
    for (let line of lines) {
        line = line.trim();
        if (line.startsWith('[') && line.endsWith(']')) {
            profiles.push(line.slice(1, -1));
        }
    }
    return profiles;
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

    getProfile(): string {
        if (!this.provider) {
            throw new Error('Authentication provider not initialized');
        }
        const currentProfile = this.provider.getProfileCredentials()?.currentProfile;
        return currentProfile ? currentProfile : common.ConfigFileReader.DEFAULT_PROFILE_NAME;
    }

    getData(): any {
        if (!this.provider) {
            throw new Error('Authentication provider not initialized');
        }
        const currentProfile = this.provider.getProfileCredentials()?.currentProfile;
        const profile = currentProfile === common.ConfigFileReader.DEFAULT_PROFILE_NAME ? undefined : currentProfile;
        const data = {
            type: AUTH_TYPE_CONFIG_FILE,
            path: CONFIG_FILE_PATH_DEFAULT,
            profile: profile ? profile : CONFIG_FILE_PROFILE_DEFAULT
        };
        return data;
    }

}
