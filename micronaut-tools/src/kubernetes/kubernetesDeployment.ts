/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import { createWrapper, createContent, createNewFile } from "./kubernetesUtil";
import * as kubernetes from 'vscode-kubernetes-tools-api';
import { MultiStepInput } from "../../../common/lib/dialogs";
import * as logUtils from "../../../common/lib/logUtils";

const LOCAL = "<local>";
const NO_SECRET = "<public repository>";

export async function createDeployment(context: vscode.ExtensionContext) {
    logUtils.logInfo(`[kubernetesDeployment] creating deployment.`);
    const kubectl: kubernetes.API<kubernetes.KubectlV1> = await kubernetes.extension.kubectl.v1;
    if (!kubectl.available) {
        vscode.window.showErrorMessage(`kubectl not available: ${kubectl.reason}.`);
        logUtils.logError(`[kubernetesDeployment] kubectl not available: ${kubectl.reason}.`);
        return;
    }
    const title = 'Create Kubernetes Deployment File';

    let wrapper =  await createWrapper();

    let secretsPromise = getSecrets(kubectl.api);
    let namespacesPromise = getNamespaces(kubectl.api);

    let [projectInfo, secrets, namespaces]  = await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification, title, cancellable: true},
        async progress => {
          progress.report({ message: 'Retrieving project info' });
          const projectInfo = await wrapper.getProjectInfo();
          progress.report({ message: 'Retrieving Namespaces' });
          const namespaces = await namespacesPromise;
          progress.report({ message: 'Retrieving Container Secret Resources' });

          return [projectInfo, await secretsPromise, namespaces];  
        }
    );

    interface State {
		dockerRegistry: string;
		imageName: string;
        dockerSecret: string;
        namespace: string;
	}

    async function collectInputs(): Promise<State> {
		const state = {} as Partial<State>;
        logUtils.logInfo(`[kubernetesDeployment] collecting user input.`);
        await MultiStepInput.run(input => pickDockerRegistry(input, state));
		return state as State;
	}

    /**
     * Compute total steps based on state/selections made.
     * @param state current state
     * @returns total steps
     */
     function totalSteps(state: Partial<State>) : number {
        const regex = /([^\/]+\.[^\/.]+)\/[^\/.]+\/?[^\/.]+(:.+)?/m;
        let match = state.imageName?.match(regex);
        if (match && secrets) {
            return 4;
        }
        return 3;
    }

    async function pickDockerRegistry(input: MultiStepInput, state: Partial<State>) {
        const selected: any = await input.showQuickPick({
			title,
			step: 1,
			totalSteps: totalSteps(state),
			placeholder: 'Pick Container Repository',
			items: getDockerRegistries(),
			activeItems: {label: "local", value: LOCAL},
            validate: () => Promise.resolve(undefined),
			shouldResume: () => Promise.resolve(false)
        });
        state.dockerRegistry = normalizeRegistryUrl(selected.value);
        logUtils.logInfo(`[kubernetesDeployment] docker registry: ${state.dockerRegistry}`);
		return (input: MultiStepInput) => inputImageName(input, state);
	}

    async function inputImageName(input: MultiStepInput, state: Partial<State>) {
        let defaultValue = "";
        if (projectInfo && state.dockerRegistry) {
            defaultValue = `${state.dockerRegistry}${projectInfo.name}:${projectInfo.version}`;
        }
		state.imageName = await input.showInputBox({
			title,
			step: 2,
			totalSteps: totalSteps(state),
			value: state.imageName || defaultValue,
			prompt: 'Provide image name and version',
			validate: () => Promise.resolve(undefined),
			shouldResume: () => Promise.resolve(false)
		});
        logUtils.logInfo(`[kubernetesDeployment] image name: ${state.imageName}`);
        return (input: MultiStepInput) => pickNamespace(input, state);
	}

    async function pickNamespace(input: MultiStepInput, state: Partial<State>) {
		const selected: any = await input.showQuickPick({
			title,
			step: 3,
			totalSteps: totalSteps(state),
            placeholder: `Select Namespace ${state.namespace}`,
            items: namespaces,
			shouldResume: () => Promise.resolve(false)
        });
        state.namespace = selected.label;
        if (totalSteps(state) === 4) {
            logUtils.logInfo(`[kubernetesDeployment] namespace: ${state.namespace}`);
		    return (input: MultiStepInput) => pickDockerSecret(input, state);
        } else {
            return undefined;
        }
	}

    async function pickDockerSecret(input: MultiStepInput, state: Partial<State>) {
		const selected: any = await input.showQuickPick({
			title,
			step: 4,
			totalSteps: totalSteps(state),
            placeholder: `Select Container Registry Secret for ${state.imageName}`,
            items: secrets,
			shouldResume: () => Promise.resolve(false)
        });
        if (selected.label !== NO_SECRET) {
            logUtils.logInfo(`[kubernetesDeployment] collected secret.`);
            state.dockerSecret = selected.label;
        }
	}

    const state = await collectInputs();
    if (state.dockerRegistry  && state.imageName) {
        let text = createContent(context.extensionPath, 'deploy.yaml', projectInfo.name, state.namespace, state.imageName, state.dockerSecret);
        createNewFile(projectInfo.root, "deploy", "yaml", text);
    }
    logUtils.logInfo(`[kubernetesDeployment] created deployment.`);
}

async function getSecrets(kubectl: kubernetes.KubectlV1): Promise<{label: string}[]> {
    const command = `get secrets -o jsonpath='{range .items[*]}{@.metadata.name}{\"\\t\"}{@.type}{\"\\n\"}{end}'`;
    const secrets: vscode.QuickPickItem[] = [];
    secrets.push({label: NO_SECRET});
    logUtils.logInfo(`[kubernetesDeployment] invoking command: ${command}`);
    const result = await kubectl.invokeCommand(command);
    result?.stdout.split("\n").forEach(line => {
        const str = line.split("\t");
        if (str[1] === 'kubernetes.io/dockerconfigjson') {
            secrets.push({label: str[0]});
        }
    });
    logUtils.logInfo(`[kubernetesDeployment] found ${secrets.length} secret${secrets.length !== 1 ? 's' : ''}.`);
    return secrets;
}
 
async function getNamespaces(kubectl: kubernetes.KubectlV1): Promise<vscode.QuickPickItem[]> {
    const command = "get namespace -o jsonpath='{.items[*].metadata.name}'";
    const namespaces: vscode.QuickPickItem[] = [];
    logUtils.logInfo(`[kubernetesDeployment] invoking command: ${command}`);
    const result = await kubectl.invokeCommand(command);
    if (result?.code === 0) {
        const parts = result.stdout.trim().split(' ');
        parts.forEach(ns => {
            namespaces.push({label: ns});
        });
    }
    logUtils.logInfo(`[kubernetesDeployment] found namespaces: ${namespaces}.`);
    return namespaces;
}

function normalizeRegistryUrl(repo: string): string {
    if (repo === LOCAL) {
        return "";
    } else if (repo && !repo.trim().endsWith('/')) {
        return `${repo.trim()}/`;
    } 
    return repo;
}

function getDockerRegistries(): {label: string; value: string}[]  {
    return [
        { label: 'local', value: LOCAL},
        { label: 'Docker', value: 'docker.io'},
        { label: 'OCIR Phoenix', value: 'phx.ocir.io'}
    ];
}



