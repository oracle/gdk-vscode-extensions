/*
 * Copyright (c) 2022, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as common from 'oci-common';
import * as ociAuthentication from './ociAuthentication';
import * as dataSupport from './dataSupport';


export const DATA_NAME = 'context';

export function create(authentication: ociAuthentication.Authentication, data: any, _dataChanged?: dataSupport.DataChanged): Context {
    if (!data) {
        return new Context(authentication, undefined, undefined, undefined, 'context config missing');
    }
    const compartment: any | undefined = data.compartment;
    if (typeof compartment !== 'string') {
        return new Context(authentication, undefined, undefined, undefined, 'compartment context missing');
    }
    const devopsProject: any | undefined = data.devopsProject;
    if (typeof devopsProject !== 'string') {
        return new Context(authentication, undefined, undefined, undefined, 'devops project context missing');
    }
    const codeRepository: any | undefined = data.codeRepository;
    if (typeof codeRepository !== 'string') {
        return new Context(authentication, undefined, undefined, undefined, 'code repository context missing');
    }
    return new Context(authentication, compartment as string, devopsProject as string, codeRepository as string);
}

export class Context implements dataSupport.DataProducer {

    private authentication: ociAuthentication.Authentication;
    private compartmentID: string | undefined;
    private devopsProjectID: string | undefined;
    private codeRepositoryID: string | undefined;
    private configurationProblem: string | undefined;

    constructor(authentication: ociAuthentication.Authentication, compartmentID: string | undefined, devopsProjectID: string | undefined, codeRepositoryID: string | undefined, configurationProblem?: string | undefined) {
        this.authentication = authentication;
        this.compartmentID = compartmentID;
        this.devopsProjectID = devopsProjectID;
        this.codeRepositoryID = codeRepositoryID;
        this.configurationProblem = configurationProblem;
    }

    getConfigurationProblem(): string | undefined {
        const authenticationProblem = this.authentication.getConfigurationProblem();
        return authenticationProblem ? authenticationProblem : this.configurationProblem;
    }

    getProvider(): common.ConfigFileAuthenticationDetailsProvider {
        return this.authentication.getProvider();
    }

    getCompartment(): string {
        if (!this.compartmentID) {
            throw new Error('Compartment OCID not initialized');
        }
        return this.compartmentID;
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

    getDataName(): string {
        return DATA_NAME;
    }

    getData(): any {
        const data = {
            compartment: this.compartmentID,
            devopsProject: this.devopsProjectID,
            codeRepository: this.codeRepositoryID
        }
        return data;
    }

}
