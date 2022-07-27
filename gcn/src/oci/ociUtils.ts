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

const DEFAULT_NOTIFICATION_TOPIC = 'NotificationTopic';
const DEFAULT_LOG_GROUP = 'Default_Group';
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

export async function getCompartment(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string): Promise<identity.responses.GetCompartmentResponse | undefined> {
    try {
        const client = new identity.IdentityClient({ authenticationDetailsProvider: authenticationDetailsProvider });
        const getCompartmentRequest: identity.requests.GetCompartmentRequest = {
            compartmentId: compartmentID
        };
        return client.getCompartment(getCompartmentRequest);
    } catch (error) {
        console.log('>>> getCompartment ' + error);
        return undefined;
    }
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

export async function deleteCodeRepository(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, repo : string) : Promise<devops.responses.DeleteRepositoryResponse> {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    return client.deleteRepository({ repositoryId: repo });
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


export async function deleteBuildPipelineStage(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, stage : string, wait : boolean = false) : Promise<devops.responses.DeleteBuildPipelineStageResponse>{
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

export async function listBuildPipelineStagesByCodeRepository(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, projectID: string, repositoryID: string): Promise<devops.models.BuildPipelineSummary[]> {
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

export async function listGenericArtifacts(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string, repositoryID: string): Promise<artifacts.responses.ListGenericArtifactsResponse | undefined> {
    try {
        const client = new artifacts.ArtifactsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
        const listGenericArtifactsRequest: artifacts.requests.ListGenericArtifactsRequest = {
            compartmentId: compartmentID,
            repositoryId: repositoryID,
            lifecycleState: artifacts.models.GenericArtifact.LifecycleState.Available
        };
        return client.listGenericArtifacts(listGenericArtifactsRequest);
    } catch (error) {
        console.log('>>> listGenericArtifacts ' + error);
        return undefined;
    }
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

export async function createDevOpsProject(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, projectName: string, compartmentID: string, notificationTopicID: string): Promise<devops.responses.CreateProjectResponse | undefined> {
    try {
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
    } catch (error) {
        console.log('>>> createDevOpsProject ' + error);
        return undefined;
    }
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

export async function searchLogs(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string, logGroupID: string, logID: string, buildRunID: string, timeStart: Date, timeEnd: Date): Promise<loggingsearch.models.SearchResult[] | undefined> {
    try {
        const client = new loggingsearch.LogSearchClient({ authenticationDetailsProvider: authenticationDetailsProvider });

        const searchLogsDetails = {
            timeStart: timeStart,
            timeEnd: timeEnd,
            searchQuery: `search "${compartmentID}/${logGroupID}/${logID}" | where data.buildRunId = '${buildRunID}'`,
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

export async function createArtifactsRepository(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string, projectName: string): Promise<artifacts.responses.CreateRepositoryResponse | undefined> {
    try {
        const client = new artifacts.ArtifactsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
        const createRepositoryDetails = {
            repositoryType: artifacts.models.CreateGenericRepositoryDetails.repositoryType,
            displayName: `${projectName}ArtifactRepository`,
            compartmentId: compartmentID,
            description: `Mutable artifact repository for devops project ${projectName}`,
            isImmutable: false
        };
        const createRepositoryRequest: artifacts.requests.CreateRepositoryRequest = {
            createRepositoryDetails: createRepositoryDetails
        };
        return await client.createRepository(createRepositoryRequest);
    } catch (error) {
        console.log('>>> createArtifactRepository ' + error);
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

export async function getBuildRun(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, buildRunID: string): Promise<devops.responses.GetBuildRunResponse | undefined> {
    try {
        const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
        const getBuildRunRequest: devops.requests.GetBuildRunRequest = {
            buildRunId: buildRunID
        };
        return client.getBuildRun(getBuildRunRequest);
    } catch (error) {
        console.log('>>> getBuildRun ' + error);
        return undefined;
    }
}

export async function createBuildRun(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, pipelineID: string, name: string, params: { name: string, value: string }[] = []): Promise<devops.responses.CreateBuildRunResponse | undefined> {
    try {
        const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
        const createBuildRunDetails: devops.models.CreateBuildRunDetails = {
            displayName: name,
            buildPipelineId: pipelineID,
            buildRunArguments: {
                items: params
            }
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

export async function createProjectDevArtifact(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, repositoryID: string, projectID: string, artifactPath: string, artifactName: string, artifactDescription: string): Promise<devops.responses.CreateDeployArtifactResponse | undefined> {
    try {
        const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
        const createDeployArtifactDetails = {
            displayName: artifactName,
            description: artifactDescription,
            deployArtifactType: devops.models.DeployArtifact.DeployArtifactType.GenericFile,
            deployArtifactSource: { // model.GenericDeployArtifactSource
                repositoryId: repositoryID,
                deployArtifactPath: artifactPath,
                deployArtifactVersion: 'dev',
                deployArtifactSourceType: devops.models.GenericDeployArtifactSource.deployArtifactSourceType
            },
            argumentSubstitutionMode:
            devops.models.DeployArtifact.ArgumentSubstitutionMode.None,
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

export function delay(ms: number) {
    return new Promise( resolve => setTimeout(resolve, ms) );
}
