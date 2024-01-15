/*
 * Copyright (c) 2021, 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';

import * as kubernetes from 'vscode-kubernetes-tools-api';
import * as logUtils from '../../../common/lib/logUtils';
import { collectInfo, createWrapper, RunInfo } from "./kubernetesUtil";
import { kubernetesChannel } from './kubernetesChannel';

const MAX_WAIT_CYCLES = 60;
const WAIT_TIMEOUT = 500; //ms

export async function deployProject() {
    kubernetesChannel.clearAndShow();
    kubernetesChannel.appendLine(`Starting deploy of project`);
    let wrapper =  await createWrapper();
    collectInfo((await wrapper.getProjectInfo()).name)
        .then((runInfo) => wrapper.buildAll(runInfo))
        .then((runInfo) => deploy(runInfo))
        .catch((error) => {
            kubernetesChannel.appendLine(error);
            logUtils.logError(`[projectCreate] info collection failed: ${error}`);
        });
}

async function setEnvDebug(info: RunInfo) {
    let command = `set env deployment/${info.appName} JAVA_TOOL_OPTIONS=-agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=*:5005`;
    logUtils.logInfo(`[projectCreate] invoking command: ${command}`);
	return info.kubectl.invokeCommand(command);
}

export async function deploy(info: RunInfo) {
    let command = `get -f ${info.deploymentFile} -o jsonpath='{.metadata.name}'`;
    logUtils.logInfo(`[projectCreate] invoking command: ${command}`);
    let result = await info.kubectl.invokeCommand(command);
    let deploymentName: string | undefined;
    if (result?.code !== 0) {
        command = `apply -f ${info.deploymentFile}`;
        logUtils.logInfo(`[projectCreate] invoking command: ${command}`);
        result = await info.kubectl.invokeCommand(command);
        if (result?.code !== 0) {
            vscode.window.showErrorMessage(`Deploy of ${info.appName} failed.`);
            logUtils.logError(`[projectCreate] deployment of ${info.appName} faled: ${result?.stderr}`);
            return Promise.reject(result?.stderr);
        }
        deploymentName = result?.stdout.trim();
    } 
    setEnvDebug(info);
    command = `rollout restart deployment/${info.appName}`;
    let oldRs = deploymentName ? await getLatestRs(info.kubectl, deploymentName) : undefined;
    kubernetesChannel.appendLine(`> kubectl ${command}`);
    logUtils.logInfo(`[projectCreate] invoking command: ${command}`);
    result = await info.kubectl.invokeCommand(command);
    if (result) {
        if (result.code === 0) {
            kubernetesChannel.appendLine(result.stdout);
            if (deploymentName && oldRs) {
                let repeat = MAX_WAIT_CYCLES;
                while (oldRs === await getLatestRs(info.kubectl, deploymentName) && repeat-- > 0) {
                    await new Promise(resolve => setTimeout(resolve, WAIT_TIMEOUT));
                }
                if (repeat > -1) {
                    logUtils.logInfo(`[projectCreate] APPLICATION ${info.appName} DEPLOYED`);
                    kubernetesChannel.appendLine(`APPLICATION DEPLOYED`);
                }
            }
            return Promise.resolve(info);
        } else {
            logUtils.logError(`[projectCreate] deployment of ${info.appName} failed: code: ${result.code}; err: ${result.stderr}; `);
            return Promise.reject(result.stderr);
        }
    }
    logUtils.logError(`[projectCreate] deployment of ${info.appName} faled.`);
    return Promise.reject();
}

async function getLatestRs(kubectl: kubernetes.KubectlV1, label: string) {
    const command = `get rs --selector=app=${label} --sort-by=.metadata.creationTimestamp -o jsonpath='{.items[-1:].metadata.name}'`;
    logUtils.logInfo(`[projectCreate] invoking command: ${command}`);
    let result = await kubectl.invokeCommand(command);
    if (result?.code === 0) {
        return result.stdout;
    }
    return undefined;
}
