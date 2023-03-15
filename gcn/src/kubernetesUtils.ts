/*
 * Copyright (c) 2022, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as k8s from 'vscode-kubernetes-tools-api';
import * as dialogs from './dialogs';

export async function getKubectlAPI(): Promise<k8s.KubectlV1 | undefined> {
    const kubectl = await k8s.extension.kubectl.v1;
    if (!kubectl.available) {
        dialogs.showErrorMessage(`Kubectl API not available: ${kubectl.reason}`);
        return;
    }
    return kubectl.api;
}

export async function getConfig(): Promise<any> {
    const kubectl = await getKubectlAPI();
    if (kubectl) {
        const command = `config view -o json`;
        const result: k8s.KubectlV1.ShellResult | undefined = await kubectl.invokeCommand(command);
        if (result && result.code === 0) {
            return JSON.parse(result.stdout);
        }
    }
    return undefined;
}

export async function getDeployment(deploymentName: string): Promise<any> {
    const kubectl = await getKubectlAPI();
    if (kubectl) {
        const command = `get deployment ${deploymentName} -o json`;
        const result: k8s.KubectlV1.ShellResult | undefined = await kubectl.invokeCommand(command);
        if (result && result.code === 0) {
            return JSON.parse(result.stdout);
        }
    }
    return undefined;
}

export async function isCurrentCluster(clusterId: string): Promise<boolean> {
    const kubectl = await getKubectlAPI();
    if (kubectl) {
        const config = await getConfig();
        if (config) {
            const currentContext = config.contexts?.find((context: any) => context.name === config['current-context']);
            if (currentContext) {
                return config.users?.find((user: any) => user.user?.exec?.args?.includes(clusterId));
            }
        }
    }
    return false;
}
