/*
 * Copyright (c) 2022, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as common from 'oci-common';
import * as core from "oci-core";
import * as containerinstances from 'oci-containerinstances';
import * as nodes from '../nodes';
import * as dialogs from '../dialogs';
import * as logUtils from '../logUtils';
import * as ociUtils from './ociUtils';
import * as ociContext from './ociContext';
import * as ociDialogs from './ociDialogs';
import * as ociService from './ociService';
import * as ociServices from './ociServices';
import * as dataSupport from './dataSupport';


export const DATA_NAME = 'containerInstances';

export function initialize(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.commands.registerCommand('gcn.oci.runDockerImage', (...params: any[]) => {
        if (params[0]?.getImageUrl) {
            const node: nodes.BaseNode = params[0] as nodes.BaseNode;
            const service = findByNode(node);
            if (service) {
                const imageUrl = params[0].getImageUrl();
                service.runAndOpenContainerInstance(imageUrl);
            }
        }
    }));
}

export async function importServices(_oci: ociContext.Context, _projectResources: any | undefined, _codeRepositoryResources: any | undefined): Promise<dataSupport.DataProducer | undefined> {
    // TODO: Might return populated instance of Service which internally called importServices()
    return undefined;
}

export function create(folder: vscode.WorkspaceFolder, oci: ociContext.Context, serviceData: any | undefined, dataChanged: dataSupport.DataChanged): ociService.Service {
    return new Service(folder, oci, serviceData, dataChanged);
}

export function findByNode(node: nodes.BaseNode): Service | undefined {
    const services = ociServices.findByNode(node);
    const service = services?.getService(DATA_NAME);
    return service instanceof Service ? service as Service : undefined;
}

class Service extends ociService.Service {

    constructor(folder: vscode.WorkspaceFolder, oci: ociContext.Context, serviceData: any | undefined, dataChanged: dataSupport.DataChanged) {
        super(folder, oci, DATA_NAME, serviceData, dataChanged);
    }

    public async runAndOpenContainerInstance(imageUrl: string | Promise<string>) {
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Processing docker image',
            cancellable: false
        }, async (progress, _token) => {
            try {
                logUtils.logInfo('[containerinstance] Resolving image URL');
                progress.report({
                    message: 'Resolving image URL'
                });
                const authenticationDetailsProvider = this.oci.getProvider();
                const compartment = this.oci.getCompartment();

                let resolvedImageUrl: string | undefined;
                if (typeof imageUrl === 'string') {
                    resolvedImageUrl = imageUrl;
                } else if (imageUrl instanceof Promise) {
                    resolvedImageUrl = await imageUrl;
                }
                if (!resolvedImageUrl) {
                    return;
                }
                const dockerImageUrl = resolvedImageUrl;
                logUtils.logInfo('[containerinstance] Resolved image URL ' + dockerImageUrl);

                const lastContainerInstanceID = this.settingsData?.containerInstance;
                let currentContainerInstance: containerinstances.models.ContainerInstance;
                if (lastContainerInstanceID && this.settingsData?.imageUrl === dockerImageUrl) {
                    logUtils.logInfo('[containerinstance] Found existing Container Instance for image URL ' + dockerImageUrl);
                    progress.report({
                        message: 'Resolving existing Container Instance'
                    });
                    logUtils.logInfo('[containerinstance] Resolving existing Container Instance for image URL ' + dockerImageUrl);
                    currentContainerInstance = await ociUtils.getContainerInstance(authenticationDetailsProvider, lastContainerInstanceID);
                    const currentState = currentContainerInstance.lifecycleState;
                    if (currentState === containerinstances.models.ContainerInstance.LifecycleState.Active && (dockerImageUrl.endsWith(':latest') || !dockerImageUrl.includes(':'))) {
                        logUtils.logInfo('[containerinstance] Restarting existing Container Instance for image URL ' + dockerImageUrl);
                        progress.report({
                            message: 'Restarting existing Container Instance'
                        });
                        const workRequestID = await ociUtils.restartContainerInstance(authenticationDetailsProvider, lastContainerInstanceID);
                        logUtils.logInfo('[containerinstance] Waiting for restarted Container Instance for image URL ' + dockerImageUrl);
                        await ociUtils.containerInstancesWaitForResourceCompletionStatus(authenticationDetailsProvider, 'Container Instance', workRequestID);
                    } else if (currentState === containerinstances.models.ContainerInstance.LifecycleState.Inactive) {
                        logUtils.logInfo('[containerinstance] Starting existing Container Instance for image URL ' + dockerImageUrl);
                        progress.report({
                            message: 'Starting existing Container Instance'
                        });
                        const workRequestID = await ociUtils.startContainerInstance(authenticationDetailsProvider, currentContainerInstance.id);
                        logUtils.logInfo('[containerinstance] Waiting for Container Instance for image URL ' + dockerImageUrl);
                        await ociUtils.containerInstancesWaitForResourceCompletionStatus(authenticationDetailsProvider, 'Container Instance', workRequestID);
                    } else if (currentState !== containerinstances.models.ContainerInstance.LifecycleState.Active) {
                        dialogs.showErrorMessage(`Unsupported state of Container Instance for image ${dockerImageUrl}: ${currentState}. Please invoke the action again.`);
                        this.settingsData = undefined;
                        if (this.dataChanged) {
                            this.dataChanged(this);
                        }
                        return;
                    }
                } else {
                    const user = await ociUtils.getUser(authenticationDetailsProvider, authenticationDetailsProvider.getUser());
                    const password = await ociDialogs.inputPassword(user.name, 'Run and Open in Browser');
                    if (password === undefined) {
                        return;
                    }
                    logUtils.logInfo('[containerinstance] No existing Container Instance found for image URL ' + dockerImageUrl);
                    if (lastContainerInstanceID) {
                        logUtils.logInfo('[containerinstance] Deleting previous Container Instance ' + lastContainerInstanceID);
                        ociUtils.deleteContainerInstance(authenticationDetailsProvider, lastContainerInstanceID);
                    }
                    progress.report({
                        message: 'Creating new Container Instance'
                    });
                    logUtils.logInfo('[containerinstance] Resolving subnet for new Container Instance for image URL ' + dockerImageUrl);
                    const subnet = await getOrCreateCISubnet(authenticationDetailsProvider, compartment);
                    const ciName = `CI-VSCode-${Date.now()}`;
                    logUtils.logInfo('[containerinstance] Creating new Container Instance for image URL ' + dockerImageUrl);
                    const containerInstanceHandle = await ociUtils.createContainerInstance(authenticationDetailsProvider, compartment, dockerImageUrl, subnet.id, ciName, user.name, password);
                    const containerInstanceID = containerInstanceHandle.containerInstance.id;
                    this.settingsData = {
                        containerInstance: containerInstanceID,
                        imageUrl: dockerImageUrl
                    }
                    if (this.dataChanged) {
                        this.dataChanged(this);
                    }
                    logUtils.logInfo('[containerinstance] Waiting for new Container Instance for image URL ' + dockerImageUrl);
                    await ociUtils.containerInstancesWaitForResourceCompletionStatus(authenticationDetailsProvider, 'container instance', containerInstanceHandle.workRequestId);
                    logUtils.logInfo('[containerinstance] Resolving new Container Instance for image URL ' + dockerImageUrl);
                    currentContainerInstance = await ociUtils.getContainerInstance(authenticationDetailsProvider, containerInstanceID);
                }
                const vnicId = currentContainerInstance.vnics[0]?.vnicId;
                if (vnicId) {
                    progress.report({
                        message: 'Resolving internet address'
                    });
                    logUtils.logInfo('[containerinstance] Resolving VNIC of new Container Instance for image URL ' + dockerImageUrl);
                    const vnic = await ociUtils.getVNIC(authenticationDetailsProvider, vnicId);
                    const publicIp = `http://${vnic.publicIp}:8080`;
                    logUtils.logInfo('[containerinstance] Opening resolved address ' + publicIp);
                    dialogs.openInBrowser(publicIp);
                }
            } catch (err) {
                dialogs.showErrorMessage('Failed to open docker image', err);
            }
        });
    }

}

async function getOrCreateCISubnet(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string): Promise<core.models.Subnet> {
    logUtils.logInfo('[containerinstance] Listing available subnets');
    const subnets = await ociUtils.listSubnets(authenticationDetailsProvider, compartmentID);
    for (const subnet of subnets) {
        if (subnet.freeformTags?.gcn_tooling_ci_resource) {
            logUtils.logInfo('[containerinstance] Reusing existing subnet');
            return subnet;
        }
    }

    logUtils.logInfo('[containerinstance] Resolving VCN');
    const vcn = await getOrCreateCIVCN(authenticationDetailsProvider, compartmentID);
    logUtils.logInfo('[containerinstance] Creating subnet');
    const subnet = await ociUtils.createSubnet(authenticationDetailsProvider, compartmentID, vcn.id, `subnet-ci-vscode-${Date.now()}`, {
        'gcn_tooling_ci_resource': 'true'
    });

    if (subnet.securityListIds?.[0]) {
        logUtils.logInfo('[containerinstance] Resolving security list');
        const securityList = await ociUtils.getSecurityList(authenticationDetailsProvider, subnet.securityListIds?.[0]);
        const ingressSecurityRules = securityList.ingressSecurityRules;
        ingressSecurityRules.push({
            protocol: '6', // TCP
            source: '0.0.0.0/0',
            tcpOptions: {
                destinationPortRange: {
                    min: 8080,
                    max: 8080
                }
            }
        });
        logUtils.logInfo('[containerinstance] Adding ingress rule');
        await ociUtils.updateSecurityList(authenticationDetailsProvider, securityList.id, ingressSecurityRules);
    }
    return subnet;
}

async function getOrCreateCIVCN(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string): Promise<core.models.Vcn> {
    logUtils.logInfo('[containerinstance] Listing available VCNs');
    const vcns = await ociUtils.listVCNs(authenticationDetailsProvider, compartmentID);
    for (const vcn of vcns) {
        if (vcn.freeformTags?.gcn_tooling_ci_resource) {
            logUtils.logInfo('[containerinstance] Reusing existing VCN');
            return vcn;
        }
    }
    const vcn = await ociUtils.createVCN(authenticationDetailsProvider, compartmentID, `vcn-ci-vscode-${Date.now()}`, {
        'gcn_tooling_ci_resource': 'true'
    });
    logUtils.logInfo('[containerinstance] Creating internet gateway');
    const igw = await ociUtils.createInternetGateway(authenticationDetailsProvider, compartmentID, vcn.id, `igw-ci-vscode-${Date.now()}`);
    logUtils.logInfo('[containerinstance] Resolving route table');
    if (vcn.defaultRouteTableId) {
        const rt = await ociUtils.getRouteTable(authenticationDetailsProvider, vcn.defaultRouteTableId);
        const routeRules = rt.routeRules;
        routeRules.push({
            routeType: core.models.RouteRule.RouteType.Static,
            destination: '0.0.0.0/0',
            destinationType: core.models.RouteRule.DestinationType.CidrBlock,
            networkEntityId: igw.id
        });
        logUtils.logInfo('[containerinstance] Adding route table rule');
        await ociUtils.updateRouteTable(authenticationDetailsProvider, rt.id, routeRules);
    }
    return vcn;
}


