/*
 * Copyright (c) 2022, 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as dialogs from '../../../common/lib/dialogs';
import * as logUtils from '../../../common/lib/logUtils';
import * as kubernetesUtils from "../kubernetesUtils";
import * as okeUtils from './okeUtils';
import * as common from 'oci-common';
import * as k8s from 'vscode-kubernetes-tools-api';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { expandTemplate } from './deployUtils';
import { RESOURCES } from './ociResources';

export const BEARER_TOKEN_SECRET_NAME = 'docker-bearer-vscode-generated-ocirsecret';
const SECRET_ROTATION_SVC_ACCOUNT = 'create-secret-svc-account';

export async function getContextForClusterId(clusterId: string, provider: common.ConfigFileAuthenticationDetailsProvider): Promise<string | undefined> {
    try {
        await verifyKubectlConfig();
        const contextName = await findClusterNameByClusterId(clusterId, provider);
        logUtils.logInfo(`[deploy] Successfully checked kubectl configuration`);
        return contextName;
    } catch (err: any) {
        const OPEN_DOCS = "How To Configure";
        const CANCEL = "Cancel";
        const choice = await dialogs.showErrorMessage(`Kubectl not configured properly`, err, OPEN_DOCS, CANCEL);
        if (choice === OPEN_DOCS) {
            vscode.commands.executeCommand('vscode.open', vscode.Uri.parse('https://docs.oracle.com/en-us/iaas/Content/ContEng/Tasks/contengdownloadkubeconfigfile.htm#localdownload'));
        }
    }
    return undefined;
}

async function verifyKubectlConfig() {
    const kubectl = await kubernetesUtils.getKubectlAPI();
    const retval = await kubectl?.invokeCommand(`cluster-info`);
    if (retval?.code !== 0) {
        logUtils.logError(`Kubectl not configured properly. exited with status code: ${retval?.code}, stderr: ${retval?.stderr}`);
        throw new Error(`Kubectl not configured properly.`);  
    }
}

async function findClusterNameByClusterId(clusterOCID: string, provider: common.ConfigFileAuthenticationDetailsProvider) {
    const kubectl = await kubernetesUtils.getKubectlAPI();
    const retval = await kubectl?.invokeCommand(`config view -o json`);
    if (retval?.code !== 0) {
        logUtils.logError(`Failed to get kubectl configuration. exited with status code: ${retval?.code}, stderr: ${retval?.stderr}`);
        throw new Error(`Failed to get kubectl configuration`);  
    }
    const configJson = JSON.parse(retval.stdout);
    let userName: string | undefined;
    for (const user of configJson.users) {
        const ocidIdx = user.user?.exec?.args?.indexOf(clusterOCID);

        if (ocidIdx - 1 >= 0 && user.user?.exec?.args?.[ocidIdx - 1] === "--cluster-id") {
            userName = user.name;
            break;
        }
    }
    if (!userName) {
        logUtils.logError(`Failed to find cluster id inside kubectl config`);
        throw new Error(`Failed to find cluster id inside kubectl config`);  
    }

    const contextName: string | undefined = configJson.contexts?.find((c: any)=> c.context?.user === userName)?.name;
    if (!contextName) {
        const clusterName = await okeUtils.getOkeClusterName(provider, clusterOCID);

        logUtils.logError(`Kubectl not configured properly. Cannot find a kubectl context configured for the cluster with OCID: ${clusterOCID}`);
        if (clusterName) {
            throw new Error(`Kubectl not configured properly. Cannot find a kubectl context configured for the cluster: ${clusterName}`); 
        } else {
            throw new Error(`Kubectl not configured properly. Cannot find a kubectl context configured for the cluster with OCID: ${clusterOCID}`);  
        }
    }
    return contextName;
}

export async function createSecretRotationCronJob(cronJobName: string, regionCode: string, contextName?: string) {
    logUtils.logInfo(`[deploy] Creating service account that allows secret creation`);
    await createSvcAccount(contextName);
    logUtils.logInfo(`[deploy] Created service account that allows secret creation`);

    logUtils.logInfo(`[deploy] Creating CronJob: ${cronJobName}, that will rotate secret`);
    await applySecretRotationCronJob(BEARER_TOKEN_SECRET_NAME, cronJobName, `${regionCode}.ocir.io`, contextName);
    logUtils.logInfo(`[deploy] Created CronJob: ${cronJobName}, that will rotate secret`);
}


async function applySecretRotationCronJob(secretName: string, cronJobName: string, repoEndpoint: string, contextName?: string) {
    const kubectl = await kubernetesUtils.getKubectlAPI();
    const cronStartMinute = await getCurrentClusterMinute(kubectl, contextName);
    logUtils.logInfo(`[deploy] Scheduled cronjob at every ${cronStartMinute}th minute`);

    const inlineContent = expandTemplate(RESOURCES['oke_secret_rotation_cronjob.yaml'], {
        repo_endpoint: repoEndpoint,
        secret_name: secretName,
        cron_job_name: cronJobName,
        cron_start_minute: cronStartMinute,
        service_account_name: SECRET_ROTATION_SVC_ACCOUNT
    });

    if (!inlineContent) {
        logUtils.logError(`[deploy] Failed to create service account k8s manifest`);
        throw new Error(`Failed to create service account k8s manifest`);  
    }

    const tmpDir = os.tmpdir();
    const tmpFilePath = path.join(tmpDir, 'tmp-cronjob.yaml');
    fs.writeFileSync(tmpFilePath, inlineContent);

    try {
        const resp = await kubectl?.invokeCommand(`apply -f ${tmpFilePath} ${contextName ? `--context=${contextName}` : ""}`);
        if (resp?.code !== 0) {
            logUtils.logError(`[deploy] Failed to create secret rotation CronJob, exited with code: ${resp?.code} stderr: ${resp?.stderr}`);
            throw new Error(`Failed to create secret rotation CronJob`);  
        }
    } finally {
        fs.unlinkSync(tmpFilePath);
    }
}

// Function returns OKE cluster time (minute part), and we add 2 minutes to it, to ensure that CronJob will be ran right after creation
async function getCurrentClusterMinute(kubectl: k8s.KubectlV1 | undefined, contextName?: string): Promise<string> {
    if (!kubectl) throw new Error("kubectl not available");

    const command = `run time-check ${contextName ? `--context=${contextName}` : ""} --rm -it --image=busybox --restart=Never -- date +%M`;
    const result: k8s.KubectlV1.ShellResult | undefined = await kubectl.invokeCommand(command);
    if (result?.code !== 0) {
        logUtils.logError(`[deploy] Failed to get OKE cluster time, exited with status code: ${result?.code}, stderr: ${result?.stderr}`);
        throw new Error(`Failed to get OKE cluster time`);  
    }
    let minute = undefined;
    const match = result.stdout.match(/^\d+/);

    try {
        if (match) {
            minute = parseInt(match[0], 10);
        } 
    } catch (err: any) {
        logUtils.logError(`[deploy] Failed to extract cluster time: ${err?.message}`);
    }

    if (!minute) {
        throw new Error("Failed to parse OKE cluster time");
    }

    return `${(minute + 2) % 60}`;
}

async function createSvcAccount(contextName?: string) {
    const kubectl = await kubernetesUtils.getKubectlAPI();
    const inlineContent = expandTemplate(RESOURCES['create_secret_service_account.yaml'], {
        service_account_name: SECRET_ROTATION_SVC_ACCOUNT
    });

    if (!inlineContent) {
        logUtils.logError(`[deploy] Failed to create service account k8s manifest`);
        throw new Error(`Failed to create service account k8s manifest`);  
    }

    const tmpDir = os.tmpdir();
    const tmpFilePath = path.join(tmpDir, 'tmp-svc-account.yaml');
    fs.writeFileSync(tmpFilePath, inlineContent);

    try {
        const resp = await kubectl?.invokeCommand(`apply -f ${tmpFilePath} ${contextName ? `--context=${contextName}` : ""}`);
        if (resp?.code !== 0) {
            logUtils.logError(`[deploy] Failed to create service account. exited with code: ${resp?.code} stderr: ${resp?.stderr}`);
            throw new Error(`Failed to create service account`);  
        }
    } finally {
        fs.unlinkSync(tmpFilePath);
    }
}