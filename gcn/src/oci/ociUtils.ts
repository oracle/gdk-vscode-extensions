/*
 * Copyright (c) 2022, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as common from 'oci-common';
import * as identity from 'oci-identity';
import * as devops from 'oci-devops';
import * as artifacts from 'oci-artifacts';
import * as adm from 'oci-adm';
import * as ons from 'oci-ons';
import * as logging from 'oci-logging';
import * as loggingsearch  from 'oci-loggingsearch';
import * as genericartifactscontent from 'oci-genericartifactscontent';
import { containerengine } from 'oci-sdk';


const DEFAULT_NOTIFICATION_TOPIC = 'NotificationTopic';
const DEFAULT_LOG_GROUP = 'Default_Group';
const DEFAULT_BUILD_PIPELINES_GROUP = 'GCN-BuildPipelinesGroup';
const DEFAULT_DEPLOY_PIPELINES_GROUP = 'GCN-DeployPipelinesGroup';
const DEFAULT_CODE_REPOSITORIES_GROUP = 'GCN-CodeRepositoriesGroup';
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
        throw `Timeout while creating ${resourceDescription}`;
    }
    if (requestState.status !== logging.models.OperationStatus.Succeeded) {
        // PENDING: make some abortion exception that can carry WorkRequest errors, should be caught top-level & reported to the user instead of plain message.
        let msg : string = `Creation of ${resourceDescription} failed`;
        throw msg;
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
        throw `Timeout while creating ${resourceDescription}`;
    }
    if (requestState.status !== adm.models.OperationStatus.Succeeded) {
        // PENDING: make some abortion exception that can carry WorkRequest errors, should be caught top-level & reported to the user instead of plain message.
        let msg : string = `Creation of ${resourceDescription} failed`;
        throw msg;
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
        throw `Timeout while creating ${resourceDescription}`;
    }
    if (requestState.status !== devops.models.OperationStatus.Succeeded) {
        // PENDING: make some abortion exception that can carry WorkRequest errors, should be caught top-level & reported to the user instead of plain message.
        let msg : string = `Creation of ${resourceDescription} failed`;
        throw msg;
    }
    // PENDING: what exactly do the 'affected resources' mean ???
    return requestState.resources[0].identifier;
}

export async function getUser(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider): Promise<identity.responses.GetUserResponse> {
    const client = new identity.IdentityClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const getUserRequest: identity.requests.GetUserRequest = {
        userId: authenticationDetailsProvider.getUser()
    };
    return client.getUser(getUserRequest);
}

export async function getTenancy(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider): Promise<identity.responses.GetTenancyResponse> {
    const client = new identity.IdentityClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const getTenancyRequest: identity.requests.GetTenancyRequest = {
        tenancyId: authenticationDetailsProvider.getTenantId()
    };
    return client.getTenancy(getTenancyRequest);
}

export async function listCompartments(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider): Promise<identity.responses.ListCompartmentsResponse | undefined> {
    try {
        const client = new identity.IdentityClient({ authenticationDetailsProvider: authenticationDetailsProvider });
        const listCompartmentsRequest: identity.requests.ListCompartmentsRequest = {
            compartmentId: authenticationDetailsProvider.getTenantId(),
            compartmentIdInSubtree: true,
            lifecycleState: identity.models.Compartment.LifecycleState.Active,
            accessLevel: identity.requests.ListCompartmentsRequest.AccessLevel.Accessible
        };
        return client.listCompartments(listCompartmentsRequest);
    } catch (error) {
        console.log('>>> listCompartments ' + error);
        return undefined;
    }
}

export async function getCompartment(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string): Promise<identity.responses.GetCompartmentResponse> {
    const client = new identity.IdentityClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const getCompartmentRequest: identity.requests.GetCompartmentRequest = {
        compartmentId: compartmentID
    };
    return client.getCompartment(getCompartmentRequest);
}

export async function listDevOpsProjects(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string): Promise<devops.responses.ListProjectsResponse | undefined> {
    try {
        const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
        const listProjectsRequest: devops.requests.ListProjectsRequest = {
            compartmentId: compartmentID,
            lifecycleState: devops.models.Project.LifecycleState.Active
        };
        return client.listProjects(listProjectsRequest);
    } catch (error) {
        console.log('>>> listDevopsProjects ' + error);
        return undefined;
    }
}

export async function getDevopsProject(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, projectId : string): Promise<devops.models.Project> {
    try {
        const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
        const getProjectsRequest: devops.requests.GetProjectRequest = {
            projectId : projectId
        };
        return client.getProject(getProjectsRequest).then(r => r.project);
    } catch (error) {
        console.log('>>> getDevopsProjects ' + error);
        throw error;
    }
}

export async function deleteDevOpsProject(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, projectId : string) {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    return client.deleteProject({ projectId : projectId});
}

export async function listCodeRepositories(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, projectID: string): Promise<devops.responses.ListRepositoriesResponse | undefined> {
    try {
        const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
        const listRepositoriesRequest: devops.requests.ListRepositoriesRequest = {
            projectId: projectID,
            lifecycleState: devops.models.Repository.LifecycleState.Active
        };
        return client.listRepositories(listRepositoriesRequest);
    } catch (error) {
        console.log('>>> listRepositories ' + error);
        return undefined;
    }
}

export async function getDeployEnvironment(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, envID: string): Promise<devops.responses.GetDeployEnvironmentResponse | undefined> {
    try {
        const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
        const createDeployEnvironmentRequest: devops.requests.GetDeployEnvironmentRequest = {
            deployEnvironmentId: envID
        };
        return await client.getDeployEnvironment(createDeployEnvironmentRequest);
    } catch (error) {
        console.log('>>> getDeployEnvironment ' + error);
        return undefined;
    }
}

export function asOkeDeployEnvironemnt(env?: devops.models.DeployEnvironment): devops.models.OkeClusterDeployEnvironment | undefined {
    if (env?.deployEnvironmentType === devops.models.OkeClusterDeployEnvironment.deployEnvironmentType) {
        return env as devops.models.OkeClusterDeployEnvironment;
    }
    return undefined;
}

export async function getCodeRepository(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, repositoryID: string): Promise<devops.responses.GetRepositoryResponse | undefined> {
    try {
        const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
        const getRepositoryRequest: devops.requests.GetRepositoryRequest = {
            repositoryId: repositoryID
        };
        return client.getRepository(getRepositoryRequest);
    } catch (error) {
        console.log('>>> getRepository ' + error);
        return undefined;
    }
}

export async function deleteCodeRepository(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, repo : string) : Promise<devops.responses.DeleteRepositoryResponse> {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    return client.deleteRepository({ repositoryId: repo });
}

export async function getBuildPipeline(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, pipelineID: string): Promise<devops.responses.GetBuildPipelineResponse> {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const getBuildPipelineRequest: devops.requests.GetBuildPipelineRequest = {
        buildPipelineId: pipelineID
    };
    return client.getBuildPipeline(getBuildPipelineRequest);
}

export async function listBuildPipelines(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, projectID: string): Promise<devops.responses.ListBuildPipelinesResponse | undefined> {
    try {
        const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
        const listBuildPipelinesRequest: devops.requests.ListBuildPipelinesRequest = {
            projectId: projectID,
            lifecycleState: devops.models.BuildPipeline.LifecycleState.Active
        };
        return client.listBuildPipelines(listBuildPipelinesRequest);
    } catch (error) {
        console.log('>>> listBuildPipelines ' + error);
        return undefined;
    }
}

export async function deleteBuildPipeline(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, pipeId: string, wait : boolean = false) : Promise<devops.responses.DeleteBuildPipelineResponse>{
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    if (!wait) {
        return client.deleteBuildPipeline({ buildPipelineId : pipeId });
    } else {
        // console.log(`> deletePipeline ${pipeId}`);
        const resp = await client.deleteBuildPipeline({ buildPipelineId : pipeId });
        // console.log(`> deletePipeline ${pipeId}will wait for ${resp.opcWorkRequestId}`);
        await devopsWaitForResourceCompletionStatus(authenticationDetailsProvider, "Deleting build pipeline", resp.opcWorkRequestId);
        return resp;
    }
}

export async function listBuildPipelineStages(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, pipelineID: string): Promise<devops.responses.ListBuildPipelineStagesResponse | undefined> {
    try {
        const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
        const listBuildPipelineStagesRequest: devops.requests.ListBuildPipelineStagesRequest = {
            buildPipelineId: pipelineID,
            lifecycleState: devops.models.BuildPipelineStage.LifecycleState.Active
        };
        return await client.listBuildPipelineStages(listBuildPipelineStagesRequest);
    } catch (error) {
        console.log('>>> listBuildPipelineStages ' + error);
        return undefined;
    }
}

export async function deleteBuildPipelineStage(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, stage : string, wait: boolean = false) : Promise<devops.responses.DeleteBuildPipelineStageResponse>{
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    if (!wait) {
        return client.deleteBuildPipelineStage({ buildPipelineStageId : stage });
    } else {
        // console.log(`> deleteBuildPipelineStage${stage}`);
        const resp = await client.deleteBuildPipelineStage({ buildPipelineStageId : stage });
        // console.log(`> deleteBuildPipelineStage${stage} will wait for ${resp.opcWorkRequestId}`);
        await devopsWaitForResourceCompletionStatus(authenticationDetailsProvider, "Deleting build pipeline stage", resp.opcWorkRequestId);
        return resp;
    }
}

export async function listBuildPipelinesByCodeRepository(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, projectID: string, repositoryID: string): Promise<devops.models.BuildPipelineSummary[]> {
    const buildPipelines = await listBuildPipelines(authenticationDetailsProvider, projectID);
    const buildPipelineSummaries: devops.models.BuildPipelineSummary[] = [];
    if (buildPipelines) {
        for (const buildPipeline of buildPipelines.buildPipelineCollection.items) {
            const stages = await listBuildPipelineStages(authenticationDetailsProvider, buildPipeline.id);
            if (stages) {
                let buildPipelineSummary: devops.models.BuildPipelineSummary | undefined = undefined;
                for (const stage of stages.buildPipelineStageCollection.items) {
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
    return buildPipelineSummaries;
}

export async function listDeployPipelines(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, projectID: string): Promise<devops.responses.ListDeployPipelinesResponse | undefined> {
    try {
        const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
        const listDeployPipelinesRequest: devops.requests.ListDeployPipelinesRequest = {
            projectId: projectID,
            lifecycleState: devops.models.DeployPipeline.LifecycleState.Active
        };
        return client.listDeployPipelines(listDeployPipelinesRequest);
    } catch (error) {
        console.log('>>> listDeploymentPipelines ' + error);
        return undefined;
    }
}

export async function getDeployPipeline(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, pipelineID: string): Promise<devops.responses.GetDeployPipelineResponse> {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const getDeploymentPipelineRequest: devops.requests.GetDeployPipelineRequest = {
        deployPipelineId: pipelineID
    };
    return client.getDeployPipeline(getDeploymentPipelineRequest);
}

export async function deleteDeployPipeline(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, pipeId: string, wait: boolean = false) : Promise<devops.responses.DeleteDeployPipelineResponse>{
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    if (!wait) {
        return client.deleteDeployPipeline({ deployPipelineId : pipeId });
    } else {
        // console.log(`> deletePipeline ${pipeId}`);
        const resp = await client.deleteDeployPipeline({ deployPipelineId : pipeId });
        // console.log(`> deletePipeline ${pipeId}will wait for ${resp.opcWorkRequestId}`);
        await devopsWaitForResourceCompletionStatus(authenticationDetailsProvider, "Deleting deploy pipeline", resp.opcWorkRequestId);
        return resp;
    }
}

export async function listDeployStages(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, pipelineID: string): Promise<devops.responses.ListDeployStagesResponse | undefined> {
    try {
        const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
        const listDeployStagesRequest: devops.requests.ListDeployStagesRequest = {
            deployPipelineId: pipelineID,
            lifecycleState: devops.models.DeployStage.LifecycleState.Active
        };
        return await client.listDeployStages(listDeployStagesRequest);
    } catch (error) {
        console.log('>>> listDeployStages ' + error);
        return undefined;
    }
}

export async function deleteDeployStage(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, stage: string, wait: boolean = false) : Promise<devops.responses.DeleteDeployStageResponse>{
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    if (!wait) {
        return client.deleteDeployStage({ deployStageId: stage });
    } else {
        // console.log(`> deleteBuildPipelineStage${stage}`);
        const resp = await client.deleteDeployStage({ deployStageId: stage });
        // console.log(`> deleteBuildPipelineStage${stage} will wait for ${resp.opcWorkRequestId}`);
        await devopsWaitForResourceCompletionStatus(authenticationDetailsProvider, "Deleting deploy stage", resp.opcWorkRequestId);
        return resp;
    }
}

export async function listArtifactRepositories(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string): Promise<artifacts.responses.ListRepositoriesResponse | undefined> {
    try {
        const client = new artifacts.ArtifactsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
        const listRepositoriesRequest: artifacts.requests.ListRepositoriesRequest = {
            compartmentId: compartmentID,
            lifecycleState: artifacts.models.Repository.LifecycleState.Available
        };
        return client.listRepositories(listRepositoriesRequest);
    } catch (error) {
        console.log('>>> listArtifactRepositories ' + error);
        return undefined;
    }
}

export async function getArtifactRepository(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, repositoryID: string): Promise<artifacts.responses.GetRepositoryResponse> {
    const client = new artifacts.ArtifactsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
        const getRepositoryRequest: artifacts.requests.GetRepositoryRequest = {
            repositoryId: repositoryID
        };
        return client.getRepository(getRepositoryRequest);
}

export async function deleteArtifactsRepository(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string, repositoryID: string): Promise<artifacts.responses.DeleteRepositoryResponse> {
    const items = (await listGenericArtifacts(authenticationDetailsProvider, compartmentID, repositoryID))?.genericArtifactCollection.items;
    const client = new artifacts.ArtifactsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    if (items) {
        for (const item of items) {
            const deleteGenericArtifactRequest: artifacts.requests.DeleteGenericArtifactRequest = {
                artifactId: item.id
            };
            await client.deleteGenericArtifact(deleteGenericArtifactRequest);
        }
    }
    let resp = client.deleteRepository({ repositoryId : repositoryID});
    return resp;
}

export async function listGenericArtifacts(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string, repositoryID: string, artifactPath?: string): Promise<artifacts.responses.ListGenericArtifactsResponse> {
    const client = new artifacts.ArtifactsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const listGenericArtifactsRequest: artifacts.requests.ListGenericArtifactsRequest = {
        compartmentId: compartmentID,
        repositoryId: repositoryID,
        artifactPath: artifactPath, // NOTE: artifactPath filtering uses startsWith, not exact match!
        lifecycleState: artifactPath ? undefined : artifacts.models.GenericArtifact.LifecycleState.Available,
        sortBy: artifactPath ? artifacts.requests.ListGenericArtifactsRequest.SortBy.Timecreated : artifacts.requests.ListGenericArtifactsRequest.SortBy.Displayname,
    };
    return client.listGenericArtifacts(listGenericArtifactsRequest);
}

export async function getGenericArtifact(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, artifactID: string): Promise<artifacts.responses.GetGenericArtifactResponse> {
    const client = new artifacts.ArtifactsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const getGenericArtifactRequest: artifacts.requests.GetGenericArtifactRequest = {
        artifactId: artifactID
    };
    return client.getGenericArtifact(getGenericArtifactRequest);
}

export async function getGenericArtifactContent(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, artifactID: string): Promise<genericartifactscontent.responses.GetGenericArtifactContentByPathResponse> {
    const client = new genericartifactscontent.GenericArtifactsContentClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const getGenericArtifactContentRequest: genericartifactscontent.requests.GetGenericArtifactContentRequest = {
        artifactId: artifactID
    };
    return client.getGenericArtifactContent(getGenericArtifactContentRequest);
}

export async function deleteProjectDeployArtifact(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, artifactId : string, wait : boolean = false) {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    // console.log(`> deleteDeployArtifact ${artifactId}`);
    const resp = client.deleteDeployArtifact({ deployArtifactId : artifactId });
    if (wait) {
        const requestId = (await resp).opcWorkRequestId;
        // console.log(`> deleteDeployArtifact ${artifactId} will wait for ${requestId}`);
        await devopsWaitForResourceCompletionStatus(authenticationDetailsProvider, "Deleting deploy artifact", requestId);
    }
    return resp;
}

export async function listProjectDeployArtifacts(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, projectID: string): Promise<devops.responses.ListDeployArtifactsResponse | undefined> {
    try {
        const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
        const listDeployArtifactsRequest: devops.requests.ListDeployArtifactsRequest = {
            projectId: projectID,
            lifecycleState: devops.models.DeployArtifact.LifecycleState.Active
        };
        return await client.listDeployArtifacts(listDeployArtifactsRequest);
    } catch (error) {
        console.log('>>> listProjectDeployArtifacts ' + error);
        return undefined;
    }
}

export async function listDeployArtifacts(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, projectID: string): Promise<devops.responses.ListDeployArtifactsResponse> {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const listDeployArtifactsRequest: devops.requests.ListDeployArtifactsRequest = {
        projectId: projectID,
        lifecycleState: devops.models.DeployArtifact.LifecycleState.Active
    };
    return await client.listDeployArtifacts(listDeployArtifactsRequest);
}

export async function getDeployArtifact(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, artifactID: string): Promise<devops.responses.GetDeployArtifactResponse> {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const getDeployArtifactRequest: devops.requests.GetDeployArtifactRequest = {
        deployArtifactId: artifactID
    };
    return await client.getDeployArtifact(getDeployArtifactRequest);
}

export async function listContainerRepositories(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string): Promise<artifacts.responses.ListContainerRepositoriesResponse | undefined> {
    try {
        const client = new artifacts.ArtifactsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
        const listContainerRepositoriesRequest: artifacts.requests.ListContainerRepositoriesRequest = {
            compartmentId: compartmentID,
            lifecycleState: artifacts.models.ContainerRepository.LifecycleState.Available
        };
        return client.listContainerRepositories(listContainerRepositoriesRequest);
    } catch (error) {
        console.log('>>> listContainerRepositories ' + error);
        return undefined;
    }
}

export async function getContainerRepository(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, repositoryID: string): Promise<artifacts.responses.GetContainerRepositoryResponse> {
    const client = new artifacts.ArtifactsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const getContainerRepositoryRequest: artifacts.requests.GetContainerRepositoryRequest = {
        repositoryId: repositoryID
    };
    return client.getContainerRepository(getContainerRepositoryRequest);
}

export async function deleteContainerRepository(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, repositoryID: string): Promise<artifacts.responses.DeleteContainerRepositoryResponse> {
    const client = new artifacts.ArtifactsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    return client.deleteContainerRepository({ repositoryId : repositoryID});
}


export async function listContainerImages(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string, repositoryID: string): Promise<artifacts.responses.ListContainerImagesResponse | undefined> {
    try {
        const client = new artifacts.ArtifactsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
        const listContainerImagesRequest: artifacts.requests.ListContainerImagesRequest = {
            compartmentId: compartmentID,
            repositoryId: repositoryID,
            lifecycleState: artifacts.models.ContainerImage.LifecycleState.Available
        };
        return client.listContainerImages(listContainerImagesRequest);
    } catch (error) {
        console.log('>>> listContainerImages ' + error);
        return undefined;
    }
}

export async function getContainerImage(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, imageID: string): Promise<artifacts.responses.GetContainerImageResponse> {
    const client = new artifacts.ArtifactsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const getContainerImageRequest: artifacts.requests.GetContainerImageRequest = {
        imageId: imageID
    };
    return client.getContainerImage(getContainerImageRequest);
}

export async function listDeployEnvironments(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, projectID: string): Promise<devops.responses.ListDeployEnvironmentsResponse | undefined> {
    try {
        const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
        const listDeployEnvironmentsRequest: devops.requests.ListDeployEnvironmentsRequest = {
            projectId: projectID,
            lifecycleState: devops.models.DeployEnvironment.LifecycleState.Active
        };
        return client.listDeployEnvironments(listDeployEnvironmentsRequest);
    } catch (error) {
        console.log('>>> listDeployEnvironments ' + error);
        return undefined;
    }
}

export async function deleteDeployEnvironment(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, envID: string): Promise<devops.responses.DeleteDeployEnvironmentResponse | undefined> {
    try {
        const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
        const deleteDeployEnvironmentRequest: devops.requests.DeleteDeployEnvironmentRequest = {
            deployEnvironmentId: envID
        };
        return client.deleteDeployEnvironment(deleteDeployEnvironmentRequest);
    } catch (error) {
        console.log('>>> deleteDeployEnvironment ' + error);
        return undefined;
    }
}

export async function listKnowledgeBases(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string): Promise<adm.responses.ListKnowledgeBasesResponse | undefined> {
    try {
        const client = new adm.ApplicationDependencyManagementClient({ authenticationDetailsProvider: authenticationDetailsProvider });
        const listKnowledgeBasesRequest: adm.requests.ListKnowledgeBasesRequest = {
            compartmentId: compartmentID,
            lifecycleState: adm.models.KnowledgeBase.LifecycleState.Active
        };
        return client.listKnowledgeBases(listKnowledgeBasesRequest);
    } catch (error) {
        console.log('>>> listKnowledgeBases ' + error);
        return undefined;
    }
}

export async function getKnowledgeBase(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, knowledgeBaseID: string): Promise<adm.responses.GetKnowledgeBaseResponse> {
    const client = new adm.ApplicationDependencyManagementClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const getKnowledgeBaseRequest: adm.requests.GetKnowledgeBaseRequest = {
        knowledgeBaseId: knowledgeBaseID
    };
    return client.getKnowledgeBase(getKnowledgeBaseRequest);
}

export async function deleteKnowledgeBase(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, knowledgeId : string, wait : boolean = false): Promise<adm.responses.DeleteKnowledgeBaseResponse> {
    const client = new adm.ApplicationDependencyManagementClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    let resp = client.deleteKnowledgeBase({ knowledgeBaseId : knowledgeId});
    if (wait) {
        admWaitForResourceCompletionStatus(authenticationDetailsProvider, "Deleting knowledge base", (await resp).opcWorkRequestId);
    }
    return resp;
}    

export async function listVulnerabilityAudits(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string, knowledgeBaseID: string): Promise<adm.responses.ListVulnerabilityAuditsResponse | undefined> {
    try {
        const client = new adm.ApplicationDependencyManagementClient({ authenticationDetailsProvider: authenticationDetailsProvider });
        const listVulnerabilityAuditsRequest: adm.requests.ListVulnerabilityAuditsRequest = {
            compartmentId: compartmentID,
            knowledgeBaseId: knowledgeBaseID,
            lifecycleState: adm.models.VulnerabilityAudit.LifecycleState.Active,
            limit: 10
        };
        return client.listVulnerabilityAudits(listVulnerabilityAuditsRequest);
    } catch (error) {
        console.log('>>> listVulnerabilityAudits ' + error);
        return undefined;
    }
}

export async function getVulnerabilityAudit(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, vulnerabilityAuditID: string): Promise<adm.responses.GetVulnerabilityAuditResponse> {
    const client = new adm.ApplicationDependencyManagementClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const getVulnerabilityAuditRequest: adm.requests.GetVulnerabilityAuditRequest = {
        vulnerabilityAuditId: vulnerabilityAuditID
    };
    return client.getVulnerabilityAudit(getVulnerabilityAuditRequest);
}

export async function listNotificationTopics(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string): Promise<ons.responses.ListTopicsResponse | undefined> {
    try {
        const client = new ons.NotificationControlPlaneClient({ authenticationDetailsProvider: authenticationDetailsProvider });
        const listTopicsRequest: ons.requests.ListTopicsRequest = {
            compartmentId:compartmentID,
            lifecycleState : ons.models.NotificationTopic.LifecycleState.Active
        };
        return client.listTopics(listTopicsRequest);
    } catch (error) {
        console.log('>>> listNotificationTopics ' + error);
        return undefined;
    }
}

export async function createKnowledgeBase(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, 
    compartmentID: string, displayName : string, flags? : { [key:string] : string } | undefined) :Promise<string | undefined> {
    const client = new adm.ApplicationDependencyManagementClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    
    // PENDING: displayName must match ".*(?:^[a-zA-Z_](-?[a-zA-Z_0-9])*$).*" -- transliterate invalid characters in name
    const request : adm.requests.CreateKnowledgeBaseRequest = {
        createKnowledgeBaseDetails : {
            "compartmentId" : compartmentID,
            "displayName": displayName
        }
    }

    // Because I can't query GetWorkRequest despite ID is available, I'll mark the Knowledgebase with some UUID, then
    // search for such created knowledgebase
    if (flags) {
        request.createKnowledgeBaseDetails.freeformTags = flags;
    }

    let resp = await client.createKnowledgeBase(request);
    return admWaitForResourceCompletionStatus(authenticationDetailsProvider, `Create knowledge base ${displayName}`, resp.opcWorkRequestId);
}

export async function createDefaultNotificationTopic(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string): Promise<ons.responses.CreateTopicResponse | undefined> {
    try {
        const idClient = new identity.IdentityClient({ authenticationDetailsProvider: authenticationDetailsProvider });
        const getCompartmentsRequest: identity.requests.GetCompartmentRequest = {
            compartmentId: compartmentID,
        };

        // PENDING: Creating a notification with a name already used within the tenancy (although in a different compartment) fails - whether it is a feature or a bug is not known.
        // Let's default the name to <Compartment-Name>+constant -- althoug even compartment name may not be unique (same name in 2 different parents). Should be the OCID there :) ?
        const resp = await idClient.getCompartment(getCompartmentsRequest);

        const client = new ons.NotificationControlPlaneClient({ authenticationDetailsProvider: authenticationDetailsProvider });
        const createTopicDetails = {
            name: resp.compartment.name.replace(/\W+/g,'') + DEFAULT_NOTIFICATION_TOPIC,
            compartmentId: compartmentID,
            description: "Default notification topic created from VS Code"
        };
        const createTopicRequest: ons.requests.CreateTopicRequest = {
            createTopicDetails: createTopicDetails
        };
        return client.createTopic(createTopicRequest);
    } catch (error) {
        console.log('>>> createDefaultNotificationTopic ' + error);
        return undefined;
    }
}

export async function getNotificationTopic(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string, create?: boolean): Promise<string | undefined> {
    try {
        const notificationTopics = await listNotificationTopics(authenticationDetailsProvider, compartmentID);
        if (notificationTopics) {
            if (notificationTopics.items.length > 0) {
                return notificationTopics.items[0].topicId;
            }
        }
        if (create) {
            const created = await createDefaultNotificationTopic(authenticationDetailsProvider, compartmentID);
            if (created) {
                return created.notificationTopic.topicId;
            }
        }
        return undefined;
    } catch (error) {
        console.log('>>> getNotificationTopic ' + error);
        return undefined;
    }
}

export async function listClusters(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string): Promise<containerengine.responses.ListClustersResponse | undefined> {
    try {
        const client = new containerengine.ContainerEngineClient({
            authenticationDetailsProvider: authenticationDetailsProvider
        });
        const listClustersRequest: containerengine.requests.ListClustersRequest = {
            compartmentId: compartmentID
        };
        return client.listClusters(listClustersRequest);
    } catch (error) {
        console.log('>>> listClusters ' + error);
        return undefined;
    }
}

export async function createDevOpsProject(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, projectName: string, compartmentID: string, notificationTopicID: string): Promise<devops.responses.CreateProjectResponse> {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const createProjectDetails = {
        name: projectName,
        description: "Imported from local VS Code workspace",
        notificationConfig: {
            topicId: notificationTopicID
        },
        compartmentId: compartmentID
    };
    const createProjectRequest: devops.requests.CreateProjectRequest = {
        createProjectDetails: createProjectDetails
    };
    return client.createProject(createProjectRequest);
}

export async function listLogGroups(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string, name?: string): Promise<logging.responses.ListLogGroupsResponse | undefined> {
    try {
        const client = new logging.LoggingManagementClient({ authenticationDetailsProvider: authenticationDetailsProvider });
        const listLogGroupsRequest: logging.requests.ListLogGroupsRequest = {
            compartmentId: compartmentID,
            displayName: name
        };
        return client.listLogGroups(listLogGroupsRequest);
    } catch (error) {
        console.log('>>> listLogGroups ' + error);
        return undefined;
    }
}

export async function listLogs(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, logGroupID: string): Promise<logging.responses.ListLogsResponse | undefined> {
    try {
        const client = new logging.LoggingManagementClient({ authenticationDetailsProvider: authenticationDetailsProvider });

        const listLogsRequest: logging.requests.ListLogsRequest = {
            logGroupId: logGroupID
        };

        return client.listLogs(listLogsRequest);
    } catch (error) {
        console.log('>>> listLogs ' + error);
        return undefined;
    }
}

export async function searchLogs(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string, logGroupID: string, logID: string, operation: 'buildRun' | 'deployment', operationID: string, timeStart: Date, timeEnd: Date): Promise<loggingsearch.models.SearchResult[] | undefined> {
    try {
        const client = new loggingsearch.LogSearchClient({ authenticationDetailsProvider: authenticationDetailsProvider });

        const searchLogsDetails = {
            timeStart: timeStart,
            timeEnd: timeEnd,
            searchQuery: `search "${compartmentID}/${logGroupID}/${logID}" | where data.${operation}Id = '${operationID}'`,
            isReturnFieldInfo: false
        };

        const result: loggingsearch.models.SearchResult[] = [];
        let nextPage;
        do {
            const searchLogsRequest: loggingsearch.requests.SearchLogsRequest = {
                searchLogsDetails: searchLogsDetails,
                limit: 1000,
                page: nextPage
            };
            const searchLogsResponse = await client.searchLogs(searchLogsRequest);
            if (searchLogsResponse.searchResponse.results?.length) {
                if (!result.length && !searchLogsResponse.opcNextPage) {
                    return searchLogsResponse.searchResponse.results;
                }
                result.push(...searchLogsResponse.searchResponse.results);
            }
            nextPage = searchLogsResponse.opcNextPage;
        } while (nextPage);

        return result;
    } catch (error) {
        console.log('>>> searchLogs ' + error);
        return undefined;
    }
}

export async function createDefaultLogGroup(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string): Promise<logging.responses.CreateLogGroupResponse | undefined> {
    try {
        const client = new logging.LoggingManagementClient({ authenticationDetailsProvider: authenticationDetailsProvider });
        const createLogGroupDetails = {
            compartmentId: compartmentID,
            displayName: DEFAULT_LOG_GROUP,
            description: 'Default log group created by VS Code'
        };
        const createLogGroupRequest: logging.requests.CreateLogGroupRequest = {
            createLogGroupDetails: createLogGroupDetails
        };
        const createLogGroupResponse = await client.createLogGroup(createLogGroupRequest);
        if (createLogGroupResponse.opcWorkRequestId) {
            const getWorkRequestRequest: logging.requests.GetWorkRequestRequest = {
                workRequestId: createLogGroupResponse.opcWorkRequestId
            };
            await completion(2000, async () => (await client.getWorkRequest(getWorkRequestRequest)).workRequest.status);
        }
        return createLogGroupResponse;
    } catch (error) {
        console.log('>>> createLogGroup ' + error);
        return undefined;
    }
}

export async function getDefaultLogGroup(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string, create?: boolean): Promise<string | undefined> {
    const logGroup = await listLogGroups(authenticationDetailsProvider, compartmentID, DEFAULT_LOG_GROUP);
    if (logGroup) {
        if (logGroup.items.length > 0) {
            return logGroup.items[0].id;
        }
    }
    if (create) {
        const created = await createDefaultLogGroup(authenticationDetailsProvider, compartmentID);
        if (created) {
            const logGroup = await listLogGroups(authenticationDetailsProvider, compartmentID, DEFAULT_LOG_GROUP);
            if (logGroup) {
                if (logGroup.items.length > 0) {
                    return logGroup.items[0].id;
                }
            }
        }
    }
    return undefined;
}

export async function listDynamicGroups(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string, name?: string): Promise<identity.responses.ListDynamicGroupsResponse | undefined> {
    try {
        const client = new identity.IdentityClient({ authenticationDetailsProvider: authenticationDetailsProvider });
        const listDynamicGroupsRequest: identity.requests.ListDynamicGroupsRequest = {
            compartmentId: compartmentID,
            name
        };
        return client.listDynamicGroups(listDynamicGroupsRequest);
    } catch (error) {
        console.log('>>> listDynamicGroups ' + error);
        return undefined;
    }
}

export async function createDynamicGroup(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string, name: string, description: string, matchingRule: string): Promise<identity.responses.CreateDynamicGroupResponse | undefined> {
    try {
        const client = new identity.IdentityClient({ authenticationDetailsProvider: authenticationDetailsProvider });
        const createDynamicGroupDetails = {
            compartmentId: compartmentID,
            name,
            description,
            matchingRule
        };
        const createTopicRequest: identity.requests.CreateDynamicGroupRequest = {
            createDynamicGroupDetails: createDynamicGroupDetails
        };
        return client.createDynamicGroup(createTopicRequest);
    } catch (error) {
        console.log('>>> createDynamicGroup ' + error);
        return undefined;
    }
}

export async function updateDynamicGroup(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, groupID: string, details: identity.models.UpdateDynamicGroupDetails): Promise<identity.responses.UpdateDynamicGroupResponse | undefined> {
    try {
        const client = new identity.IdentityClient({ authenticationDetailsProvider: authenticationDetailsProvider });
        const updateDynamicGroupRequest: identity.requests.UpdateDynamicGroupRequest = {
            dynamicGroupId: groupID,
            updateDynamicGroupDetails: details
        };
        return client.updateDynamicGroup(updateDynamicGroupRequest);
    } catch (error) {
        console.log('>>> updateDynamicGroup ' + error);
        return undefined;
    }
}

export async function getDefaultBuildPipelinesGroup(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string, create?: boolean): Promise<identity.models.DynamicGroup | undefined> {
    const tenancy = authenticationDetailsProvider.getTenantId();
    const rule = `ALL {resource.type = 'devopsbuildpipeline', resource.compartment.id = '${compartmentID}'}`;
    const group = (await listDynamicGroups(authenticationDetailsProvider, tenancy, DEFAULT_BUILD_PIPELINES_GROUP))?.items.find(g => DEFAULT_BUILD_PIPELINES_GROUP === g.name);
    if (group) {
        if (group.matchingRule.indexOf(rule) < 0) {
            const len = group.matchingRule.length;
            await updateDynamicGroup(authenticationDetailsProvider, group.id, { matchingRule: `${group.matchingRule.slice(0, len - 1)}, ${rule}${group.matchingRule.slice(len - 1)}`});
        }
        return group;
    }
    if (create) {
        const created = await createDynamicGroup(authenticationDetailsProvider, tenancy, DEFAULT_BUILD_PIPELINES_GROUP, 'Default group for build pipelines created from VS Code', `Any {${rule}}`);
        if (created) {
            return (await listDynamicGroups(authenticationDetailsProvider, tenancy, DEFAULT_BUILD_PIPELINES_GROUP))?.items.find(g => DEFAULT_BUILD_PIPELINES_GROUP === g.name);
        }
    }
    return undefined;
}

export async function getDefaultDeployPipelinesGroup(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string, create?: boolean): Promise<identity.models.DynamicGroup | undefined> {
    const tenancy = authenticationDetailsProvider.getTenantId();
    const rule = `ALL {resource.type = 'devopsdeploypipeline', resource.compartment.id = '${compartmentID}'}`;
    const group = (await listDynamicGroups(authenticationDetailsProvider, tenancy, DEFAULT_DEPLOY_PIPELINES_GROUP))?.items.find(g => DEFAULT_DEPLOY_PIPELINES_GROUP === g.name);
    if (group) {
        if (group.matchingRule.indexOf(rule) < 0) {
            const len = group.matchingRule.length;
            await updateDynamicGroup(authenticationDetailsProvider, group.id, { matchingRule: `${group.matchingRule.slice(0, len - 1)}, ${rule}${group.matchingRule.slice(len - 1)}`});
        }
        return group;
    }
    if (create) {
        const created = await createDynamicGroup(authenticationDetailsProvider, tenancy, DEFAULT_DEPLOY_PIPELINES_GROUP, 'Default group for deployment pipelines created from VS Code', `Any {${rule}}`);
        if (created) {
            return (await listDynamicGroups(authenticationDetailsProvider, tenancy, DEFAULT_DEPLOY_PIPELINES_GROUP))?.items.find(g => DEFAULT_DEPLOY_PIPELINES_GROUP === g.name);
        }
    }
    return undefined;
}

export async function getDefaultCodeRepositoriesGroup(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string, create?: boolean): Promise<identity.models.DynamicGroup | undefined> {
    const tenancy = authenticationDetailsProvider.getTenantId();
    const rule = `ALL {resource.type = 'devopsrepository', resource.compartment.id = '${compartmentID}'}`;
    const group = (await listDynamicGroups(authenticationDetailsProvider, tenancy, DEFAULT_CODE_REPOSITORIES_GROUP))?.items.find(g => DEFAULT_CODE_REPOSITORIES_GROUP === g.name);
    if (group) {
        if (group.matchingRule.indexOf(rule) < 0) {
            const len = group.matchingRule.length;
            await updateDynamicGroup(authenticationDetailsProvider, group.id, { matchingRule: `${group.matchingRule.slice(0, len - 1)}, ${rule}${group.matchingRule.slice(len - 1)}`});
        }
        return group;
    }
    if (create) {
        const created = await createDynamicGroup(authenticationDetailsProvider, tenancy, DEFAULT_CODE_REPOSITORIES_GROUP, 'Default group for code repositories created from VS Code', `Any {${rule}}`);
        if (created) {
            return (await listDynamicGroups(authenticationDetailsProvider, tenancy, DEFAULT_CODE_REPOSITORIES_GROUP))?.items.find(g => DEFAULT_CODE_REPOSITORIES_GROUP === g.name);
        }
    }
    return undefined;
}

export async function listPolicies(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string, name?: string): Promise<identity.responses.ListPoliciesResponse | undefined> {
    try {
        const client = new identity.IdentityClient({ authenticationDetailsProvider: authenticationDetailsProvider });
        const listPoliciesRequest: identity.requests.ListPoliciesRequest = {
            compartmentId: compartmentID,
            name,
        };
        return client.listPolicies(listPoliciesRequest);
    } catch (error) {
        console.log('>>> listPolicies ' + error);
        return undefined;
    }
}

export async function createPolicy(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string, description: string, statements: string[]): Promise<identity.responses.CreatePolicyResponse | undefined> {
    try {
        const client = new identity.IdentityClient({ authenticationDetailsProvider: authenticationDetailsProvider });
        const createPolicyDetails = {
            compartmentId: compartmentID,
            name: DEFAULT_COMPARTMENT_ACCESS_POLICY,
            description,
            statements
        };
        const createPolicyRequest: identity.requests.CreatePolicyRequest = {
            createPolicyDetails: createPolicyDetails
        };
        return client.createPolicy(createPolicyRequest);
    } catch (error) {
        console.log('>>> createPolicy ' + error);
        return undefined;
    }
}

export async function updatePolicy(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, policyID: string, details: identity.models.UpdatePolicyDetails): Promise<identity.responses.UpdatePolicyResponse | undefined> {
    try {
        const client = new identity.IdentityClient({ authenticationDetailsProvider: authenticationDetailsProvider });
        const updatePolicyRequest: identity.requests.UpdatePolicyRequest = {
            policyId: policyID,
            updatePolicyDetails: details
        };
        return client.updatePolicy(updatePolicyRequest);
    } catch (error) {
        console.log('>>> updatePolicy ' + error);
        return undefined;
    }
}

export async function getCompartmentAccessPolicy(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string, buildPipelinesGroupName: string, deployPipelinesGroupName: string, codeRepositoriesGroupName: string, create?: boolean): Promise<string | undefined> {
    const buildPipelinesGroupRule = `Allow dynamic-group ${buildPipelinesGroupName} to manage all-resources in compartment id ${compartmentID}`;
    const deployPipelinesGroupRule = `Allow dynamic-group ${deployPipelinesGroupName} to manage all-resources in compartment id ${compartmentID}`;
    const codeRepositoriesGroupRule = `Allow dynamic-group ${codeRepositoriesGroupName} to manage all-resources in compartment id ${compartmentID}`;
    const policy = (await listPolicies(authenticationDetailsProvider, compartmentID, DEFAULT_COMPARTMENT_ACCESS_POLICY))?.items.find(p => DEFAULT_COMPARTMENT_ACCESS_POLICY === p.name);
    if (policy) {
        let statements = [...policy.statements];
        if (!policy.statements.includes(buildPipelinesGroupRule)) {
            statements.push(buildPipelinesGroupRule);
        }
        if (!policy.statements.includes(deployPipelinesGroupRule)) {
            statements.push(deployPipelinesGroupRule);
        }
        if (!policy.statements.includes(codeRepositoriesGroupRule)) {
            statements.push(codeRepositoriesGroupRule);
        }
        if (statements.length != policy.statements.length) {
            await updatePolicy(authenticationDetailsProvider, policy.id, { statements });
        }
        return policy.id;
    }
    if (create) {
        const created = await createPolicy(authenticationDetailsProvider, compartmentID, 'Default policy for accessing compartment resources created from VS Code', [
            buildPipelinesGroupRule,
            deployPipelinesGroupRule,
            codeRepositoriesGroupRule
        ]);
        if (created) {
            return (await listPolicies(authenticationDetailsProvider, compartmentID, DEFAULT_COMPARTMENT_ACCESS_POLICY))?.items.find(g => DEFAULT_COMPARTMENT_ACCESS_POLICY == g.name)?.id;
        }
    }
    return undefined;
}

export async function listLogsByProject(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentId : string, projectId : string) : Promise<logging.models.LogSummary[]> {
    const client = new logging.LoggingManagementClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const value : logging.models.LogSummary[] = [];

    let groups = (await listLogGroups(authenticationDetailsProvider, compartmentId))?.items;

    if (!groups) {
        return value;
    }

    for (let lg of groups) {
        let logs = (await client.listLogs({ 
                logGroupId : lg.id, 
                sourceResource : projectId
            }))?.items;
        logs.forEach(l => {
            if (l.configuration?.source?.resource === projectId) {
                // for some reason, the filter for "sourceResource" in listLogs does not work.
                switch (l.lifecycleState) {
                    case logging.models.LogLifecycleState.Active:
                    case logging.models.LogLifecycleState.Creating:
                    case logging.models.LogLifecycleState.Updating:
                        value.push(l);
                        break;
                }
            }
        })
    }
    return value;
}

export async function deleteLog(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, logId : string, logGroupID: string, wait : boolean = false) {
    const client = new logging.LoggingManagementClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    // console.log(`> deleteLog ${logId}`);
    const delResp = client.deleteLog({ 
        logGroupId : logGroupID, 
        logId : logId
    });
    if (wait) {
        const requestId = (await delResp).opcWorkRequestId;
        // console.log(`> will wait for ${requestId}`);
        await loggingWaitForResourceCompletionStatus(authenticationDetailsProvider, "Deleting project log", requestId);
    }
    return delResp;
}

export async function createProjectLog(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string, logGroupID: string, projectID: string, projectName: string): Promise<logging.responses.CreateLogResponse | undefined> {
    try {
        const client = new logging.LoggingManagementClient({ authenticationDetailsProvider: authenticationDetailsProvider });
        const createLogDetails = {
            displayName: `${projectName}Log`,
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
            retentionDuration: 30
        };
        const createLogRequest: logging.requests.CreateLogRequest = {
            logGroupId: logGroupID,
            createLogDetails: createLogDetails
        };
        const createLogResponse = await client.createLog(createLogRequest);
        if (createLogResponse.opcWorkRequestId) {
            const getWorkRequestRequest: logging.requests.GetWorkRequestRequest = {
                workRequestId: createLogResponse.opcWorkRequestId
            };
            await completion(2000, async () => (await client.getWorkRequest(getWorkRequestRequest)).workRequest.status);
        }
        return createLogResponse;
    } catch (error) {
        console.log('>>> createProjectLog ' + error);
        return undefined;
    }
}

export async function createArtifactsRepository(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string, projectName: string, flags? : { [key:string] : string } | undefined): Promise<artifacts.responses.CreateRepositoryResponse | undefined> {
    try {
        const client = new artifacts.ArtifactsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
        const createRepositoryDetails = {
            repositoryType: artifacts.models.CreateGenericRepositoryDetails.repositoryType,
            displayName: `${projectName}ArtifactRepository`,
            compartmentId: compartmentID,
            description: `Mutable artifact repository for devops project ${projectName}`,
            isImmutable: false,
            freeformTags: flags
        };
        const createRepositoryRequest: artifacts.requests.CreateRepositoryRequest = {
            createRepositoryDetails: createRepositoryDetails
        };
        return await client.createRepository(createRepositoryRequest);
    } catch (error) {
        console.log('>>> createArtifactsRepository ' + error);
        return undefined;
    }
}

export async function createContainerRepository(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string, repositoryName: string): Promise<artifacts.responses.CreateContainerRepositoryResponse | undefined> {
    try {
        const client = new artifacts.ArtifactsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
        const createContainerRepositoryDetails = {
            compartmentId: compartmentID,
            displayName: repositoryName.toLowerCase(),
            description: `Mutable container repository for ${repositoryName}`,
            isImmutable: false,
            isPublic: true
        };
        const createContainerRepositoryRequest: artifacts.requests.CreateContainerRepositoryRequest = {
            createContainerRepositoryDetails: createContainerRepositoryDetails
        };
        return await client.createContainerRepository(createContainerRepositoryRequest);
    } catch (error) {
        console.log('>>> createContainerRepository ' + error);
        return undefined;
    }
}

export async function createOkeDeployEnvironment(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, projectID: string, projectName: string, clusterID: string): Promise<devops.responses.CreateDeployEnvironmentResponse | undefined> {
    try {
        const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
        const createDeployEnvironmentDetails = {
            deployEnvironmentType: devops.models.CreateOkeClusterDeployEnvironmentDetails.deployEnvironmentType,
            displayName: `${projectName.toLowerCase()}OkeDeployEnvironment`,
            description: `OKE cluster environment for devops project ${projectName}`,
            projectId: projectID,
            clusterId: clusterID
        };
        const createDeployEnvironmentRequest: devops.requests.CreateDeployEnvironmentRequest = {
            createDeployEnvironmentDetails: createDeployEnvironmentDetails
        };
        return await client.createDeployEnvironment(createDeployEnvironmentRequest);
    } catch (error) {
        console.log('>>> createOkeDeployEnvironment ' + error);
        return undefined;
    }
}

export async function createCodeRepository(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, projectID: string, repositoryName: string, defaultBranchName: string): Promise<devops.responses.CreateRepositoryResponse | undefined> {
    try {
        const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
        const createRepositoryDetails = {
            name: repositoryName,
            description: 'Created from local VS Code workspace',
            projectId: projectID,
            defaultBranch: defaultBranchName,
            repositoryType: devops.models.Repository.RepositoryType.Hosted
        };
        const createRepositoryRequest: devops.requests.CreateRepositoryRequest = {
            createRepositoryDetails: createRepositoryDetails
        };
        const createRepositoryResponse = await client.createRepository(createRepositoryRequest);
        if (createRepositoryResponse.opcWorkRequestId) {
            const getWorkRequestRequest: devops.requests.GetWorkRequestRequest = {
                workRequestId: createRepositoryResponse.opcWorkRequestId
            };
            await completion(2000, async () => (await client.getWorkRequest(getWorkRequestRequest)).workRequest.status);
        }
        return createRepositoryResponse;
    } catch (error) {
        console.log('>>> createCodeRepository ' + error);
        return undefined;
    }
}

export async function createBuildPipeline(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, projectID: string, name: string): Promise<devops.responses.CreateBuildPipelineResponse | undefined> {
    try {
        const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
        const createBuildPipelineDetails = {
            description: 'Created from local VS Code workspace',
            displayName: name,
            projectId: projectID
        };
        const createBuildPipelineRequest: devops.requests.CreateBuildPipelineRequest = {
            createBuildPipelineDetails: createBuildPipelineDetails
        };
        return client.createBuildPipeline(createBuildPipelineRequest);
    } catch (error) {
        console.log('>>> createBuildPipeline ' + error);
        return undefined;
    }
}

export async function createBuildPipelineBuildStage(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, pipelineID: string, repositoryID: string, repositoryName: string, repositoryUrl: string, buildSpecFile: string): Promise<devops.responses.CreateBuildPipelineStageResponse | undefined> {
    try {
        const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
        const createBuildPipelineStageDetails: devops.models.CreateBuildStageDetails = {
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
            buildPipelineStageType: devops.models.CreateBuildStageDetails.buildPipelineStageType
        };
        const createBuildPipelineStageRequest: devops.requests.CreateBuildPipelineStageRequest = {
            createBuildPipelineStageDetails: createBuildPipelineStageDetails
        };
        return await client.createBuildPipelineStage(createBuildPipelineStageRequest);
    } catch (error) {
        console.log('>>> createBuildPipelineBuildStage ' + error);
        return undefined;
    }
}

export async function createBuildPipelineArtifactsStage(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, pipelineID: string, buildStageID: string, artifactID: string, artifactName: string): Promise<devops.responses.CreateBuildPipelineStageResponse | undefined> {
    try {
        const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
        const createBuildPipelineStageDetails: devops.models.CreateDeliverArtifactStageDetails = {
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
            buildPipelineStageType: devops.models.CreateDeliverArtifactStageDetails.buildPipelineStageType
        };
        const createBuildPipelineStageRequest: devops.requests.CreateBuildPipelineStageRequest = {
            createBuildPipelineStageDetails: createBuildPipelineStageDetails
        };
        return await client.createBuildPipelineStage(createBuildPipelineStageRequest);
    } catch (error) {
        console.log('>>> createBuildPipelineArtifactsStage ' + error);
        return undefined;
    }
}

export async function createDeployPipeline(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, projectID: string, name: string, tags?: { [key:string]: string }): Promise<devops.responses.CreateDeployPipelineResponse | undefined> {
    try {
        const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
        const createDeployPipelineDetails: devops.models.CreateDeployPipelineDetails = {
            description: 'Created from local VS Code workspace',
            displayName: name,
            projectId: projectID
        };
        if (tags) {
            createDeployPipelineDetails.freeformTags = tags;
        }
        const createDeployPipelineRequest: devops.requests.CreateDeployPipelineRequest = {
            createDeployPipelineDetails: createDeployPipelineDetails
        };
        return client.createDeployPipeline(createDeployPipelineRequest);
    } catch (error) {
        console.log('>>> createDeployPipeline ' + error);
        return undefined;
    }
}

export async function createDeployToOkeStage(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, pipelineID: string, environmentID: string, deployArtifactID: string): Promise<devops.responses.CreateDeployStageResponse | undefined> {
    try {
        const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
        const createDeployStageDetails = {
            displayName: 'Deploy to OKE',
            description: 'Deployment stage generated by VS Code',
            deployPipelineId: pipelineID,
            deployStagePredecessorCollection: {
                items: [
                    { id: pipelineID }
                ]
            },
            kubernetesManifestDeployArtifactIds: [
                deployArtifactID
            ],
            okeClusterDeployEnvironmentId: environmentID,
            deployStageType: devops.models.CreateOkeDeployStageDetails.deployStageType
        };
        const createDeployStageRequest: devops.requests.CreateDeployStageRequest = {
            createDeployStageDetails: createDeployStageDetails
        };
        return await client.createDeployStage(createDeployStageRequest);
    } catch (error) {
        console.log('>>> createDeployToOkeStage ' + error);
        return undefined;
    }
}

export async function listBuildRuns(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, buildPipelineID: string): Promise<devops.responses.ListBuildRunsResponse | undefined> {
    try {
        const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
        const listBuildRunsRequest: devops.requests.ListBuildRunsRequest = {
            buildPipelineId: buildPipelineID,
            limit: 10
        };
        return client.listBuildRuns(listBuildRunsRequest);
    } catch (error) {
        console.log('>>> listBuildRuns ' + error);
        return undefined;
    }
}

export async function getBuildRun(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, buildRunID: string): Promise<devops.responses.GetBuildRunResponse> {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const getBuildRunRequest: devops.requests.GetBuildRunRequest = {
        buildRunId: buildRunID
    };
    return client.getBuildRun(getBuildRunRequest);
}

export async function createBuildRun(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, pipelineID: string, name: string, params: { name: string, value: string }[] = [], commitInfo?: devops.models.CommitInfo): Promise<devops.responses.CreateBuildRunResponse | undefined> {
    try {
        const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
        const createBuildRunDetails: devops.models.CreateBuildRunDetails = {
            displayName: name,
            buildPipelineId: pipelineID,
            buildRunArguments: {
                items: params
            },
            commitInfo
        };
        const createBuildRunRequest: devops.requests.CreateBuildRunRequest = {
            createBuildRunDetails: createBuildRunDetails
        };
        return client.createBuildRun(createBuildRunRequest);
    } catch (error) {
        console.log('>>> createBuildRun ' + error);
        return undefined;
    }
}

export async function listDeployments(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, pipelineID: string): Promise<devops.responses.ListDeploymentsResponse | undefined> {
    try {
        const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
        const listDeploymentsRequest: devops.requests.ListDeploymentsRequest = {
            deployPipelineId: pipelineID,
            limit: 10
        };
        return client.listDeployments(listDeploymentsRequest);
    } catch (error) {
        console.log('>>> listDeployments ' + error);
        return undefined;
    }
}

export async function getDeployment(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, deploymentID: string): Promise<devops.responses.GetDeploymentResponse> {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
        const getDeploymentRequest: devops.requests.GetDeploymentRequest = {
        deploymentId: deploymentID
    };
    return client.getDeployment(getDeploymentRequest);
}

export async function createDeployment(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, pipelineID: string, name: string, tags?: { [key:string]: string }): Promise<devops.responses.CreateDeploymentResponse | undefined> {
    try {
        const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
        const createDeploymentDetails: devops.models.CreateDeployPipelineDeploymentDetails = {
            displayName: name,
            deploymentType: devops.models.CreateDeployPipelineDeploymentDetails.deploymentType,
            deployPipelineId: pipelineID,
            freeformTags: tags
        };
        const createDeploymentRequest: devops.requests.CreateDeploymentRequest = {
            createDeploymentDetails: createDeploymentDetails
        };
        return client.createDeployment(createDeploymentRequest);
    } catch (error) {
        console.log('>>> createDeployment ' + error);
        return undefined;
    }
}

export async function createProjectDevArtifact(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, repositoryID: string, projectID: string, artifactPath: string, artifactName: string, artifactDescription: string): Promise<devops.responses.CreateDeployArtifactResponse | undefined> {
    return createDeployArtifact(authenticationDetailsProvider, projectID, artifactName, artifactDescription, devops.models.DeployArtifact.DeployArtifactType.GenericFile, {
        repositoryId: repositoryID,
        deployArtifactPath: artifactPath,
        deployArtifactVersion: 'dev',
        deployArtifactSourceType: devops.models.GenericDeployArtifactSource.deployArtifactSourceType
    });
}

export async function createProjectDockerArtifact(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, projectID: string, imageURI: string, artifactName: string, artifactDescription: string): Promise<devops.responses.CreateDeployArtifactResponse | undefined> {
    return createDeployArtifact(authenticationDetailsProvider, projectID, artifactName, artifactDescription, devops.models.DeployArtifact.DeployArtifactType.DockerImage, {
        imageUri: imageURI,
        deployArtifactSourceType: devops.models.OcirDeployArtifactSource.deployArtifactSourceType
    });
}

export async function createOkeDeployConfigurationArtifact(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, projectID: string, artifactInlineContent: string, artifactName: string, artifactDescription: string): Promise<devops.responses.CreateDeployArtifactResponse | undefined> {
    return createDeployArtifact(authenticationDetailsProvider, projectID, artifactName, artifactDescription, devops.models.DeployArtifact.DeployArtifactType.KubernetesManifest, {
        base64EncodedContent: Buffer.from(artifactInlineContent, 'binary').toString('base64'),
        deployArtifactSourceType: devops.models.InlineDeployArtifactSource.deployArtifactSourceType
    });
}

async function createDeployArtifact(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, projectID: string, displayName: string, description: string, deployArtifactType: string, deployArtifactSource: devops.models.GenericDeployArtifactSource | devops.models.OcirDeployArtifactSource | devops.models.InlineDeployArtifactSource): Promise<devops.responses.CreateDeployArtifactResponse | undefined> {    try {
        const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
        const createDeployArtifactDetails = {
            displayName,
            description,
            deployArtifactType,
            deployArtifactSource,
            argumentSubstitutionMode: devops.models.DeployArtifact.ArgumentSubstitutionMode.SubstitutePlaceholders,
            projectId: projectID
        };
        const createDeployArtifactRequest: devops.requests.CreateDeployArtifactRequest = {
            createDeployArtifactDetails: createDeployArtifactDetails
        };
        return await client.createDeployArtifact(createDeployArtifactRequest);
    } catch (error) {
        console.log('>>> createProjectDevArtifact ' + error);
        return undefined;
    }
}

export async function completion(initialPollTime: number, getState: () => Promise<string | undefined>): Promise<string | undefined> {
    try {
        // TODO: use increasing polling time
        const pollTime = initialPollTime;
        let state: string | undefined;
        do {
            await delay(pollTime);
            state = await getState();
        } while (isRunning(state));
        return state;
    } catch (error) {
        console.log('>>> completion ' + error);
        return undefined;
    }
}

export function isRunning(state?: string) {
    return state === 'ACCEPTED' || state === 'IN_PROGRESS' || state === 'CANCELING';
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
