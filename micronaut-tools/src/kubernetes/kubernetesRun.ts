/*
 * Copyright (c) 2021, 2024, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as logUtils from '../../../common/lib/logUtils';
import { askToExecCommand, createWrapper, findResourceFileByKind, createContent, createNewFile, RunInfo, collectInfo, getPod } from "./kubernetesUtil";
import { deploy } from "./kubernetesDeploy";
import { kubernetesChannel } from './kubernetesChannel';

let forwardSession: vscode.Disposable | undefined;

export async function runProject() {
    kubernetesChannel.clearAndShow();
    kubernetesChannel.appendLine(`Starting project`);
    let wrapper =  await createWrapper();
    let proj = await wrapper.getProjectInfo();

    if (forwardSession) {
        forwardSession.dispose();
    }

    collectInfo(proj.name)
        .then((runInfo) => wrapper.buildAll(runInfo))
        .then((runInfo) => deploy(runInfo))
        .then((runInfo) => run(runInfo));
}
        
async function run(info: RunInfo) {
    const podName = await getPod(info.kubectl, info.appName);
    if (info.port && podName) {
        let command = `wait --for=condition=ready pod ${podName}`;
        logUtils.logInfo(`[kubernetesRun] invoking command: ${command}`);
        await info.kubectl.invokeCommand(command);
        info.kubectl.portForward(
            podName, 
            undefined, 
            info.port, 
            info.port, 
            { showInUI: { location: 'status-bar' } 
        }).then(() => {
            kubernetesChannel.appendLine(`You can access ${podName} on http://localhost:${info.port}`);
        }).catch(e => {
            kubernetesChannel.appendLine(`failed to start port-forward ${e}`);
            logUtils.logError(`[kubernetesRun] failed to start port-forward: ${e}`);
        });
    }
}

export async function createService() {
    const title = 'Create Kubernetes Service File';
    logUtils.logInfo(`[kubernetesRun] Creating Kubernetes Service File.`);

    let wrapper =  await createWrapper();

    let projectInfo  = await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification, 
        title,
        cancellable: true},
        async progress => {
          progress.report({ message: 'Retrieving project info' });
          return await wrapper.getProjectInfo();
        }
    );
    const deployment = await findResourceFileByKind('Deployment');
    if (!deployment) {
        logUtils.logWarning(`[kubernetesUtil] ${projectInfo.name}: Deployment file is not present.`);
        askToExecCommand(
            'extension.micronaut-tools.createDeploy',
            'Deployment file is not present. Would you like to create it?');
        return;
    }

    const template = require('../../templates/service.yaml.handlebars');
    const text = createContent(template, 'service.yaml', projectInfo.name);
    createNewFile(projectInfo.root, "service", "yaml", text);
    logUtils.logInfo(`[kubernetesRun] Created Kubernetes Service File.`);
}