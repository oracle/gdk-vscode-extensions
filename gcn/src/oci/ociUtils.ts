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

const DEFAULT_NOTIFICATION_TOPIC = 'NotificationTopic';
const DEFAULT_LOG_GROUP = 'Default_Group';
const BUILD_IMAGE = 'OL7_X86_64_STANDARD_10';

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
            compartmentId:compartmentID
        };
        return client.listTopics(listTopicsRequest);
    } catch (error) {
        console.log('>>> listNotificationTopics ' + error);
        return undefined;
    }
}

export async function createDefaultNotificationTopic(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string): Promise<ons.responses.CreateTopicResponse | undefined> {
    try {
        const client = new ons.NotificationControlPlaneClient({ authenticationDetailsProvider: authenticationDetailsProvider });
        const createTopicDetails = {
            name: DEFAULT_NOTIFICATION_TOPIC,
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

export async function getOrCreateNotificationTopic(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string): Promise<string | undefined> {
    const notificationTopics = await listNotificationTopics(authenticationDetailsProvider, compartmentID);
    if (notificationTopics) {
        if (notificationTopics.items.length > 0) {
            return notificationTopics.items[0].topicId;
        }
    }
    const created = await createDefaultNotificationTopic(authenticationDetailsProvider, compartmentID);
    if (created) {
        return created.notificationTopic.topicId;
    }
    return undefined;
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
        return client.createLogGroup(createLogGroupRequest);
    } catch (error) {
        console.log('>>> createLogGroup ' + error);
        return undefined;
    }
}

export async function getOrCreateDefaultLogGroup(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string): Promise<string | undefined> {
    const logGroup = await listLogGroups(authenticationDetailsProvider, compartmentID, DEFAULT_LOG_GROUP);
    if (logGroup) {
        if (logGroup.items.length > 0) {
            return logGroup.items[0].id;
        }
    }
    const created = await createDefaultLogGroup(authenticationDetailsProvider, compartmentID);
    if (created) {
        // TODO: wait for the work request to be processed
        await delay(30000);
        // const request = created.opcWorkRequestId;

        const logGroup = await listLogGroups(authenticationDetailsProvider, compartmentID, DEFAULT_LOG_GROUP);
        if (logGroup) {
            if (logGroup.items.length > 0) {
                return logGroup.items[0].id;
            }
        }
    }
    return undefined;
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
        // TODO: wait for the work request to be processed
        return await client.createLog(createLogRequest);
    } catch (error) {
        console.log('>>> createProjectLog ' + error);
        return undefined;
    }
}

export async function createArtifactsRegistry(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string, projectName: string): Promise<artifacts.responses.CreateRepositoryResponse | undefined> {
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
        console.log('>>> createArtifactRegistry ' + error);
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
        // TODO: wait for the work request to be processed
        const repositoryResp = await client.createRepository(createRepositoryRequest);
        await delay(30000);
        return repositoryResp;
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

function delay(ms: number) {
    return new Promise( resolve => setTimeout(resolve, ms) );
}
