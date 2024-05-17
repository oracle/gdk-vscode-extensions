/*
 * Copyright (c) 2022, 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as common from 'oci-common';
import * as core from "oci-core";
import * as identity from 'oci-identity';
import * as devops from 'oci-devops';
import * as artifacts from 'oci-artifacts';
import * as adm from 'oci-adm';
import * as ons from 'oci-ons';
import * as logging from 'oci-logging';
import * as loggingsearch from 'oci-loggingsearch';
import * as genericartifactscontent from 'oci-genericartifactscontent';
import * as containerinstances from 'oci-containerinstances';
import { containerengine, objectstorage } from 'oci-sdk';
import 'isomorphic-fetch';
/*
import { LOG } from "oci-sdk";
var bunyan = require("bunyan");
  
 // Set the logger here
var bunLog = bunyan.createLogger({ name: "LoggingExample", level: "debug" });
 LOG.logger = bunLog;
*/
const DEFAULT_NOTIFICATION_TOPIC = 'NotificationTopic';
const DEFAULT_LOG_GROUP = 'Default_Group';
const DEFAULT_COMPARTMENT_ACCESS_POLICY = 'CompartmentAccessPolicy';
const BUILD_IMAGE = 'OL7_X86_64_STANDARD_10';

// PENDING: the waitForResourceCompletionStatus will be replicated for each API, but the semantic should be consistent;
// must invent some abstraction that allows to extract the loop / result inspection algorithm

/**
 * Waits for the work request ID to complete. The request is expected to work with a single resource only. The function terminates when the resource reaches 
 * either the success status, or one of the failure status(es). The returned Promise completes on Succeeded status with the resource's OCID; if the request
 * completes with Canceled or Failed status, the Promise will be rejected with an error that describes the state.
 * 
 * @param requestId the work request ID from the original operation
 * @param resourceDescription description of the resource operated on, for error reporting
 * @returns promise that will be completed with the operated resource's OCID after it finishes to Succeeded status.
 */
 export async function loggingWaitForResourceCompletionStatus(
    authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider,
    resourceDescription : string, requestId : string) : Promise<string> {
    
    // TODO: handle timeout, use increasing polling time.
    const logClient = new logging.LoggingManagementClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const req : logging.requests.GetWorkRequestRequest = {
        workRequestId : requestId,
    };

    let requestState : logging.models.WorkRequest | undefined;

    // TODO: make this configurable, in vscode/workspace options
    const maxWaitingTimeMillis = 60 * 1000; 
    const initialPollTime = 2000;
    W: for (let waitCount = (maxWaitingTimeMillis / initialPollTime); waitCount > 0; waitCount--) {
        // console.log(`>>> getRequest ${req.workRequestId}`);
        const response = await logClient.getWorkRequest(req);
        // console.log(`>>> getRequest ${req.workRequestId} = ${response.workRequest.status}`);
        switch (response.workRequest.status) {
            case logging.models.OperationStatus.Succeeded:
            case logging.models.OperationStatus.Failed:
            case logging.models.OperationStatus.Canceled:
                requestState = response.workRequest;
                break W;
        }
        await delay(2000);
    }
    if (!requestState) {
        throw new Error(`Timeout while creating ${resourceDescription}`);
    }
    if (requestState.status !== logging.models.OperationStatus.Succeeded) {
        // PENDING: make some abortion exception that can carry WorkRequest errors, should be caught top-level & reported to the user instead of plain message.
        throw new Error(`Creation of ${resourceDescription} failed`);
    }
    // PENDING: what exactly do the 'affected resources' mean ???
    return requestState.resources[0].identifier;
}

/**
 * Waits for the work request ID to complete. The request is expected to work with a single resource only. The function terminates when the resource reaches 
 * either the success status, or one of the failure status(es). The returned Promise completes on Succeeded status with the resource's OCID; if the request
 * completes with Canceled or Failed status, the Promise will be rejected with an error that describes the state.
 * 
 * @param requestId the work request ID from the original operation
 * @param resourceDescription description of the resource operated on, for error reporting
 * @returns promise that will be completed with the operated resource's OCID after it finishes to Succeeded status.
 */
 export async function admWaitForResourceCompletionStatus(
    authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider,
    resourceDescription : string, requestId : string) : Promise<string> {
    
    // TODO: handle timeout, use increasing polling time.
    const admClient = new adm.ApplicationDependencyManagementClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const req : adm.requests.GetWorkRequestRequest = {
        workRequestId : requestId,
    };

    let requestState : adm.models.WorkRequest | undefined;

    // TODO: make this configurable, in vscode/workspace options
    const maxWaitingTimeMillis = 60 * 1000; 
    const initialPollTime = 2000;
    W: for (let waitCount = (maxWaitingTimeMillis / initialPollTime); waitCount > 0; waitCount--) {
        // console.log(`>>> getRequest ${req.workRequestId}`);
        const response = await admClient.getWorkRequest(req);
        // console.log(`>>> getRequest ${req.workRequestId} = ${response.workRequest.status}`);
        switch (response.workRequest.status) {
            case adm.models.OperationStatus.Succeeded:
            case adm.models.OperationStatus.Failed:
            case adm.models.OperationStatus.Canceled:
                requestState = response.workRequest;
                break W;
        }
        await delay(2000);
    }
    if (!requestState) {
        throw new Error(`Timeout while creating ${resourceDescription}`);
    }
    if (requestState.status !== adm.models.OperationStatus.Succeeded) {
        // PENDING: make some abortion exception that can carry WorkRequest errors, should be caught top-level & reported to the user instead of plain message.
        throw new Error(`Creation of ${resourceDescription} failed`);
    }
    // PENDING: what exactly do the 'affected resources' mean ???
    return requestState.resources[0].identifier;
}

/**
 * Waits for the work request ID to complete. The request is expected to work with a single resource only. The function terminates when the resource reaches 
 * either the success status, or one of the failure status(es). The returned Promise completes on Succeeded status with the resource's OCID; if the request
 * completes with Canceled or Failed status, the Promise will be rejected with an error that describes the state.
 * 
 * @param requestId the work request ID from the original operation
 * @param resourceDescription description of the resource operated on, for error reporting
 * @returns promise that will be completed with the operated resource's OCID after it finishes to Succeeded status.
 */
export async function devopsWaitForResourceCompletionStatus(
    authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider,
    resourceDescription : string, requestId : string) : Promise<string> {
    
    // TODO: handle timeout, use increasing polling time.
    const devClient = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const req : devops.requests.GetWorkRequestRequest = {
        workRequestId : requestId,
    };

    let requestState : devops.models.WorkRequest | undefined;

    // TODO: make this configurable, in vscode/workspace options
    const maxWaitingTimeMillis = 60 * 1000; 
    const initialPollTime = 2000;
    W: for (let waitCount = (maxWaitingTimeMillis / initialPollTime); waitCount > 0; waitCount--) {
        // console.log(`>>> getRequest ${req.workRequestId}`);
        const response = await devClient.getWorkRequest(req);
        // console.log(`>>> getRequest ${req.workRequestId} = ${response.workRequest.status}`);
        switch (response.workRequest.status) {
            case devops.models.OperationStatus.Succeeded:
            case devops.models.OperationStatus.Failed:
            case devops.models.OperationStatus.Canceled:
                requestState = response.workRequest;
                break W;
        }
        await delay(2000);
    }
    if (!requestState) {
        throw new Error(`Timeout while creating ${resourceDescription}`);
    }
    if (requestState.status !== devops.models.OperationStatus.Succeeded) {
        // PENDING: make some abortion exception that can carry WorkRequest errors, should be caught top-level & reported to the user instead of plain message.
        throw new Error(`Creation of ${resourceDescription} failed`);
    }
    // PENDING: what exactly do the 'affected resources' mean ???
    return requestState.resources[0].identifier;
}

export async function getUser(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, userID?: string): Promise<identity.models.User> {
    const client = new identity.IdentityClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: identity.requests.GetUserRequest = {
        userId: userID ? userID : authenticationDetailsProvider.getUser()
    };
    return client.getUser(request).then(response => response.user);
}

export async function getTenancy(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, tenantID?: string): Promise<identity.models.Tenancy> {
    const client = new identity.IdentityClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: identity.requests.GetTenancyRequest = {
        tenancyId: tenantID ? tenantID : authenticationDetailsProvider.getTenantId()
    };
    return client.getTenancy(request).then(response => response.tenancy);
}

export async function createBearerToken(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, registryEndpoint?: string): Promise<string> {
    if (!registryEndpoint) {
        registryEndpoint = `${authenticationDetailsProvider.getRegion().regionCode}.ocir.io`;
    }
    const signer = new common.DefaultRequestSigner(authenticationDetailsProvider);
    const httpRequest: common.HttpRequest = {
        uri: `https://${registryEndpoint}/20180419/docker/token`,
        headers: new Headers(),
        method: "GET"
    };
    await signer.signHttpRequest(httpRequest);
    const response = await fetch(new Request(httpRequest.uri, {
        method: httpRequest.method,
        headers: httpRequest.headers,
        body: httpRequest.body
    }));
    const data: any = await response.json();
    return data?.token;
}

export async function getObjectStorageNamespace(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID?: string): Promise<string> {
    const client = new objectstorage.ObjectStorageClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: objectstorage.requests.GetNamespaceRequest = {
        compartmentId: compartmentID
    };
    return client.getNamespace(request).then(response => response.value);
}

export async function listRegions(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider): Promise<identity.models.Region[]> {
    const client = new identity.IdentityClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: identity.requests.ListRegionsRequest = {
    };
    return client.listRegions(request).then(response => response.items);
}

export async function listCompartments(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider): Promise<identity.models.Compartment[]> {
    const client = new identity.IdentityClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: identity.requests.ListCompartmentsRequest = {
        compartmentId: authenticationDetailsProvider.getTenantId(),
        compartmentIdInSubtree: true,
        lifecycleState: identity.models.Compartment.LifecycleState.Active,
        accessLevel: identity.requests.ListCompartmentsRequest.AccessLevel.Accessible,
        limit: 1000
    };
    const result: identity.models.Compartment[] = [];
    do {
        const response = await client.listCompartments(request);
        result.push(...response.items);
        request.page = response.opcNextPage;
    } while (request.page);
    return result;
}

export async function getCompartment(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string): Promise<identity.models.Compartment> {
    const client = new identity.IdentityClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: identity.requests.GetCompartmentRequest = {
        compartmentId: compartmentID
    };
    return client.getCompartment(request).then(response => response.compartment);
}

export async function listDevOpsProjects(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string): Promise<devops.models.ProjectSummary[]> {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: devops.requests.ListProjectsRequest = {
        compartmentId: compartmentID,
        lifecycleState: devops.models.Project.LifecycleState.Active,
        limit: 1000
    };
    const result: devops.models.ProjectSummary[] = [];
    do {
        const response = await client.listProjects(request);
        result.push(...response.projectCollection.items);
        request.page = response.opcNextPage;
    } while (request.page);
    return result;
}

export async function getDevopsProject(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, projectId: string): Promise<devops.models.Project> {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: devops.requests.GetProjectRequest = {
        projectId: projectId
    };
    return client.getProject(request).then(response => response.project);
}

export async function deleteDevOpsProject(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, projectId: string, wait: boolean = false) {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const response = client.deleteProject({ projectId: projectId });
    if (wait) {
        await devopsWaitForResourceCompletionStatus(authenticationDetailsProvider, "Deleting project", (await response).opcWorkRequestId);
    }
}

export async function deleteDevOpsProjectsByDeployIDTag(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string, tag: string) {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: devops.requests.ListProjectsRequest = {
        compartmentId: compartmentID,
        limit: 1000
    };
    const projects: devops.models.ProjectSummary[] = [];
    do {
        const response = await client.listProjects(request);
        projects.push(...response.projectCollection.items);
        request.page = response.opcNextPage;
    } while (request.page);
    for (const project of projects) {
        if (project.freeformTags && project.freeformTags['devops_tooling_deployID'] === tag
            && project.lifecycleState !== devops.models.Project.LifecycleState.Deleting
            && project.lifecycleState !== devops.models.Project.LifecycleState.Deleted) {
                await deleteDevOpsProject(authenticationDetailsProvider, project.id, true);
        }
    }
}

export async function listCodeRepositories(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, projectID: string): Promise<devops.models.RepositorySummary[]> {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: devops.requests.ListRepositoriesRequest = {
        projectId: projectID,
        lifecycleState: devops.models.Repository.LifecycleState.Active,
        limit: 1000
    };
    const result: devops.models.RepositorySummary[] = [];
    do {
        const response = await client.listRepositories(request);
        result.push(...response.repositoryCollection.items);
        request.page = response.opcNextPage;
    } while (request.page);
    return result;
}

export async function getDeployEnvironment(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, envID: string): Promise<devops.models.DeployEnvironment> {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: devops.requests.GetDeployEnvironmentRequest = {
        deployEnvironmentId: envID
    };
    return client.getDeployEnvironment(request).then(response => response.deployEnvironment);
}

export function asOkeDeployEnvironemnt(env?: devops.models.DeployEnvironment): devops.models.OkeClusterDeployEnvironment | undefined {
    if (env?.deployEnvironmentType === devops.models.OkeClusterDeployEnvironment.deployEnvironmentType) {
        return env as devops.models.OkeClusterDeployEnvironment;
    }
    return undefined;
}

export async function getCodeRepository(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, repositoryID: string): Promise<devops.models.Repository> {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: devops.requests.GetRepositoryRequest = {
        repositoryId: repositoryID
    };
    return client.getRepository(request).then(response => response.repository);
}

export async function deleteCodeRepository(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, repo: string, wait: boolean = false) {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const response = client.deleteRepository({ repositoryId: repo });
    if (wait) {
        await devopsWaitForResourceCompletionStatus(authenticationDetailsProvider, "Deleting repository", (await response).opcWorkRequestId);
    }
}

export async function deleteCodeRepositoriesByDeployIDTag(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string, tag: string) {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: devops.requests.ListRepositoriesRequest = {
        compartmentId: compartmentID,
        limit: 1000
    };
    const repositories: devops.models.RepositorySummary[] = [];
    do {
        const response = await client.listRepositories(request);
        repositories.push(...response.repositoryCollection.items);
        request.page = response.opcNextPage;
    } while (request.page);
    for (const artifact of repositories) {
        if (artifact.freeformTags && artifact.freeformTags['devops_tooling_deployID'] === tag
            && artifact.lifecycleState !== devops.models.Repository.LifecycleState.Deleted) {
                await deleteCodeRepository(authenticationDetailsProvider, artifact.id, true);
        }
    }
}

export async function getBuildPipeline(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, pipelineID: string): Promise<devops.models.BuildPipeline> {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: devops.requests.GetBuildPipelineRequest = {
        buildPipelineId: pipelineID
    };
    return client.getBuildPipeline(request).then(response => response.buildPipeline);
}

export async function listBuildPipelines(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, projectID: string): Promise<devops.models.BuildPipelineSummary[]> {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: devops.requests.ListBuildPipelinesRequest = {
        projectId: projectID,
        lifecycleState: devops.models.BuildPipeline.LifecycleState.Active,
        limit: 1000
    };
    const result: devops.models.BuildPipelineSummary[] = [];
    do {
        const response = await client.listBuildPipelines(request);
        result.push(...response.buildPipelineCollection.items);
        request.page = response.opcNextPage;
    } while (request.page);
    return result;
}

export async function deleteBuildPipeline(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, pipeId: string, wait: boolean = false) {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const response = client.deleteBuildPipeline({ buildPipelineId : pipeId });
    if (wait) {
        await devopsWaitForResourceCompletionStatus(authenticationDetailsProvider, "Deleting build pipeline", (await response).opcWorkRequestId);
    }
}

export async function deleteBuildPipelinesByDeployIDTag(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string, tag: string) {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: devops.requests.ListBuildPipelinesRequest = {
        compartmentId: compartmentID,
        limit: 1000
    };
    const pipelines: devops.models.BuildPipelineSummary[] = [];
    do {
        const response = await client.listBuildPipelines(request);
        pipelines.push(...response.buildPipelineCollection.items);
        request.page = response.opcNextPage;
    } while (request.page);
    for (const pipeline of pipelines) {
        if (pipeline.freeformTags && pipeline.freeformTags['devops_tooling_deployID'] === tag
            && pipeline.lifecycleState !== devops.models.BuildPipeline.LifecycleState.Deleting
            && pipeline.lifecycleState !== devops.models.DeployStage.LifecycleState.Deleted) {
                await deleteBuildPipeline(authenticationDetailsProvider, pipeline.id, true);
        }
    }
}


export async function getBuildPipelineStage(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, pipelineStageID: string): Promise<devops.models.BuildPipelineStage> {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: devops.requests.GetBuildPipelineStageRequest = {
        buildPipelineStageId: pipelineStageID
    };
    return client.getBuildPipelineStage(request).then(response => response.buildPipelineStage);
}

export async function listBuildPipelineStages(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, pipelineID: string): Promise<devops.models.BuildPipelineStageSummary[]> {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: devops.requests.ListBuildPipelineStagesRequest = {
        buildPipelineId: pipelineID,
        lifecycleState: devops.models.BuildPipelineStage.LifecycleState.Active,
        limit: 1000
    };
    const result: devops.models.BuildPipelineStageSummary[] = [];
    do {
        const response = await client.listBuildPipelineStages(request);
        result.push(...response.buildPipelineStageCollection.items);
        request.page = response.opcNextPage;
    } while (request.page);
    return result;
}

export async function deleteBuildPipelineStage(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, stage: string, wait: boolean = false) {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const response = client.deleteBuildPipelineStage({ buildPipelineStageId : stage });
    if (wait) {
        await devopsWaitForResourceCompletionStatus(authenticationDetailsProvider, "Deleting build pipeline stage", (await response).opcWorkRequestId);
    }
}

export async function deleteBuildPipelineStagesByDeployIDTag(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string, tag: string) {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: devops.requests.ListBuildPipelineStagesRequest = {
        compartmentId: compartmentID,
        limit: 1000
    };
    let stages: devops.models.BuildPipelineStageSummary[] = [];
    do {
        const response = await client.listBuildPipelineStages(request);
        stages.push(...response.buildPipelineStageCollection.items);
        request.page = response.opcNextPage;
    } while (request.page);
    const revDeps: Map<string, number> = new Map();
    stages = stages.filter(s => s.freeformTags && s.freeformTags['devops_tooling_deployID'] === tag
        && s.lifecycleState !== devops.models.BuildPipelineStage.LifecycleState.Deleting
        && s.lifecycleState !== devops.models.BuildPipelineStage.LifecycleState.Deleted);
    stages.forEach(s => {
        if (!revDeps.has(s.id)) {
            revDeps.set(s.id, 0);
        }
        for (let p of s.buildPipelineStagePredecessorCollection?.items || []) {
            if (p.id !== s.id) {
                let n = (revDeps.get(p.id) || 0);
                revDeps.set(p.id, n + 1);
            }
        }
    });
    const orderedStages: devops.models.BuildPipelineStageSummary[][] = [];
    stages.forEach(s => {
        const n = revDeps.get(s.id) || 0;
        let l = orderedStages[n];
        if (!l) {
            l = orderedStages[n] = [];
        }
        l.push(s);
    });
    for (const l of orderedStages) {
        if (l) {
            for (const stage of l) {
                await deleteBuildPipelineStage(authenticationDetailsProvider, stage.id, true);
            }
        }
    }
}

export async function listBuildPipelinesByCodeRepository(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, projectID: string, repositoryID: string): Promise<devops.models.BuildPipelineSummary[]> {
    const buildPipelines = await listBuildPipelines(authenticationDetailsProvider, projectID);
    const buildPipelineSummaries: devops.models.BuildPipelineSummary[] = [];
    if (buildPipelines) {
        for (const buildPipeline of buildPipelines) {
            const codeRepoID = buildPipeline.freeformTags?.devops_tooling_codeRepoID;
            if (codeRepoID) {
                if (codeRepoID === repositoryID) {
                    buildPipelineSummaries.push(buildPipeline);
                }
            } else {
                const stages = await listBuildPipelineStages(authenticationDetailsProvider, buildPipeline.id);
                if (stages) {
                    let buildPipelineSummary: devops.models.BuildPipelineSummary | undefined = undefined;
                    for (const stage of stages) {
                        if (stage.buildPipelineStageType === devops.models.BuildStage.buildPipelineStageType) {
                            const buildStage = stage as devops.models.BuildStage;
                            for (const buildSource of buildStage.buildSourceCollection.items) {
                                if (buildSource.connectionType === devops.models.DevopsCodeRepositoryBuildSource.connectionType) {
                                    const devopsBuildSource = buildSource as devops.models.DevopsCodeRepositoryBuildSource;
                                    if (devopsBuildSource.repositoryId === repositoryID) {
                                        buildPipelineSummary = buildPipeline;
                                        break;
                                    }
                                }
                            }
                            if (buildPipelineSummary) {
                                break;
                            }
                        }
                    }
                    if (buildPipelineSummary) {
                        buildPipelineSummaries.push(buildPipelineSummary);
                    }
                }
            }
        }
    }
    return buildPipelineSummaries;
}

export async function listDeployPipelines(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, projectID: string): Promise<devops.models.DeployPipelineSummary[]> {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: devops.requests.ListDeployPipelinesRequest = {
        projectId: projectID,
        lifecycleState: devops.models.DeployPipeline.LifecycleState.Active,
        limit: 1000
    };
    const result: devops.models.DeployPipelineSummary[] = [];
    do {
        const response = await client.listDeployPipelines(request);
        result.push(...response.deployPipelineCollection.items);
        request.page = response.opcNextPage;
    } while (request.page);
    return result;
}

export async function getDeployPipeline(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, pipelineID: string): Promise<devops.models.DeployPipeline> {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: devops.requests.GetDeployPipelineRequest = {
        deployPipelineId: pipelineID
    };
    return client.getDeployPipeline(request).then(response => response.deployPipeline);
}

export async function deleteDeployPipeline(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, pipeId: string, wait: boolean = false) {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const response = client.deleteDeployPipeline({ deployPipelineId : pipeId });
    if (wait) {
        await devopsWaitForResourceCompletionStatus(authenticationDetailsProvider, "Deleting deploy pipeline", (await response).opcWorkRequestId);
    }
}

export async function deleteDeployPipelinesByDeployIDTag(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string, tag: string) {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: devops.requests.ListDeployPipelinesRequest = {
        compartmentId: compartmentID,
        limit: 1000
    };
    const pipelines: devops.models.DeployPipelineSummary[] = [];
    do {
        const response = await client.listDeployPipelines(request);
        pipelines.push(...response.deployPipelineCollection.items);
        request.page = response.opcNextPage;
    } while (request.page);
    for (const pipeline of pipelines) {
        if (pipeline.freeformTags && pipeline.freeformTags['devops_tooling_deployID'] === tag
            && pipeline.lifecycleState !== devops.models.DeployPipeline.LifecycleState.Deleting
            && pipeline.lifecycleState !== devops.models.DeployPipeline.LifecycleState.Deleted) {
                await deleteDeployPipeline(authenticationDetailsProvider, pipeline.id, true);
        }
    }
}

export async function listDeployStages(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, pipelineID: string): Promise<devops.models.DeployStageSummary[]> {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: devops.requests.ListDeployStagesRequest = {
        deployPipelineId: pipelineID,
        lifecycleState: devops.models.DeployStage.LifecycleState.Active,
        limit: 1000
    };
    const result: devops.models.DeployStageSummary[] = [];
    do {
        const response = await client.listDeployStages(request);
        result.push(...response.deployStageCollection.items);
        request.page = response.opcNextPage;
    } while (request.page);
    return result;
}

export async function deleteDeployStage(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, stage: string, wait: boolean = false) {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const response = client.deleteDeployStage({ deployStageId: stage });
    if (wait) {
        await devopsWaitForResourceCompletionStatus(authenticationDetailsProvider, "Deleting deploy stage", (await response).opcWorkRequestId);
    }
}

export async function deleteDeployStagesByDeployIDTag(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string, tag: string) {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: devops.requests.ListDeployStagesRequest = {
        compartmentId: compartmentID,
        limit: 1000
    };
    let stages: devops.models.DeployStageSummary[] = [];
    do {
        const response = await client.listDeployStages(request);
        stages.push(...response.deployStageCollection.items);
        request.page = response.opcNextPage;
    } while (request.page);
    const revDeps: Map<string, number> = new Map();
    stages = stages.filter(s => s.freeformTags && s.freeformTags['devops_tooling_deployID'] === tag
        && s.lifecycleState !== devops.models.DeployStage.LifecycleState.Deleting
        && s.lifecycleState !== devops.models.DeployStage.LifecycleState.Deleted);
    stages.forEach(s => {
        if (!revDeps.has(s.id)) {
            revDeps.set(s.id, 0);
        }
        for (let p of s.deployStagePredecessorCollection?.items || []) {
            if (p.id !== s.id) {
                let n = (revDeps.get(p.id) || 0);
                revDeps.set(p.id, n + 1);
            }
        }
    });
    const orderedStages: devops.models.DeployStageSummary[][] = [];
    stages.forEach(s => {
        const n = revDeps.get(s.id) || 0;
        let l = orderedStages[n];
        if (!l) {
            l = orderedStages[n] = [];
        }
        l.push(s);
    });
    for (const l of orderedStages) {
        if (l) {
            for (const stage of l) {
                await deleteDeployStage(authenticationDetailsProvider, stage.id, true);
            }
        }
    }
}

export async function listArtifactRepositories(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string): Promise<artifacts.models.RepositorySummary[]> {
    const client = new artifacts.ArtifactsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: artifacts.requests.ListRepositoriesRequest = {
        compartmentId: compartmentID,
        lifecycleState: artifacts.models.Repository.LifecycleState.Available,
        limit: 1000
    };
    const result: artifacts.models.RepositorySummary[] = [];
    do {
        const response = await client.listRepositories(request);
        result.push(...response.repositoryCollection.items);
        request.page = response.opcNextPage;
    } while (request.page);
    return result;
}

export async function getArtifactRepository(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, repositoryID: string): Promise<artifacts.models.Repository> {
    const client = new artifacts.ArtifactsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: artifacts.requests.GetRepositoryRequest = {
        repositoryId: repositoryID
    };
    return client.getRepository(request).then(response => response.repository);
}

export async function deleteArtifactsRepository(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string, repositoryID: string, wait : boolean = false) {
    const items = await listGenericArtifacts(authenticationDetailsProvider, compartmentID, repositoryID);
    const client = new artifacts.ArtifactsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    if (items) {
        for (const item of items) {
            const request: artifacts.requests.DeleteGenericArtifactRequest = {
                artifactId: item.id
            };
            await client.deleteGenericArtifact(request);
        }
    }
    const response = client.deleteRepository({ repositoryId: repositoryID });
    if (wait) {
        await response;
    }
}

export async function deleteArtifactsRepositoriesByDeployIDTag(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string, tag: string) {
    const client = new artifacts.ArtifactsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: artifacts.requests.ListRepositoriesRequest = {
        compartmentId: compartmentID,
        limit: 1000
    };
    const repositories: artifacts.models.RepositorySummary[] = [];
    do {
        const response = await client.listRepositories(request);
        repositories.push(...response.repositoryCollection.items);
        request.page = response.opcNextPage;
    } while (request.page);
    for (const artifact of repositories) {
        if (artifact.freeformTags && artifact.freeformTags['devops_tooling_deployID'] === tag
            && artifact.lifecycleState !== artifacts.models.Repository.LifecycleState.Deleting
            && artifact.lifecycleState !== artifacts.models.Repository.LifecycleState.Deleted) {
                await deleteArtifactsRepository(authenticationDetailsProvider, compartmentID, artifact.id, true);
        }
    }
}

export async function listGenericArtifacts(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string, repositoryID: string, artifactPath?: string): Promise<artifacts.models.GenericArtifactSummary[]> {
    const client = new artifacts.ArtifactsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: artifacts.requests.ListGenericArtifactsRequest = {
        compartmentId: compartmentID,
        repositoryId: repositoryID,
        artifactPath: artifactPath, // NOTE: artifactPath filtering uses startsWith, not exact match!
        lifecycleState: artifactPath ? undefined : artifacts.models.GenericArtifact.LifecycleState.Available,
        sortBy: artifactPath ? artifacts.requests.ListGenericArtifactsRequest.SortBy.Timecreated : artifacts.requests.ListGenericArtifactsRequest.SortBy.Displayname,
        limit: 1000
    };
    const result: artifacts.models.GenericArtifactSummary[] = [];
    do {
        const response = await client.listGenericArtifacts(request);
        result.push(...response.genericArtifactCollection.items);
        request.page = response.opcNextPage;
    } while (request.page);
    return result;
}

export async function getGenericArtifact(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, artifactID: string): Promise<artifacts.models.GenericArtifact> {
    const client = new artifacts.ArtifactsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: artifacts.requests.GetGenericArtifactRequest = {
        artifactId: artifactID
    };
    return client.getGenericArtifact(request).then(response => response.genericArtifact);
}

export async function getGenericArtifactContent(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, artifactID: string): Promise<any> {
    const client = new genericartifactscontent.GenericArtifactsContentClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: genericartifactscontent.requests.GetGenericArtifactContentRequest = {
        artifactId: artifactID
    };
    return client.getGenericArtifactContent(request).then(response => response.value);
}

export async function deleteDeployArtifact(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, artifactId: string, wait : boolean = false) {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    // console.log(`> deleteDeployArtifact ${artifactId}`);
    const response = client.deleteDeployArtifact({ deployArtifactId : artifactId });
    if (wait) {
        await devopsWaitForResourceCompletionStatus(authenticationDetailsProvider, "Deleting deploy artifact", (await response).opcWorkRequestId);
    }
}

export async function deleteDeployArtifactsByDeployIDTag(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string, tag: string) {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: devops.requests.ListDeployArtifactsRequest = {
        compartmentId: compartmentID,
        limit: 1000
    };
    const artifacts: devops.models.DeployArtifactSummary[] = [];
    do {
        const response = await client.listDeployArtifacts(request);
        artifacts.push(...response.deployArtifactCollection.items);
        request.page = response.opcNextPage;
    } while (request.page);
    for (const artifact of artifacts) {
        if (artifact.freeformTags && artifact.freeformTags['devops_tooling_deployID'] === tag
            && artifact.lifecycleState !== devops.models.DeployArtifact.LifecycleState.Deleting
            && artifact.lifecycleState !== devops.models.DeployArtifact.LifecycleState.Deleted) {
                await deleteDeployArtifact(authenticationDetailsProvider, artifact.id, true);
        }
    }
}

export async function listDeployArtifacts(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, projectID: string): Promise<devops.models.DeployArtifactSummary[]> {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: devops.requests.ListDeployArtifactsRequest = {
        projectId: projectID,
        lifecycleState: devops.models.DeployArtifact.LifecycleState.Active,
        limit: 1000
    };
    const result: devops.models.DeployArtifactSummary[] = [];
    do {
        const response = await client.listDeployArtifacts(request);
        result.push(...response.deployArtifactCollection.items);
        request.page = response.opcNextPage;
    } while (request.page);
    return result;
}

export async function getDeployArtifact(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, artifactID: string): Promise<devops.models.DeployArtifact> {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: devops.requests.GetDeployArtifactRequest = {
        deployArtifactId: artifactID
    };
    return client.getDeployArtifact(request).then(response => response.deployArtifact);
}

export async function listContainerRepositories(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string): Promise<artifacts.models.ContainerRepositorySummary[]> {
    const client = new artifacts.ArtifactsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: artifacts.requests.ListContainerRepositoriesRequest = {
        compartmentId: compartmentID,
        lifecycleState: artifacts.models.ContainerRepository.LifecycleState.Available,
        limit: 1000
    };
    const result: artifacts.models.ContainerRepositorySummary[] = [];
    do {
        const response = await client.listContainerRepositories(request);
        result.push(...response.containerRepositoryCollection.items);
        request.page = response.opcNextPage;
    } while (request.page);
    return result;
}

export async function getContainerRepository(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, repositoryID: string): Promise<artifacts.models.ContainerRepository> {
    const client = new artifacts.ArtifactsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: artifacts.requests.GetContainerRepositoryRequest = {
        repositoryId: repositoryID
    };
    return client.getContainerRepository(request).then(response => response.containerRepository);
}

export async function deleteContainerRepository(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, repositoryID: string, wait: boolean = false) {
    const client = new artifacts.ArtifactsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const response = client.deleteContainerRepository({ repositoryId : repositoryID});
    if (wait) {
        await response;
    }
}

export async function listContainerImages(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string, repositoryID: string): Promise<artifacts.models.ContainerImageSummary[]> {
    const client = new artifacts.ArtifactsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: artifacts.requests.ListContainerImagesRequest = {
        compartmentId: compartmentID,
        repositoryId: repositoryID,
        lifecycleState: artifacts.models.ContainerImage.LifecycleState.Available,
        limit: 1000
    };
    const result: artifacts.models.ContainerImageSummary[] = [];
    do {
        const response = await client.listContainerImages(request);
        result.push(...response.containerImageCollection.items);
        request.page = response.opcNextPage;
    } while (request.page);
    return result;
}

export async function getContainerImage(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, imageID: string): Promise<artifacts.models.ContainerImage> {
    const client = new artifacts.ArtifactsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: artifacts.requests.GetContainerImageRequest = {
        imageId: imageID
    };
    return client.getContainerImage(request).then(response => response.containerImage);
}

export async function listDeployEnvironments(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, projectID: string): Promise<devops.models.DeployEnvironmentSummary[]> {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: devops.requests.ListDeployEnvironmentsRequest = {
        projectId: projectID,
        lifecycleState: devops.models.DeployEnvironment.LifecycleState.Active,
        limit: 1000
    };
    const result: devops.models.DeployEnvironmentSummary[] = [];
    do {
        const response = await client.listDeployEnvironments(request);
        result.push(...response.deployEnvironmentCollection.items);
        request.page = response.opcNextPage;
    } while (request.page);
    return result;
}

export async function deleteDeployEnvironment(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, envID: string, wait: boolean = false) {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: devops.requests.DeleteDeployEnvironmentRequest = {
        deployEnvironmentId: envID
    };
    const response = client.deleteDeployEnvironment(request);
    if (wait) {
        await devopsWaitForResourceCompletionStatus(authenticationDetailsProvider, "Deleting deploy environment", (await response).opcWorkRequestId);
    }
}

export async function deleteDeployEnvironmentsByDeployIDTag(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string, tag: string) {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: devops.requests.ListDeployEnvironmentsRequest = {
        compartmentId: compartmentID,
        limit: 1000
    };
    const environments: devops.models.DeployEnvironmentSummary[] = [];
    do {
        const response = await client.listDeployEnvironments(request);
        environments.push(...response.deployEnvironmentCollection.items);
        request.page = response.opcNextPage;
    } while (request.page);
    for (const environment of environments) {
        if (environment.freeformTags && environment.freeformTags['devops_tooling_deployID'] === tag
            && environment.lifecycleState !== devops.models.DeployEnvironment.LifecycleState.Deleting
            && environment.lifecycleState !== devops.models.DeployEnvironment.LifecycleState.Deleted) {
                await deleteDeployEnvironment(authenticationDetailsProvider, environment.id, true);
        }
    }
}

export async function listKnowledgeBases(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string): Promise<adm.models.KnowledgeBaseSummary[]> {
    const client = new adm.ApplicationDependencyManagementClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: adm.requests.ListKnowledgeBasesRequest = {
        compartmentId: compartmentID,
        lifecycleState: adm.models.KnowledgeBase.LifecycleState.Active,
        limit: 1000
    };
    const result: adm.models.KnowledgeBaseSummary[] = [];
    do {
        const response = await client.listKnowledgeBases(request);
        result.push(...response.knowledgeBaseCollection.items);
        request.page = response.opcNextPage;
    } while (request.page);
    return result;
}

export async function getKnowledgeBase(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, knowledgeBaseID: string): Promise<adm.models.KnowledgeBase> {
    const client = new adm.ApplicationDependencyManagementClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: adm.requests.GetKnowledgeBaseRequest = {
        knowledgeBaseId: knowledgeBaseID
    };
    return client.getKnowledgeBase(request).then(response => response.knowledgeBase);
}

export async function deleteKnowledgeBase(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, knowledgeId: string, wait: boolean = false) {
    const client = new adm.ApplicationDependencyManagementClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    let response = client.deleteKnowledgeBase({ knowledgeBaseId : knowledgeId});
    if (wait) {
        await admWaitForResourceCompletionStatus(authenticationDetailsProvider, "Deleting knowledge base", (await response).opcWorkRequestId);
    }
}    

export async function deleteKnowledgeBasesByDeployIDTag(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string, tag: string) {
    const client = new adm.ApplicationDependencyManagementClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: adm.requests.ListKnowledgeBasesRequest = {
        compartmentId: compartmentID,
        limit: 1000
    };
    const knowledgeBases: adm.models.KnowledgeBaseSummary[] = [];
    do {
        const response = await client.listKnowledgeBases(request);
        knowledgeBases.push(...response.knowledgeBaseCollection.items);
        request.page = response.opcNextPage;
    } while (request.page);
    for (const knowledgeBase of knowledgeBases) {
        if (knowledgeBase.freeformTags && knowledgeBase.freeformTags['devops_tooling_deployID'] === tag
            && knowledgeBase.lifecycleState !== adm.models.KnowledgeBase.LifecycleState.Deleting
            && knowledgeBase.lifecycleState !== adm.models.KnowledgeBase.LifecycleState.Deleted) {
                const audits = await listVulnerabilityAudits(authenticationDetailsProvider, compartmentID, knowledgeBase.id);
                for (const audit of audits) {
                    await deleteVulnerabilityAudit(authenticationDetailsProvider, audit.id, true);
                }
                await deleteKnowledgeBase(authenticationDetailsProvider, knowledgeBase.id, true);
        }
    }
}

export async function listVulnerabilityAudits(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string, knowledgeBaseID: string, limit?: number): Promise<adm.models.VulnerabilityAuditSummary[]> {
    const client = new adm.ApplicationDependencyManagementClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: adm.requests.ListVulnerabilityAuditsRequest = {
        compartmentId: compartmentID,
        knowledgeBaseId: knowledgeBaseID,
        lifecycleState: adm.models.VulnerabilityAudit.LifecycleState.Active,
        limit: limit ? Math.min(1000, limit) : 1000
    };
    const result: adm.models.VulnerabilityAuditSummary[] = [];
    do {
        const response = await client.listVulnerabilityAudits(request);
        result.push(...response.vulnerabilityAuditCollection.items);
        request.page = response.opcNextPage;
        if (limit) {
            request.limit = Math.min(1000, limit - result.length);
        }
    } while (request.page && (request.limit as number) > 0);
    return result;
}

export async function getVulnerabilityAudit(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, vulnerabilityAuditID: string): Promise<adm.models.VulnerabilityAudit> {
    const client = new adm.ApplicationDependencyManagementClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: adm.requests.GetVulnerabilityAuditRequest = {
        vulnerabilityAuditId: vulnerabilityAuditID
    };
    return client.getVulnerabilityAudit(request).then(response => response.vulnerabilityAudit);
}

export async function deleteVulnerabilityAudit(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, vulnerabilityAuditID: string, wait: boolean = false) {
    const client = new adm.ApplicationDependencyManagementClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    let response = client.deleteVulnerabilityAudit({ vulnerabilityAuditId : vulnerabilityAuditID });
    if (wait) {
        await response;
    }
}

export async function listNotificationTopics(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string): Promise<ons.models.NotificationTopicSummary[]> {
    const client = new ons.NotificationControlPlaneClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: ons.requests.ListTopicsRequest = {
        compartmentId: compartmentID,
        lifecycleState: ons.models.NotificationTopic.LifecycleState.Active,
        limit: 50
    };
    const result: ons.models.NotificationTopicSummary[] = [];
    do {
        const response = await client.listTopics(request);
        result.push(...response.items);
        request.page = response.opcNextPage;
    } while (request.page);
    return result;
}

/**
 * Requests creating a knowledgebase, returns a WorkRequestId that needs to be waited on using admWaitForResourceCompletionStatus
 * succeeds.
 * @param authenticationDetailsProvider 
 * @param compartmentID 
 * @param projectName 
 * @param flags 
 * @returns workRequestID to be waited on
 */
export async function createKnowledgeBase(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, 
    compartmentID: string, projectName: string, flags?: { [key: string]: string } | undefined): Promise<string> {
    const client = new adm.ApplicationDependencyManagementClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    
    // PENDING: displayName must match ".*(?:^[a-zA-Z_](-?[a-zA-Z_0-9])*$).*" -- transliterate invalid characters in name
    const displayName = `${projectName}Audits`;
    const request: adm.requests.CreateKnowledgeBaseRequest = {
        createKnowledgeBaseDetails: {
            compartmentId: compartmentID,
            displayName: displayName,
            freeformTags: flags
        }
    };
    return client.createKnowledgeBase(request).then(response => response.opcWorkRequestId);
}

export async function getFqnCompartmentName(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string): Promise<string> {
    const client = new identity.IdentityClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: identity.requests.GetCompartmentRequest = {
        compartmentId: compartmentID
    };
    let compartment = (await client.getCompartment(request)).compartment;
    let name = '';
    while (compartment.compartmentId) {
        name = name.length === 0 ? compartment.name : `${compartment.name}-${name}`;
        request.compartmentId = compartment.compartmentId;
        compartment = (await client.getCompartment(request)).compartment;
    }
    // NOTE: returns empty string for root tenancy
    return name;
}

export async function createCompartmentNotificationTopic(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string, description?: string): Promise<ons.models.NotificationTopic> {
    // // PENDING: Creating a notification with a name already used within the tenancy (although in a different compartment) fails - whether it is a feature or a bug is not known.
    // // Let's default the name to <FQN-Compartment-Name>-constant -- althoug even compartment name may not be unique (clearing non-allowed characters).
    // // TODO: check whether `${compartmentName}-${DEFAULT_NOTIFICATION_TOPIC}` exceeds 256 characters & shorten
    // let compartmentName = await getFqnCompartmentName(authenticationDetailsProvider, compartmentID);
    // if (compartmentName.length === 0) {
    //     compartmentName = 'root';
    // } else {
    //     compartmentName = compartmentName.replace(/[^a-zA-Z0-9_\-]+/g,''); // notification topic name only allows alphanum_-
    //     // TODO: notification topic name cannot contain subsequent -- !
    //     if (/^[^a-zA-Z_]/.test(compartmentName)) {
    //         compartmentName = `_${compartmentName}`; // notification topic name must have a leading letter or underscore
    //     }
    // }
    const name = `${DEFAULT_NOTIFICATION_TOPIC}-${Date.now()}`;
    const client = new ons.NotificationControlPlaneClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const requestDetails: ons.models.CreateTopicDetails = {
        // name: `${compartmentName}-${DEFAULT_NOTIFICATION_TOPIC}`,
        name: name,
        compartmentId: compartmentID,
        description: description
    };
    const request: ons.requests.CreateTopicRequest = {
        createTopicDetails: requestDetails
    };
    return client.createTopic(request).then(response => response.notificationTopic);
}

export async function getOrCreateNotificationTopic(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string, description?: string): Promise<{ notificationTopic: ons.models.NotificationTopic; created: boolean }> {
    const notificationTopics = await listNotificationTopics(authenticationDetailsProvider, compartmentID);
    if (notificationTopics.length > 0) {
        return { notificationTopic: notificationTopics[0], created: false };
    }
    return createCompartmentNotificationTopic(authenticationDetailsProvider, compartmentID, description).then(response => { return { notificationTopic: response, created: true };});
}

export async function getCluster(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, clusterID: string): Promise<containerengine.models.Cluster> {
    const client = new containerengine.ContainerEngineClient({
        authenticationDetailsProvider: authenticationDetailsProvider
    });
    const request: containerengine.requests.GetClusterRequest = {
        clusterId: clusterID,
    };
    return client.getCluster(request).then(response => response.cluster);
}

export async function listClusters(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string): Promise<containerengine.models.ClusterSummary[]> {
    const client = new containerengine.ContainerEngineClient({
        authenticationDetailsProvider: authenticationDetailsProvider
    });
    const request: containerengine.requests.ListClustersRequest = {
        compartmentId: compartmentID,
        lifecycleState: [ containerengine.models.ClusterLifecycleState.Active, containerengine.models.ClusterLifecycleState.Creating ],
        limit: 1000
    };
    const result: containerengine.models.ClusterSummary[] = [];
    do {
        const response = await client.listClusters(request);
        result.push(...response.items);
        request.page = response.opcNextPage;
    } while (request.page);
    return result;
}

export async function createDevOpsProject(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, projectName: string, compartmentID: string, notificationTopicID: string, description?: string, tags?: { [key:string] : string }): Promise<devops.models.Project> {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const requestDetails: devops.models.CreateProjectDetails = {
        name: projectName,
        description: description,
        notificationConfig: {
            topicId: notificationTopicID
        },
        compartmentId: compartmentID,
        freeformTags: tags
    };
    const request: devops.requests.CreateProjectRequest = {
        createProjectDetails: requestDetails
    };
    return client.createProject(request).then(response => response.project);
}

export async function listLogGroups(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string, name?: string): Promise<logging.models.LogGroupSummary[]> {
    const client = new logging.LoggingManagementClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: logging.requests.ListLogGroupsRequest = {
        compartmentId: compartmentID,
        displayName: name,
        limit: 1000
    };
    const result: logging.models.LogGroupSummary[] = [];
    do {
        const response = await client.listLogGroups(request);
        result.push(...response.items);
        request.page = response.opcNextPage;
    } while (request.page);
    return result;
}

export async function listLogs(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, logGroupID: string): Promise<logging.models.LogSummary[]> {
    const client = new logging.LoggingManagementClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: logging.requests.ListLogsRequest = {
        logGroupId: logGroupID,
        lifecycleState: logging.models.LogLifecycleState.Active,
        limit: 1000
    };
    const result: logging.models.LogSummary[] = [];
    do {
        const response = await client.listLogs(request);
        result.push(...response.items);
        request.page = response.opcNextPage;
    } while (request.page);
    return result;
}

export async function searchLogs(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string, logGroupID: string, logID: string, operation: 'buildRun' | 'deployment', operationID: string, timeStart: Date, timeEnd: Date): Promise<loggingsearch.models.SearchResult[]> {
    const client = new loggingsearch.LogSearchClient({ authenticationDetailsProvider: authenticationDetailsProvider });

    const requestDetails: loggingsearch.models.SearchLogsDetails = {
        timeStart: timeStart,
        timeEnd: timeEnd,
        searchQuery: `search "${compartmentID}/${logGroupID}/${logID}" | where data.${operation}Id = '${operationID}'`,
        isReturnFieldInfo: false
    };

    const result: loggingsearch.models.SearchResult[] = [];
    let nextPage;
    do {
        const request: loggingsearch.requests.SearchLogsRequest = {
            searchLogsDetails: requestDetails,
            limit: 1000,
            page: nextPage
        };
        const response = await client.searchLogs(request);
        if (response.searchResponse.results?.length) {
            if (!result.length && !response.opcNextPage) {
                return response.searchResponse.results;
            }
            result.push(...response.searchResponse.results);
        }
        nextPage = response.opcNextPage;
    } while (nextPage);

    return result;
}

export async function createDefaultLogGroup(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string, description?: string) {
    const client = new logging.LoggingManagementClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const requestDetails: logging.models.CreateLogGroupDetails = {
        compartmentId: compartmentID,
        displayName: DEFAULT_LOG_GROUP,
        description: description
    };
    const request: logging.requests.CreateLogGroupRequest = {
        createLogGroupDetails: requestDetails
    };
    const response = await client.createLogGroup(request);
    if (response.opcWorkRequestId) {
        const getWorkRequestRequest: logging.requests.GetWorkRequestRequest = {
            workRequestId: response.opcWorkRequestId
        };
        await completion(2000, async () => (await client.getWorkRequest(getWorkRequestRequest)).workRequest.status);
    }
}

export async function getDefaultLogGroup(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string, create?: boolean, description?: string): Promise<{ logGroup: logging.models.LogGroupSummary; created: boolean } | undefined> {
    const logGroup = await listLogGroups(authenticationDetailsProvider, compartmentID, DEFAULT_LOG_GROUP);
    if (logGroup.length > 0) {
        return { logGroup: logGroup[0], created: false };
    }
    if (create) {
        await createDefaultLogGroup(authenticationDetailsProvider, compartmentID, description);
        const logGroup = await listLogGroups(authenticationDetailsProvider, compartmentID, DEFAULT_LOG_GROUP);
        if (logGroup.length > 0) {
            return { logGroup: logGroup[0], created: true };
        }
    }
    return undefined;
}

export async function processWithinHomeRegion(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, task: () => Promise<any>): Promise<any> {
    const homeRegionKey = (await getTenancy(authenticationDetailsProvider)).homeRegionKey;
    if (!homeRegionKey) {
        return undefined;
    }
    const homeRegion = (await listRegions(authenticationDetailsProvider)).find(region => region.key === homeRegionKey)?.name;
    if (!homeRegion) {
        return undefined;
    }
    const currentRegion = authenticationDetailsProvider.getRegion().regionId;
    if (homeRegion === currentRegion) {
        return task();
    }
    try {
        authenticationDetailsProvider.setRegion(homeRegion);
        return task();
    } finally {
        authenticationDetailsProvider.setRegion(currentRegion);
    }
}

export async function listPolicies(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string, name?: string): Promise<identity.models.Policy[]> {
    const client = new identity.IdentityClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: identity.requests.ListPoliciesRequest = {
        compartmentId: compartmentID,
        name: name,
        limit: 1000
    };
    const result: identity.models.Policy[] = [];
    do {
        const response = await client.listPolicies(request);
        result.push(...response.items);
        request.page = response.opcNextPage;
    } while (request.page);
    return result;
}

export async function createPolicy(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string, description: string, statements: string[]): Promise<identity.models.Policy> {
    const client = new identity.IdentityClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const requestDetails: identity.models.CreatePolicyDetails = {
        compartmentId: compartmentID,
        name: DEFAULT_COMPARTMENT_ACCESS_POLICY,
        description,
        statements
    };
    const request: identity.requests.CreatePolicyRequest = {
        createPolicyDetails: requestDetails
    };
    return client.createPolicy(request).then(response => response.policy);
}

export async function updatePolicy(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, policyID: string, details: identity.models.UpdatePolicyDetails): Promise<identity.models.Policy> {
    const client = new identity.IdentityClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: identity.requests.UpdatePolicyRequest = {
        policyId: policyID,
        updatePolicyDetails: details
    };
    return client.updatePolicy(request).then(response => response.policy);
}

export async function getCompartmentAccessPolicy(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string, rules: string[], create?: boolean): Promise<string | undefined> {
    const policy = (await listPolicies(authenticationDetailsProvider, compartmentID, DEFAULT_COMPARTMENT_ACCESS_POLICY)).find(p => DEFAULT_COMPARTMENT_ACCESS_POLICY === p.name);
    if (policy) {
        let statements = [...policy.statements];
        for (let rule of rules) {
            if (!policy.statements.includes(rule)) {
                statements.push(rule);
            }
        }
        if (statements.length !== policy.statements.length) {
            await processWithinHomeRegion(authenticationDetailsProvider, () => updatePolicy(authenticationDetailsProvider, policy.id, { statements }));
        }
        return policy.id;
    }
    if (create) {
        return await processWithinHomeRegion(authenticationDetailsProvider, () => createPolicy(authenticationDetailsProvider, compartmentID, 'Default policy for accessing compartment resources created from VS Code', rules));
    }
    return undefined;
}

export async function updateCompartmentAccessPolicies(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string, okeCompartmentID?: string, subnetCompartmentID?: string): Promise<void> {
    if (okeCompartmentID) {
        await getCompartmentAccessPolicy(authenticationDetailsProvider, compartmentID, [
            `Allow any-user to read devops-family in compartment id ${compartmentID} where ALL {request.principal.type='devopsbuildpipeline', request.principal.compartment.id='${compartmentID}'}`,
            `Allow any-user to manage generic-artifacts in compartment id ${compartmentID} where ALL {request.principal.type='devopsbuildpipeline', request.principal.compartment.id='${compartmentID}'}`,
            `Allow any-user to manage repos in compartment id ${compartmentID} where ALL {request.principal.type='devopsbuildpipeline', request.principal.compartment.id='${compartmentID}'}`,
            `Allow any-user to manage compute-container-instances in compartment id ${compartmentID} where ALL {request.principal.type='devopsdeploypipeline', request.principal.compartment.id='${compartmentID}'}`,
            `Allow any-user to manage compute-containers in compartment id ${compartmentID} where ALL {request.principal.type='devopsdeploypipeline', request.principal.compartment.id='${compartmentID}'}`,
            `Allow any-user to read all-artifacts in compartment id ${compartmentID} where ALL {request.principal.type='devopsdeploypipeline', request.principal.compartment.id='${compartmentID}'}`,
        ], true);
        if (subnetCompartmentID) {
            await getCompartmentAccessPolicy(authenticationDetailsProvider, subnetCompartmentID, [
                `Allow any-user to use vnics in compartment id ${subnetCompartmentID} where ALL {request.principal.type='devopsdeploypipeline', request.principal.compartment.id='${compartmentID}'}`,
                `Allow any-user to use subnets in compartment id ${subnetCompartmentID} where ALL {request.principal.type='devopsdeploypipeline', request.principal.compartment.id='${compartmentID}'}`,
                `Allow any-user to use dhcp-options in compartment id ${subnetCompartmentID} where ALL {request.principal.type='devopsdeploypipeline', request.principal.compartment.id='${compartmentID}'}`
            ], true);
        }
        await getCompartmentAccessPolicy(authenticationDetailsProvider, okeCompartmentID, [
            `Allow any-user to manage clusters in compartment id ${okeCompartmentID} where ALL {request.principal.type='devopsdeploypipeline', request.principal.compartment.id='${compartmentID}'}`
        ], true);
    } else {
        await getCompartmentAccessPolicy(authenticationDetailsProvider, compartmentID, [
            `Allow any-user to read devops-family in compartment id ${compartmentID} where ALL {request.principal.type='devopsbuildpipeline', request.principal.compartment.id='${compartmentID}'}`,
            `Allow any-user to manage generic-artifacts in compartment id ${compartmentID} where ALL {request.principal.type='devopsbuildpipeline', request.principal.compartment.id='${compartmentID}'}`,
            `Allow any-user to manage repos in compartment id ${compartmentID} where ALL {request.principal.type='devopsbuildpipeline', request.principal.compartment.id='${compartmentID}'}`,
        ], true);
    }
}

export async function listLogsByProject(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentId: string, projectId?: string) : Promise<logging.models.LogSummary[]> {
    const client = new logging.LoggingManagementClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const value: logging.models.LogSummary[] = [];
    const groups = await listLogGroups(authenticationDetailsProvider, compartmentId);
    for (let lg of groups) {
        let logs = (await client.listLogs({ 
                logGroupId: lg.id, 
                sourceResource : projectId
            }))?.items;
        logs.forEach(l => {
            if (!projectId || l.configuration?.source?.resource === projectId) {
                // for some reason, the filter for "sourceResource" in listLogs does not work.
                switch (l.lifecycleState) {
                    case logging.models.LogLifecycleState.Active:
                    case logging.models.LogLifecycleState.Creating:
                    case logging.models.LogLifecycleState.Updating:
                        value.push(l);
                        break;
                }
            }
        });
    }
    return value;
}

export async function getLog(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, logId : string, logGroupID: string): Promise<logging.models.Log> {
    const client = new logging.LoggingManagementClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    return client.getLog({
        logGroupId : logGroupID,
        logId : logId
    }).then(response => response.log);
}

export async function deleteLog(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, logId : string, logGroupID: string, wait : boolean = false) {
    const client = new logging.LoggingManagementClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    // console.log(`> deleteLog ${logId}`);
    const response = client.deleteLog({ 
        logGroupId : logGroupID, 
        logId : logId
    });
    if (wait) {
        await loggingWaitForResourceCompletionStatus(authenticationDetailsProvider, "Deleting project log", (await response).opcWorkRequestId);
    }
}

export async function deleteLogsByDeployIDTag(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, logGroupID: string, tag: string) {
    const client = new logging.LoggingManagementClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: logging.requests.ListLogsRequest = {
        logGroupId: logGroupID,
        limit: 1000
    };
    const logs: logging.models.LogSummary[] = [];
    do {
        const response = await client.listLogs(request);
        logs.push(...response.items);
        request.page = response.opcNextPage;
    } while (request.page);
    for (const log of logs) {
        if (log.freeformTags && log.freeformTags['devops_tooling_deployID'] === tag
            && log.lifecycleState !== logging.models.LogLifecycleState.Deleting) {
                await deleteLog(authenticationDetailsProvider, log.id, logGroupID, true);
        }
    }
}

export async function createProjectLog(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string, logGroupID: string, projectID: string, logName: string, tags?: { [key:string] : string }): Promise<string | undefined> {
    const client = new logging.LoggingManagementClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const requestDetails: logging.models.CreateLogDetails = {
        displayName: logName,
        logType: logging.models.CreateLogDetails.LogType.Service,
        isEnabled: true,
        configuration: {
            compartmentId: compartmentID,
            source: {
                sourceType: logging.models.OciService.sourceType,
                service: 'devops',
                resource: projectID,
                category: 'all',
                parameters: {}
            },
            archiving: {
                isEnabled: false
            }
        },
        retentionDuration: 30,
        freeformTags: tags
    };
    const request: logging.requests.CreateLogRequest = {
        logGroupId: logGroupID,
        createLogDetails: requestDetails
    };
    return client.createLog(request).then(response => response.opcWorkRequestId);
}

export async function createArtifactsRepository(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string, projectName: string, flags? : { [key:string] : string } | undefined): Promise<artifacts.models.Repository> {
    const client = new artifacts.ArtifactsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const requestDetails: artifacts.models.CreateGenericRepositoryDetails = {
        repositoryType: artifacts.models.CreateGenericRepositoryDetails.repositoryType,
        displayName: `${projectName}ArtifactRepository`,
        compartmentId: compartmentID,
        description: `Artifact repository for devops project ${projectName}`,
        isImmutable: false,
        freeformTags: flags
    };
    const request: artifacts.requests.CreateRepositoryRequest = {
        createRepositoryDetails: requestDetails
    };
    return client.createRepository(request).then(response => response.repository);
}

export async function createContainerRepository(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string, repositoryName: string): Promise<artifacts.models.ContainerRepository> {
    const client = new artifacts.ArtifactsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const requestDetails: artifacts.models.CreateContainerRepositoryDetails = {
        compartmentId: compartmentID,
        displayName: repositoryName.toLowerCase(),
        isImmutable: false,
        isPublic: false
    };
    const request: artifacts.requests.CreateContainerRepositoryRequest = {
        createContainerRepositoryDetails: requestDetails
    };
    return client.createContainerRepository(request).then(response => response.containerRepository);
}

export async function createOkeDeployEnvironment(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, projectID: string, projectName: string, clusterID: string, tags?: { [key:string]: string }): Promise<devops.models.DeployEnvironment> {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const requestDetails: devops.models.CreateOkeClusterDeployEnvironmentDetails = {
        deployEnvironmentType: devops.models.CreateOkeClusterDeployEnvironmentDetails.deployEnvironmentType,
        displayName: `${projectName}OkeDeployEnvironment`,
        description: `OKE cluster environment for devops project ${projectName}`,
        projectId: projectID,
        clusterId: clusterID,
        freeformTags: tags
    };
    const request: devops.requests.CreateDeployEnvironmentRequest = {
        createDeployEnvironmentDetails: requestDetails
    };
    return client.createDeployEnvironment(request).then(response => response.deployEnvironment);
}

export async function createCodeRepository(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, projectID: string, repositoryName: string, defaultBranchName: string, description?: string, tags?: { [key:string]: string }): Promise<{ repository: devops.models.Repository; workRequestId: string }> {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const requestDetails: devops.models.CreateRepositoryDetails = {
        name: repositoryName,
        description: description,
        projectId: projectID,
        defaultBranch: defaultBranchName,
        repositoryType: devops.models.Repository.RepositoryType.Hosted,
        freeformTags: tags
    };
    const request: devops.requests.CreateRepositoryRequest = {
        createRepositoryDetails: requestDetails
    };
    return client.createRepository(request).then(response => {
        return { repository: response.repository, workRequestId: response.opcWorkRequestId };
    });
}

export async function updateCodeRepository(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, repositoryID: string, repositoryName?: string, defaultBranchName?: string, description?: string, tags?: { [key:string]: string }): Promise<{ repository: devops.models.Repository; workRequestId: string }> {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const requestDetails: devops.models.UpdateRepositoryDetails = {
        name: repositoryName,
        description: description,
        defaultBranch: defaultBranchName,
        freeformTags: tags
    };
    const request: devops.requests.UpdateRepositoryRequest = {
        repositoryId: repositoryID,
        updateRepositoryDetails: requestDetails
    };
    return client.updateRepository(request).then(response => {
        return { repository: response.repository, workRequestId: response.opcWorkRequestId };
    });
}

export async function createBuildPipeline(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, projectID: string, displayName: string, description?: string, params: { name: string; defaultValue: string; description: string }[] = [], tags?: { [key:string]: string }): Promise<devops.models.BuildPipeline> {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const requestDetails: devops.models.CreateBuildPipelineDetails = {
        displayName: displayName,
        description: description,
        projectId: projectID,
        buildPipelineParameters: {
            items: params
        }
    };
    if (tags) {
        requestDetails.freeformTags = tags;
    }
    const request: devops.requests.CreateBuildPipelineRequest = {
        createBuildPipelineDetails: requestDetails
    };
    return client.createBuildPipeline(request).then(response => response.buildPipeline);
}

export async function createBuildPipelineBuildStage(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, pipelineID: string, repositoryID: string, repositoryName: string, repositoryUrl: string, buildSpecFile: string, useNIShape: boolean, tags?: { [key:string]: string }): Promise<devops.models.BuildPipelineStage> {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const requestDetails: devops.models.CreateBuildStageDetails = {
        displayName: 'Build',
        description: 'Build stage generated by VS Code',
        buildPipelineId: pipelineID,
        buildPipelineStagePredecessorCollection: {
            items: [
                {
                    id: pipelineID
                }
            ]
        },
        buildSpecFile: buildSpecFile,
        image: BUILD_IMAGE,
        buildSourceCollection: {
            items: [
                {
                    name: repositoryName,
                    repositoryUrl: repositoryUrl,
                    repositoryId: repositoryID,
                    branch: 'master',
                    connectionType: devops.models.DevopsCodeRepositoryBuildSource.connectionType
                }
            ] as devops.models.DevopsCodeRepositoryBuildSource[]
        },
        buildPipelineStageType: devops.models.CreateBuildStageDetails.buildPipelineStageType,
        freeformTags: tags
    };
    if (useNIShape) {
        //(requestDetails as any).buildRunnerShapeConfig = ociFeatures.niRunnerShapeConfig();
    }
    const request: devops.requests.CreateBuildPipelineStageRequest = {
        createBuildPipelineStageDetails: requestDetails
    };
    return client.createBuildPipelineStage(request).then(response => response.buildPipelineStage);
}

export async function createBuildPipelineArtifactsStage(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, pipelineID: string, buildStageID: string, artifactID: string, artifactName: string, tags?: { [key:string]: string }): Promise<devops.models.BuildPipelineStage> {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const requestDetails: devops.models.CreateDeliverArtifactStageDetails = {
        displayName: 'Artifacts',
        description: 'Artifacts stage generated by VS Code',
        buildPipelineId: pipelineID,
        buildPipelineStagePredecessorCollection: {
            items: [
                {
                    id: buildStageID
                }
            ]
        },
        deliverArtifactCollection: {
            items: [
                {
                    artifactName: artifactName,
                    artifactId: artifactID
                }
            ]
        },
        buildPipelineStageType: devops.models.CreateDeliverArtifactStageDetails.buildPipelineStageType,
        freeformTags: tags
    };
    const request: devops.requests.CreateBuildPipelineStageRequest = {
        createBuildPipelineStageDetails: requestDetails
    };
    return client.createBuildPipelineStage(request).then(response => response.buildPipelineStage);
}

export async function createDeployPipeline(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, projectID: string, name: string, description?: string, params?: devops.models.DeployPipelineParameter[], tags?: { [key:string]: string }): Promise<devops.models.DeployPipeline> {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const requestDetails: devops.models.CreateDeployPipelineDetails = {
        displayName: name,
        description: description,
        projectId: projectID,
        deployPipelineParameters: params ? { items: params } : undefined,
        freeformTags: tags
    };
    const request: devops.requests.CreateDeployPipelineRequest = {
        createDeployPipelineDetails: requestDetails
    };
    return client.createDeployPipeline(request).then(response => response.deployPipeline);
}

export async function createSetupKubernetesDockerSecretStage(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, pipelineID: string, commandSpecArtifactID: string, subnetID: string, tags?: { [key:string]: string }): Promise<devops.models.DeployStage> {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const requestDetails: devops.models.CreateShellDeployStageDetails = {
        displayName: 'Setup Kubernetes Secret',
        description: 'Setup stage generated by VS Code',
        deployPipelineId: pipelineID,
        deployStagePredecessorCollection: {
            items: [
                { id: pipelineID }
            ]
        },
        commandSpecDeployArtifactId: commandSpecArtifactID,
        containerConfig: {
            shapeName: 'CI.Standard.E4.Flex',
            shapeConfig: {
                ocpus: 1,
                memoryInGBs: 1
            },
            networkChannel: {
                subnetId: subnetID,
                networkChannelType: devops.models.ServiceVnicChannel.networkChannelType
            },
            containerConfigType: devops.models.ContainerInstanceConfig.containerConfigType
        },
        deployStageType: devops.models.CreateShellDeployStageDetails.deployStageType,
        freeformTags: tags
    };
    const request: devops.requests.CreateDeployStageRequest = {
        createDeployStageDetails: requestDetails
    };
    return client.createDeployStage(request).then(response => response.deployStage);
}

export async function createDeployToOkeStage(displayName: string, authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, pipelineID: string, setupStageID: string, environmentID: string, deployArtifactID: string, tags?: { [key:string]: string }): Promise<devops.models.DeployStage> {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const requestDetails: devops.models.CreateOkeDeployStageDetails = {
        displayName: displayName,
        description: 'Deployment stage generated by VS Code',
        deployPipelineId: pipelineID,
        deployStagePredecessorCollection: {
            items: [
                { id: setupStageID }
            ]
        },
        kubernetesManifestDeployArtifactIds: [
            deployArtifactID
        ],
        okeClusterDeployEnvironmentId: environmentID,
        deployStageType: devops.models.CreateOkeDeployStageDetails.deployStageType,
        freeformTags: tags
    };
    const request: devops.requests.CreateDeployStageRequest = {
        createDeployStageDetails: requestDetails
    };
    return client.createDeployStage(request).then(response => response.deployStage);
}

export async function getDeployStage(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, deployStageID: string): Promise<devops.models.DeployStage> {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: devops.requests.GetDeployStageRequest = {
        deployStageId: deployStageID
    };
    return client.getDeployStage(request).then(response => response.deployStage);
}

export async function listBuildRuns(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, buildPipelineID: string, limit: number | undefined = 10): Promise<devops.models.BuildRunSummary[]> {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: devops.requests.ListBuildRunsRequest = {
        buildPipelineId: buildPipelineID,
        limit: limit ? Math.min(1000, limit) : 1000
    };
    const result: devops.models.BuildRunSummary[] = [];
    do {
        const response = await client.listBuildRuns(request);
        result.push(...response.buildRunSummaryCollection.items);
        request.page = response.opcNextPage;
        if (limit) {
            request.limit = Math.min(1000, limit - result.length);
        }
    } while (request.page && (request.limit as number) > 0);
    return result;
}

export async function getBuildRun(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, buildRunID: string): Promise<devops.models.BuildRun> {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: devops.requests.GetBuildRunRequest = {
        buildRunId: buildRunID
    };
    return client.getBuildRun(request).then(response => response.buildRun);
}

export async function createBuildRun(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, pipelineID: string, name: string, params: { name: string; value: string }[] = [], commitInfo?: devops.models.CommitInfo): Promise<devops.models.BuildRun> {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const requestDetails: devops.models.CreateBuildRunDetails = {
        displayName: name,
        buildPipelineId: pipelineID,
        buildRunArguments: {
            items: params
        },
        commitInfo
    };
    const request: devops.requests.CreateBuildRunRequest = {
        createBuildRunDetails: requestDetails
    };
    return client.createBuildRun(request).then(response => response.buildRun);
}

export async function cancelBuildRun(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, buildRunId: string): Promise<devops.models.BuildRun> {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const requestDetails: devops.models.CancelBuildRunDetails = {
        reason: 'Canceled from VS Code by the user'
    };
    const request: devops.requests.CancelBuildRunRequest = {
        cancelBuildRunDetails: requestDetails,
        buildRunId: buildRunId
    };
    return client.cancelBuildRun(request).then(response => response.buildRun);
}

export async function listDeployments(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, pipelineID: string, limit: number | undefined = 10): Promise<devops.models.DeploymentSummary[]> {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: devops.requests.ListDeploymentsRequest = {
        deployPipelineId: pipelineID,
        limit: limit ? Math.min(1000, limit) : 1000
    };
    const result: devops.models.DeploymentSummary[] = [];
    do {
        const response = await client.listDeployments(request);
        result.push(...response.deploymentCollection.items);
        request.page = response.opcNextPage;
        if (limit) {
            request.limit = Math.min(1000, limit - result.length);
        }
    } while (request.page && (request.limit as number) > 0);
    return result;
}

export async function getDeployment(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, deploymentID: string): Promise<devops.models.Deployment> {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: devops.requests.GetDeploymentRequest = {
        deploymentId: deploymentID
    };
    return client.getDeployment(request).then(response => response.deployment);
}

export async function createDeployment(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, pipelineID: string, name: string, args?: devops.models.DeploymentArgument[], tags?: { [key:string]: string }): Promise<devops.models.Deployment> {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const requestDetails: devops.models.CreateDeployPipelineDeploymentDetails = {
        displayName: name,
        deploymentType: devops.models.CreateDeployPipelineDeploymentDetails.deploymentType,
        deployPipelineId: pipelineID,
        deploymentArguments: args ? { items: args } : undefined,
        freeformTags: tags
    };
    const request: devops.requests.CreateDeploymentRequest = {
        createDeploymentDetails: requestDetails
    };
    return client.createDeployment(request).then(response => response.deployment);
}

export async function cancelDeployment(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, deploymentId: string): Promise<devops.models.Deployment> {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const requestDetails: devops.models.CancelDeploymentDetails = {
        reason: 'Canceled from VS Code by the user'
    };
    const request: devops.requests.CancelDeploymentRequest = {
        cancelDeploymentDetails: requestDetails,
        deploymentId: deploymentId
    };
    return client.cancelDeployment(request).then(response => response.deployment);
}

export async function createProjectDevArtifact(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, repositoryID: string, projectID: string, artifactPath: string, artifactName: string, artifactDescription: string, tags?: { [key:string]: string }): Promise<devops.models.DeployArtifact> {
    return createDeployArtifact(authenticationDetailsProvider, projectID, artifactName, artifactDescription, devops.models.DeployArtifact.DeployArtifactType.GenericFile, {
        repositoryId: repositoryID,
        deployArtifactPath: artifactPath,
        deployArtifactVersion: 'dev',
        deployArtifactSourceType: devops.models.GenericDeployArtifactSource.deployArtifactSourceType
    }, tags);
}

export async function createProjectDockerArtifact(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, projectID: string, imageURI: string, artifactName: string, artifactDescription: string, tags?: { [key:string]: string }): Promise<devops.models.DeployArtifact> {
    return createDeployArtifact(authenticationDetailsProvider, projectID, artifactName, artifactDescription, devops.models.DeployArtifact.DeployArtifactType.DockerImage, {
        imageUri: imageURI,
        deployArtifactSourceType: devops.models.OcirDeployArtifactSource.deployArtifactSourceType
    }, tags);
}

export async function createOkeDeploySetupCommandArtifact(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, projectID: string, artifactInlineContent: string, artifactName: string, artifactDescription: string, tags?: { [key:string]: string }): Promise<devops.models.DeployArtifact> {
    return createDeployArtifact(authenticationDetailsProvider, projectID, artifactName, artifactDescription, devops.models.DeployArtifact.DeployArtifactType.CommandSpec, {
        base64EncodedContent: Buffer.from(artifactInlineContent, 'binary').toString('base64'),
        deployArtifactSourceType: devops.models.InlineDeployArtifactSource.deployArtifactSourceType
    }, tags);
}

export async function createOkeDeployConfigurationArtifact(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, projectID: string, artifactInlineContent: string, artifactName: string, artifactDescription: string, tags?: { [key:string]: string }): Promise<devops.models.DeployArtifact> {
    return createDeployArtifact(authenticationDetailsProvider, projectID, artifactName, artifactDescription, devops.models.DeployArtifact.DeployArtifactType.KubernetesManifest, {
        base64EncodedContent: Buffer.from(artifactInlineContent, 'binary').toString('base64'),
        deployArtifactSourceType: devops.models.InlineDeployArtifactSource.deployArtifactSourceType
    }, tags);
}

async function createDeployArtifact(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, projectID: string, displayName: string, description: string, deployArtifactType: string, deployArtifactSource: devops.models.GenericDeployArtifactSource | devops.models.OcirDeployArtifactSource | devops.models.InlineDeployArtifactSource, tags?: { [key:string]: string }): Promise<devops.models.DeployArtifact> {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const createDeployArtifactDetails: devops.models.CreateDeployArtifactDetails = {
        displayName,
        description,
        deployArtifactType,
        deployArtifactSource,
        argumentSubstitutionMode: devops.models.DeployArtifact.ArgumentSubstitutionMode.SubstitutePlaceholders,
        projectId: projectID,
        freeformTags: tags
    };
    const request: devops.requests.CreateDeployArtifactRequest = {
        createDeployArtifactDetails: createDeployArtifactDetails
    };
    return client.createDeployArtifact(request).then(response => response.deployArtifact);
}

export async function creatGenericInlineArtifact(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, projectID: string, artifactName: string, artifactDescription: string, artifactInlineContent: string, tags?: { [key:string]: string }): Promise<devops.models.DeployArtifact> {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const deployArtifactSource: devops.models.InlineDeployArtifactSource = {
        base64EncodedContent: Buffer.from(artifactInlineContent, 'binary').toString('base64'),
        deployArtifactSourceType: devops.models.InlineDeployArtifactSource.deployArtifactSourceType
    };
    const createDeployArtifactDetails: devops.models.CreateDeployArtifactDetails = {
        displayName: artifactName,
        description: artifactDescription,
        deployArtifactType: devops.models.DeployArtifact.DeployArtifactType.GenericFile,
        deployArtifactSource: deployArtifactSource,
        argumentSubstitutionMode: devops.models.DeployArtifact.ArgumentSubstitutionMode.None,
        projectId: projectID,
        freeformTags: tags
    };
    const request: devops.requests.CreateDeployArtifactRequest = {
        createDeployArtifactDetails: createDeployArtifactDetails
    };
    return client.createDeployArtifact(request).then(response => response.deployArtifact);
}

export async function listVCNs(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string, name?: string): Promise<core.models.Vcn[]> {
    const client = new core.VirtualNetworkClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: core.requests.ListVcnsRequest = {
        compartmentId: compartmentID,
        lifecycleState: core.models.Vcn.LifecycleState.Available,
        displayName: name,
        limit: 1000
    };
    const result: core.models.Vcn[] = [];
    do {
        const response = await client.listVcns(request);
        result.push(...response.items);
        request.page = response.opcNextPage;
    } while (request.page);
    return result;
}

export async function createVCN(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string, name?: string, tags?: { [key:string] : string }): Promise<core.models.Vcn> {
    const client = new core.VirtualNetworkClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const requestDetails: core.models.CreateVcnDetails = {
        displayName: name,
        compartmentId: compartmentID,
        cidrBlocks: ['10.0.0.0/24'],
        freeformTags: tags
    };
    const request: core.requests.CreateVcnRequest = {
        createVcnDetails: requestDetails
    };
    return client.createVcn(request).then(response => response.vcn);
}

export async function getVCN(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, vcnID: string): Promise<core.models.Vcn> {
    const client = new core.VirtualNetworkClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: core.requests.GetVcnRequest = {
        vcnId: vcnID
    };
    return client.getVcn(request).then(response => response.vcn);
}

export async function deleteVCN(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, vcnID: string): Promise<string> {
    const client = new core.VirtualNetworkClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: core.requests.DeleteVcnRequest = {
        vcnId: vcnID
    };
    return client.deleteVcn(request).then(response => response.opcRequestId);
}

export async function createInternetGateway(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string, vcnID: string, name?: string, tags?: { [key:string] : string }): Promise<core.models.InternetGateway> {
    const client = new core.VirtualNetworkClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const requestDetails: core.models.CreateInternetGatewayDetails = {
        displayName: name,
        compartmentId: compartmentID,
        vcnId: vcnID,
        isEnabled: true,
        freeformTags: tags
    };
    const request: core.requests.CreateInternetGatewayRequest = {
        createInternetGatewayDetails: requestDetails
    };
    return client.createInternetGateway(request).then(response => response.internetGateway);
}

export async function listInternetGateways(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string, vcnID: string, name?: string): Promise<core.models.InternetGateway[]> {
    const client = new core.VirtualNetworkClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: core.requests.ListInternetGatewaysRequest = {
        compartmentId: compartmentID,
        vcnId: vcnID,
        lifecycleState: core.models.InternetGateway.LifecycleState.Available,
        displayName: name,
        limit: 100
    };
    const result: core.models.InternetGateway[] = [];
    do {
        const response = await client.listInternetGateways(request);
        result.push(...response.items);
        request.page = response.opcNextPage;
    } while (request.page);
    return result;
}

export async function deleteInternetGateway(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, igID: string): Promise<string> {
    const client = new core.VirtualNetworkClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: core.requests.DeleteInternetGatewayRequest = {
        igId: igID
    };
    return client.deleteInternetGateway(request).then(response => response.opcRequestId);
}

export async function listSubnets(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string, vcnID?: string, name?: string): Promise<core.models.Subnet[]> {
    const client = new core.VirtualNetworkClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: core.requests.ListSubnetsRequest = {
        compartmentId: compartmentID,
        vcnId: vcnID,
        lifecycleState: core.models.Subnet.LifecycleState.Available,
        displayName: name,
        limit: 1000
    };
    const result: core.models.Subnet[] = [];
    do {
        const response = await client.listSubnets(request);
        result.push(...response.items);
        request.page = response.opcNextPage;
    } while (request.page);
    return result;
}

export async function createSubnet(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string, vcnID: string, name?: string, tags?: { [key:string] : string }): Promise<core.models.Subnet> {
    const client = new core.VirtualNetworkClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const requestDetails: core.models.CreateSubnetDetails = {
        displayName: name,
        cidrBlock: '10.0.0.0/24',
        compartmentId: compartmentID,
        vcnId: vcnID,
        freeformTags: tags
    };
    const request: core.requests.CreateSubnetRequest = {
        createSubnetDetails: requestDetails
    };
    return client.createSubnet(request).then(response => response.subnet);
}

export async function getSubnet(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, subnetID: string): Promise<core.models.Subnet> {
    const client = new core.VirtualNetworkClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: core.requests.GetSubnetRequest = {
        subnetId: subnetID
    };
    return client.getSubnet(request).then(response => response.subnet);
}

export async function deleteSubnet(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, subnetID: string): Promise<string> {
    const client = new core.VirtualNetworkClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: core.requests.DeleteSubnetRequest = {
        subnetId: subnetID
    };
    return client.deleteSubnet(request).then(response => response.opcRequestId);
}

export async function getSecurityList(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, securityListID: string): Promise<core.models.SecurityList> {
    const client = new core.VirtualNetworkClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    
    const request: core.requests.GetSecurityListRequest = {
        securityListId: securityListID
    };
    
    return client.getSecurityList(request).then(response => response.securityList);
}

export async function updateSecurityList(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, securityListID: string, ingressSecurityRules?: Array<core.models.IngressSecurityRule>, egressSecurityRules?: Array<core.models.EgressSecurityRule>): Promise<core.models.SecurityList> {
    const client = new core.VirtualNetworkClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    
    const requestDetails: core.models.UpdateSecurityListDetails = {
        ingressSecurityRules: ingressSecurityRules,
        egressSecurityRules: egressSecurityRules
    };
    
    const request: core.requests.UpdateSecurityListRequest = {
        securityListId: securityListID,
        updateSecurityListDetails: requestDetails
    };
    
    return client.updateSecurityList(request).then(response => response.securityList);
}

export async function getRouteTable(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, routeTableID: string): Promise<core.models.RouteTable> {
    const client = new core.VirtualNetworkClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    
    const request: core.requests.GetRouteTableRequest = {
        rtId: routeTableID
    };
    
    return client.getRouteTable(request).then(response => response.routeTable);
}

export async function updateRouteTable(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, routeTableID: string, routeRules?: Array<core.models.RouteRule>): Promise<core.models.RouteTable> {
    const client = new core.VirtualNetworkClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    
    const requestDetails: core.models.UpdateRouteTableDetails = {
        routeRules: routeRules
    };
    
    const request: core.requests.UpdateRouteTableRequest = {
        rtId: routeTableID,
        updateRouteTableDetails: requestDetails
    };
    
    return client.updateRouteTable(request).then(response => response.routeTable);
}

export async function getVNIC(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, vnicID: string): Promise<core.models.Vnic> {
    const client = new core.VirtualNetworkClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    
    const request: core.requests.GetVnicRequest = {
        vnicId: vnicID
    };
    
    return client.getVnic(request).then(response => response.vnic);
}

export async function listContainerInstances(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string, name?: string): Promise<containerinstances.models.ContainerInstanceSummary[]> {
    const client = new containerinstances.ContainerInstanceClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: containerinstances.requests.ListContainerInstancesRequest = {
        compartmentId: compartmentID,
        lifecycleState: containerinstances.models.ContainerInstance.LifecycleState.Active,
        displayName: name,
        limit: 1000
    };
    const result: containerinstances.models.ContainerInstanceSummary[] = [];
    do {
        const response = await client.listContainerInstances(request);
        result.push(...response.containerInstanceCollection.items);
        request.page = response.opcNextPage;
    } while (request.page);
    return result;
}

export async function listContainerInstanceContainers(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string, containerInstanceID: string): Promise<containerinstances.models.ContainerSummary[]> {
    const client = new containerinstances.ContainerInstanceClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: containerinstances.requests.ListContainersRequest = {
        compartmentId: compartmentID,
        containerInstanceId: containerInstanceID,
        limit: 1000
    };
    const result: containerinstances.models.ContainerSummary[] = [];
    do {
        const response = await client.listContainers(request);
        result.push(...response.containerCollection.items);
        request.page = response.opcNextPage;
    } while (request.page);
    return result;
}

export async function getContainerInstance(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, containerInstanceID: string): Promise<containerinstances.models.ContainerInstance> {
    const client = new containerinstances.ContainerInstanceClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    
    const request: containerinstances.requests.GetContainerInstanceRequest = {
        containerInstanceId: containerInstanceID
    };
    
    return client.getContainerInstance(request).then(response => response.containerInstance);
}

export async function createContainerInstance(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string, imageURL: string, subnetID: string, name: string, username: string, password: string): Promise<{ containerInstance: containerinstances.models.ContainerInstance; workRequestId: string }> {
    const client = new containerinstances.ContainerInstanceClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    
    const shapeConfig: containerinstances.models.CreateContainerInstanceShapeConfigDetails = {
        ocpus: 1
        // memoryInGBs: 1
    };

    const containerDetails: containerinstances.models.CreateContainerDetails = {
        imageUrl: imageURL
    };

    const vnicDetails: containerinstances.models.CreateContainerVnicDetails = {
        subnetId: subnetID
    };

    const imagePullSecretDetails: containerinstances.models.CreateBasicImagePullSecretDetails = {
        secretType: 'BASIC',
        registryEndpoint: `${authenticationDetailsProvider.getRegion().regionCode}.ocir.io`,
        username: Buffer.from(username).toString('base64'),
        password: Buffer.from(password).toString('base64')
    };

    const requestDetails: containerinstances.models.CreateContainerInstanceDetails = {
        displayName: name,
        compartmentId: compartmentID,
        availabilityDomain: 'hkYI:PHX-AD-1',
        shape: 'CI.Standard.E4.Flex',
        shapeConfig: shapeConfig,
        containers: [ containerDetails ],
        vnics: [ vnicDetails ],
        imagePullSecrets: [ imagePullSecretDetails ]
    };

    const request: containerinstances.requests.CreateContainerInstanceRequest = {
        createContainerInstanceDetails: requestDetails
    };
    
    return client.createContainerInstance(request).then(response => { return { containerInstance: response.containerInstance, workRequestId: response.opcWorkRequestId }; });
}

export async function startContainerInstance(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, containerInstanceID: string): Promise<string> {
    const client = new containerinstances.ContainerInstanceClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    
    const request: containerinstances.requests.StartContainerInstanceRequest = {
        containerInstanceId: containerInstanceID
    };
    
    return client.startContainerInstance(request).then(response => response.opcWorkRequestId);
}

export async function restartContainerInstance(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, containerInstanceID: string): Promise<string> {
    const client = new containerinstances.ContainerInstanceClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    
    const request: containerinstances.requests.RestartContainerInstanceRequest = {
        containerInstanceId: containerInstanceID
    };
    
    return client.restartContainerInstance(request).then(response => response.opcWorkRequestId);
}

export async function deleteContainerInstance(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, containerInstanceID: string): Promise<string> {
    const client = new containerinstances.ContainerInstanceClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    
    const request: containerinstances.requests.DeleteContainerInstanceRequest = {
        containerInstanceId: containerInstanceID
    };
    
    return client.deleteContainerInstance(request).then(response => response.opcWorkRequestId);
}

export async function getContainer(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, containerID: string): Promise<containerinstances.models.Container> {
    const client = new containerinstances.ContainerInstanceClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    
    const request: containerinstances.requests.GetContainerRequest = {
        containerId: containerID
    };
    
    return client.getContainer(request).then(response => response.container);
}

export async function getContainerLog(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, containerID: string): Promise<any> {
    const client = new containerinstances.ContainerInstanceClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    
    const request: containerinstances.requests.RetrieveLogsRequest = {
        containerId: containerID
    };
    
    return client.retrieveLogs(request).then(response => response.value);
}

export async function containerInstancesWaitForResourceCompletionStatus(
    authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider,
    resourceDescription: string, requestId: string): Promise<string> {
    
    const client = new containerinstances.ContainerInstanceClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const waiter = new containerinstances.ContainerInstanceWaiter(client);
    
    const request: containerinstances.requests.GetWorkRequestRequest = {
        workRequestId: requestId,
    };

    const response = await waiter.forWorkRequest(request);
    if (response.workRequest.status !== containerinstances.models.OperationStatus.Succeeded) {
        throw new Error(`Creation of ${resourceDescription} failed`);
    }

    // PENDING: what exactly do the 'affected resources' mean ???
    return response.workRequest.resources[0].identifier;
}

export async function completion(initialPollTime: number, getState: () => Promise<string | undefined>, checkFirst?: boolean): Promise<string | undefined> {
    // TODO: use increasing polling time
    const pollTime = initialPollTime;
    let state: string | undefined;
    if (checkFirst) {
        while (isRunning(state = await getState())) {
            await delay(pollTime);
        }
    } else {
        do {
            await delay(pollTime);
            state = await getState();
        } while (isRunning(state));
    }
    return state;
}

export function isRunning(state?: string) {
    return state === 'ACCEPTED' || state === 'IN_PROGRESS' || state === 'CANCELING' || state === 'CREATING';
}

export function isUp(state?: string) {
    return state === 'ACTIVE' || state === 'CREATING';
}

export function isActive(state?: string) {
    return state === 'ACTIVE';
}

export function isSuccess(state?: string) {
    return state === 'SUCCEEDED';
}

export function getTimestamp(): string {
    const date = new Date();
    const year = date.getFullYear();
    let month = (date.getMonth() + 1).toString();
    if (month.length === 1) month = `0${month}`;
    let day = date.getDate().toString();
    if (day.length === 1) day = `0${day}`;
    let hours = date.getHours().toString();
    if (hours.length === 1) hours = `0${hours}`;
    let minutes = date.getMinutes().toString();
    if (minutes.length === 1) minutes = `0${minutes}`;
    return `${year}${month}${day}-${hours}${minutes}`;
}

export function delay(ms: number) {
    return new Promise( resolve => setTimeout(resolve, ms) );
}
