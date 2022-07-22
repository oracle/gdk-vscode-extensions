/*
 * Copyright (c) 2022, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as model from '../model';
import * as nodes from '../nodes';
import * as ociSupport from './ociSupport';
import * as ociContext from './ociContext';

export class ServicePlugin {

    private serviceType: string;

    constructor(serviceType: string) {
        this.serviceType = serviceType;
    }

    getServiceType() {
        return this.serviceType;
    }

    buildInline(_oci: ociContext.Context, _services: any, _treeChanged: nodes.TreeChanged): nodes.BaseNode[] | undefined {
        return undefined;
    }

    buildContainers(_oci: ociContext.Context, _services: any, _treeChanged: nodes.TreeChanged): nodes.BaseNode[] | undefined {
        return undefined;
    }

    importServices(_oci: ociContext.Context): Promise<any | undefined> {
        return Promise.resolve(undefined);
    }

}

export class OciServices implements model.CloudServices {

    private oci: ociContext.Context;
    private data: any;
    private dataChanged: ociSupport.DataChanged;

    constructor(oci: ociContext.Context, data: any, dataChanged: ociSupport.DataChanged) {
        this.oci = oci;
        this.data = data;
        this.dataChanged = dataChanged;
    }

    buildNodes(treeChanged: nodes.TreeChanged): nodes.BaseNode[] {
        const serviceNodes: nodes.BaseNode[] = [];

        const ociConfigProblem = this.oci.getConfigurationProblem();
        if (ociConfigProblem) {
            serviceNodes.push(new nodes.TextNode(`<${ociConfigProblem}>`));
        } else {
            for (const featurePlugin of ociSupport.SERVICE_PLUGINS) {
                const featureServices = this.data.services?.[featurePlugin.getServiceType()];
                if (featureServices) {
                    const inline = featurePlugin.buildInline(this.oci, featureServices, treeChanged);
                    if (inline) {
                        serviceNodes.push(...inline);
                    }
                }
            }
            for (const featurePlugin of ociSupport.SERVICE_PLUGINS) {
                const featureServices = this.data.services?.[featurePlugin.getServiceType()];
                if (featureServices) {
                    const containers = featurePlugin.buildContainers(this.oci, featureServices, treeChanged);
                    if (containers) {
                        serviceNodes.push(...containers);
                    }
                }
            }
        }

        return serviceNodes;
    }

}
