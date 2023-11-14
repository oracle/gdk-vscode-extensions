/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as applications from '../applications';
import * as beanHandler from './beanHandler';


const RELATIVE_ADDRESS = '/health';

export function forApplication(application: applications.Application) {
    return new HealthEndpoint(application);
}

export class HealthEndpoint extends beanHandler.UpdatableBeanHandler {

    constructor(application: applications.Application) {
        super(application, RELATIVE_ADDRESS)
    }

    protected async processResponse(response: { code: number | undefined; headers: any; data: any }) {
        // console.log('-------- HEALTH ---------------------')
        const data = JSON.parse(response.data);
        this.notifyUpdated(data);
        // console.log(health)
    }

    buildVmArgs(): string | undefined {
        // if (!this.isEnabled()) {
        //     return undefined;
        // }
        return '-Dendpoints.health.enabled=true -Dendpoints.health.sensitive=false -Dendpoints.health.details-visible=ANONYMOUS';
    }

}