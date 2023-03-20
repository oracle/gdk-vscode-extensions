/*
 * Copyright (c) 2022, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as mustache from 'mustache';
import * as gitUtils from '../gitUtils';
import * as model from '../model';
import * as projectUtils from '../projectUtils';
import * as dialogs from '../dialogs';
import * as logUtils from '../logUtils';
import * as gcnServices from '../gcnServices';
import * as ociServices from './ociServices';
import * as ociUtils from './ociUtils';
import * as ociAuthentication from './ociAuthentication';
import * as ociContext from './ociContext';
import * as ociDialogs from './ociDialogs';
import * as sshUtils from './sshUtils';
import * as okeUtils from './okeUtils';
import * as ociFeatures from './ociFeatures';
import * as vcnUtils from './vcnUtils';


const ACTION_NAME = 'Deploy to OCI';

export type SaveConfig = (folder: string, config: any) => boolean;

export async function deployFolders(folders: vscode.WorkspaceFolder[], resourcesPath: string, saveConfig: SaveConfig, dump: model.DumpDeployData): Promise<boolean> {
    logUtils.logInfo('[deploy] Invoked deploy folders to OCI');

    const bypassArtifacts = vscode.workspace.getConfiguration('gcn').get('bypassDeliverArtifactsStage');

    const nblsErr = await projectUtils.checkNBLS();
    if (nblsErr) {
        dialogs.showErrorMessage(nblsErr);
        logUtils.logInfo(`[deploy] ${nblsErr}`);
        return false;
    }

    const dumpData: any = dump(null);
    const deployData: any = dumpData || {};

    for (const folder of folders) {
        if (!deployData.repositories || !deployData.repositories[removeSpaces(folder.name)]?.git) {
            if (gitUtils.getHEAD(folder.uri, true)) {
                dialogs.showErrorMessage(`Folder ${folder.name} being deployed is already versioned and cannot be deployed to OCI.`);
                logUtils.logInfo(`[deploy] Folder ${folder.name} being deployed is already versioned and cannot be deployed to OCI.`);
                return false;
            }
        }
    }

    const openContexts: ociContext.Context[] | undefined = dumpData ? undefined : [];

    const folderData = openContexts ? await gcnServices.getFolderData() : undefined;
    if (openContexts && folderData) {
        for (const data of folderData) {
            const services = ociServices.findByFolderData(data);
            for (const service of services) {
                const context = service.getContext();
                if (!context.getConfigurationProblem()) {
                    openContexts.push(context);
                }
            }
        }
    }

    const incrementalDeploy = openContexts?.length;
    let auth: ociAuthentication.Authentication | undefined;
    if (incrementalDeploy) {
        const profiles: string[] = [];
        for (const context of openContexts) {
            const contextProfile = context.getProfile();
            if (!profiles.includes(contextProfile)) {
                profiles.push(contextProfile);
            }
        }
        const selectedProfile = await ociDialogs.selectOciProfileFromList(profiles, true, ACTION_NAME);
        if (!selectedProfile) {
            dump();
            return false;
        }
        auth = ociAuthentication.createCustom(undefined, selectedProfile);
        deployData.profile = selectedProfile;
    } else {
        auth = await ociAuthentication.resolve(ACTION_NAME, deployData.profile);
    }

    const authentication = auth;
    if (!authentication) {
        dump();
        return false;
    }
    const configurationProblem = authentication.getConfigurationProblem();
    if (configurationProblem) {
        dialogs.showErrorMessage(configurationProblem);
        return false;
    }
    const provider = authentication.getProvider();
    deployData.profile = provider.getProfileCredentials()?.currentProfile;

    let devopsProjectOCID: string | undefined;
    let devopsProjectName: string | undefined;

    if (!deployData.namespace) {
        try {
            deployData.namespace = await ociUtils.getObjectStorageNamespace(provider);
        } catch (err) {}
        if (!deployData.namespace) {
            dialogs.showErrorMessage('Cannot resolve object storage namespace.');
            dump();
            return false;
        }
    }

    if (deployData.compartment) {
        try {
            const compartment = await ociUtils.getCompartment(provider, deployData.compartment.ocid);
            if (!compartment) {
                deployData.compartment = undefined;
            }
        } catch (err) {
            deployData.compartment = undefined;
        }
    }
    if (!deployData.compartment) {
        if (incrementalDeploy) {
            const projects: string[] = [];
            for (const context of openContexts) {
                const contextProject = context.getDevOpsProject();
                if (!projects.includes(contextProject)) {
                    projects.push(contextProject);
                }
            }
            const selectedProject = await ociDialogs.selectDevOpsProjectFromList(provider, projects, true, ACTION_NAME);
            if (selectedProject) {
                if (projects.length === 1) {
                    // folder(s) would be deployed immediately without any confirmation (compartment & devops project are preselected)
                    const confirmOption = folders.length === 1 ? 'Deploy Folder' : 'Deploy Folders';
                    const cancelOption = 'Cancel';
                    const foldersMsg = folders.length === 1 ? `folder ${folders[0].name}` : `${folders.length} folders`;
                    const choice = await vscode.window.showInformationMessage(`Confirm deploy ${foldersMsg} to an existing OCI devops project:`, confirmOption, cancelOption);
                    if (choice !== confirmOption) {
                        return false;
                    }
                }
                devopsProjectName = selectedProject.name;
                devopsProjectOCID = selectedProject.ocid;
                deployData.compartment = { ocid: selectedProject.compartment, name: selectedProject.compartment };
            }
        } else {
            deployData.compartment = await ociDialogs.selectCompartment(provider, ACTION_NAME);
        }
        if (!deployData.compartment) {
            dump();
            return false;
        }
    }

    if (deployData.okeCluster) {
        try {
            const cluster = await ociUtils.getCluster(provider, deployData.okeCluster);
            if (!ociUtils.isUp(cluster.lifecycleState)) {
                deployData.okeCluster = undefined;
            }
        } catch (err) {
            deployData.okeCluster = undefined;
        }
    }
    if (!deployData.okeCluster) {
        const cluster = await okeUtils.selectOkeCluster(provider, deployData.compartment.ocid, provider.getRegion().regionId, true, deployData.compartment.name, true);
        deployData.okeCluster = cluster?.id;
        if (deployData.okeCluster === undefined) {
            dump();
            return false;
        }
        if (deployData.okeCluster) {
            deployData.subnetId = (await vcnUtils.selectNetwork(provider, deployData.compartment.ocid, cluster?.vcnID, true, deployData.compartment.name))?.subnetID;
            if (deployData.subnetId === undefined) {
                dump();
                return false;
            }
        }
    }

    if (!incrementalDeploy) {
        if (deployData.project && !devopsProjectName) {
            try {
                devopsProjectName = (await ociUtils.getDevopsProject(provider, deployData.project.ocid)).name;
                if (!devopsProjectName) {
                    deployData.project = undefined;
                }
            } catch (err) {
                deployData.project = undefined;
            }
        }
        if (!deployData.project) {
            devopsProjectName = await selectProjectName(folders.length === 1 ? removeSpaces(folders[0].name) : undefined);
        }
    }
    if (!devopsProjectName) {
        dump();
        return false;
    }

    let projectName = devopsProjectName;

    logUtils.logInfo(`[deploy] Configured to create devops project '${projectName}' with ${folders.length} code repository(s) in compartment '${deployData.compartment.name}', OKE cluster ${deployData.okeCluster ? 'selected' : 'not selected'}`);

    if (!deployData.tag) {
        deployData.tag = `VSCode-deploy-${new Date().toISOString()}`;
    }

    const error: string | undefined = await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Deploying to OCI',
        cancellable: false
    }, (progress, _token) => {
        return new Promise(async resolve => {
            progress.report({
                message: 'Getting project information...'
            });
            const projectFolders: projectUtils.ProjectFolder[] = [];
            let totalSteps = 1;
            const buildCommands = new Map();
            const niBuildCommands = new Map();
            for (const folder of folders) {
                logUtils.logInfo(`[deploy] Getting project information for folder ${folder.uri.fsPath}`);
                const repositoryName = removeSpaces(folder.name); // TODO: repositoryName should be unique within the devops project
                if (!deployData.repositories) {
                    deployData.repositories = {};
                }
                let folderData = deployData.repositories[repositoryName];
                if (!folderData) {
                    folderData = deployData.repositories[repositoryName] = {};
                }
                const projectFolder = await projectUtils.getProjectFolder(folder);
                logUtils.logInfo(`[deploy] Folder ${folder.uri.fsPath} identified as project of type ${projectFolder.projectType} with build system ${projectFolder.buildSystem}`);
                projectFolders.push(projectFolder);
                totalSteps += 3; // code repository, cloud services config, populating code repository
                if (projectFolder.projectType === 'GCN') {
                    totalSteps += 4; // Jar build spec and pipeline, NI build spec and pipeline
                    if (!bypassArtifacts) {
                        totalSteps += 2; // Jar artifact, NI artifact
                    }
                    if (deployData.okeCluster) {
                        totalSteps += 8; // OKE setup command spec and artifact, OKE deploy spec and artifact, deploy to OKE pipeline, dev OKE deploy spec and artifact, dev deploy to OKE pipeline
                    }
                    totalSteps += 4; // Docker jvm image, build spec, and pipeline, jvm container repository
                    totalSteps += 4 * projectUtils.getCloudSpecificSubProjectNames(projectFolder).length; // Docker native image, build spec, and pipeline, native container repository per cloud specific subproject
                } else if (projectFolder.projectType === 'Micronaut' || projectFolder.projectType === 'SpringBoot') {
                    totalSteps += 12; // Jar build spec and pipeline, NI build spec and pipeline, Docker native image, build spec and pipeline, Docker jvm image, build spec and pipeline, native container repository, jvm container repository
                    if (!bypassArtifacts) {
                        totalSteps += 2; // Jar artifact, NI artifact
                    }
                    if (deployData.okeCluster) {
                        totalSteps += 8; // OKE setup command spec and artifact, OKE deploy spec and artifact, deploy to OKE pipeline, dev OKE deploy spec and artifact, dev deploy to OKE pipeline
                    }
                } else {
                    const baLocation = await projectUtils.getProjectBuildArtifactLocation(projectFolder);
                    let buildCommand;
                    if (folderData.projectBuildCommand) {
                        buildCommand = folderData.projectBuildCommand;
                    } else {
                        buildCommand = baLocation ? await projectUtils.getProjectBuildCommand(projectFolder) : undefined;
                        folderData.projectBuildCommand = buildCommand;
                    }
                    if (buildCommand) {
                        totalSteps += 6; // Jar build spec and pipeline, Docker jvm image, build spec and pipeline, jvm container repository
                        if (!bypassArtifacts) {
                            totalSteps += 1; // Jar artifact
                        }
                        if (deployData.okeCluster) {
                            totalSteps += 3; // dev OKE deploy spec and artifact, dev deploy to OKE pipeline
                        }
                        buildCommands.set(projectFolder, buildCommand);
                    }
                    const niLocation = await projectUtils.getProjectNativeExecutableArtifactLocation(projectFolder);
                    let niBuildCommand;
                    if (folderData.projectBuildNativeExecutableCommand) {
                        niBuildCommand = folderData.projectBuildNativeExecutableCommand;
                    } else {
                        niBuildCommand = niLocation ? await projectUtils.getProjectBuildNativeExecutableCommand(projectFolder) : undefined;
                        folderData.projectBuildNativeExecutableCommand = niBuildCommand;
                    }
                    if (niBuildCommand) {
                        totalSteps += 6; // NI build spec and pipeline, Docker native image, build spec and pipeline, native container repository
                        if (!bypassArtifacts) {
                            totalSteps += 1; // NI artifact
                        }
                        if (deployData.okeCluster) {
                            totalSteps += 3; // OKE deploy spec and artifact, deploy to OKE pipeline
                        }
                        niBuildCommands.set(projectFolder, niBuildCommand);
                    }
                    if (deployData.okeCluster) {
                        totalSteps += 2; // OKE setup command spec and artifact
                    }
                    if (!buildCommand && !niBuildCommand) {
                        resolve(`Cannot deploy unsupported project without build or native executable build command specified: ${folder.name}`);
                        return;
                    }
                }
                totalSteps += 1; // list of generated resources
            }
            totalSteps += 8; // notification topic, devops project, project log, policies, artifact repository, OKE cluster environment, knowledge base, list of generated resources
            logUtils.logInfo(`[deploy] Computed total nuber of steps: ${totalSteps}`);
            const increment = 100 / totalSteps;

            const projectResources: any = {}; // list of generated resources for the devops project (generic inline artifact)

            if (incrementalDeploy || deployData.project) {
                progress.report({
                    increment: increment * 2,
                    message: 'Using already created devops project...'
                });
                logUtils.logInfo(`[deploy] Using already created devops project ${deployData.compartment.name}/${projectName}`);
            } else {
                // -- Create notification topic
                progress.report({
                    increment,
                    message: 'Setting up notifications...'
                });
                const notificationTopicDescription = `Shared notification topic for devops projects in compartment ${deployData.compartment.name}`;
                try {
                    logUtils.logInfo(`[deploy] Setting up notification topic for ${deployData.compartment.name}/${projectName}`);
                    const notificationTopicInfo = await ociUtils.getOrCreateNotificationTopic(provider, deployData.compartment.ocid, notificationTopicDescription);
                    deployData.notificationTopic = notificationTopicInfo.notificationTopic.topicId;
                    if (notificationTopicInfo.created) {
                        if (!projectResources.notificationTopics) {
                            projectResources.notificationTopics = [];
                        }
                        projectResources.notificationTopics.push({
                            ocid: notificationTopicInfo.notificationTopic.topicId,
                            originalName: notificationTopicInfo.notificationTopic.name
                        });
                    }
                } catch (err) {
                    resolve(dialogs.getErrorMessage('Failed to prepare notification topic', err));
                    return;
                }

                // --- Create devops project
                progress.report({
                    increment,
                    message: 'Creating devops project...'
                });
                const projectDescription = projectFolders.length === 1 ? `${projectFolders[0].projectType} project deployed from the VS Code`: 'Workspace deployed from the VS Code';
                while (deployData.project === undefined) {
                    try {
                        logUtils.logInfo(`[deploy] Creating devops project ${deployData.compartment.name}/${projectName}`);
                        const project = (await ociUtils.createDevOpsProject(provider, projectName, deployData.compartment.ocid, deployData.notificationTopic, projectDescription, {
                            'gcn_tooling_deployID': deployData.tag
                        }));
                        deployData.project = { ocid: project.id, name: project.name };
                    } catch (err) {
                        const message: string | undefined = (err as any).message;
                        if (message && message.indexOf('project name already exists') !== -1) {
                            vscode.window.showWarningMessage(`Project name '${projectName}' already exists in the tenancy.`);
                            logUtils.logInfo(`[deploy] Project name '${projectName}' already exists in the tenancy`);
                            const newName = await selectProjectName(projectName);
                            if (!newName) {
                                dump();
                                resolve(undefined);
                                return;
                            }
                            projectName = newName;
                        } else {
                            resolve(dialogs.getErrorMessage('Failed to create devops project', err));
                            deployData.project = false;
                            dump(deployData);
                            return;
                        }
                    }
                }
                dump(deployData);
            }

            const projectOCID = incrementalDeploy ? devopsProjectOCID : deployData.project.ocid;

            progress.report({
                increment,
                message: 'Setting up logging...'
            });
            if (deployData.logGroup) {
                try {
                    const group = (await ociUtils.getDefaultLogGroup(provider, deployData.compartment.ocid))?.logGroup.id;
                    if (!group) {
                        deployData.logGroup = undefined;
                    }
                } catch (err) {
                    deployData.logGroup = undefined;
                }
            }
            if (incrementalDeploy || deployData.logGroup) {
                logUtils.logInfo(`[deploy] Using already created log group`);
            } else {
                const logGroupDescription = `Shared log group for devops projects in compartment ${deployData.compartment.name}`;
                try {
                    logUtils.logInfo(`[deploy] Setting up logging for ${deployData.compartment.name}/${projectName}`);
                    const logGroupInfo = await ociUtils.getDefaultLogGroup(provider, deployData.compartment.ocid, true, logGroupDescription);
                    deployData.logGroup = logGroupInfo?.logGroup.id;
                    if (logGroupInfo?.created) {
                        if (!projectResources.logGroups) {
                            projectResources.logGroups = [];
                        }
                        projectResources.logGroups.push({
                            ocid: logGroupInfo.logGroup.id,
                            originalName: logGroupInfo.logGroup.displayName
                        });
                    }
                } catch (err) {
                    resolve(dialogs.getErrorMessage('Failed to resolve log group', err));
                    return;
                }
                if (!deployData.logGroup) {
                    resolve('Failed to resolve log group.');
                    return;
                }
                dump(deployData);
            }
            let projectLogCompleted: boolean = false;
            let projectLogPromise;
            if (deployData.projectLogWorkRequest) {
                try {
                    const log = await ociUtils.loggingWaitForResourceCompletionStatus(provider, `Log for project ${projectName}`, deployData.projectLogWorkRequest);
                    if (!log) {
                        deployData.projectLogWorkRequest = undefined;
                    }
                } catch (err) {
                    deployData.projectLogWorkRequest = undefined;
                }
            }
            if (incrementalDeploy || deployData.projectLogWorkRequest) {
                logUtils.logInfo(`[deploy] Using already created project log for ${deployData.compartment.name}/${projectName}`);
            } else {
                try {
                    logUtils.logInfo(`[deploy] Creating project log for ${deployData.compartment.name}/${projectName}`);
                    const logName = `${projectName}Log`;
                    deployData.projectLogWorkRequest = false;
                    deployData.projectLogWorkRequest = await ociUtils.createProjectLog(provider, deployData.compartment.ocid, deployData.logGroup, projectOCID, logName, {
                        'gcn_tooling_deployID': deployData.tag
                    });
                    projectLogPromise = ociUtils.loggingWaitForResourceCompletionStatus(provider, `Log for project ${projectName}`, deployData.projectLogWorkRequest).
                        then(ocid => {
                            if (!projectResources.logs) {
                                projectResources.logs = [];
                            }
                            projectResources.logs.push({
                                ocid: ocid,
                                originalName: logName
                            });
                        }).finally(() => projectLogCompleted = true);
                } catch (err) {
                    const message: string | undefined = (err as any).message;
                    if (!message || message.indexOf('log in the log group already uses this display name') < 0) {
                        resolve(dialogs.getErrorMessage('Failed to create project log', err));
                        deployData.projectLogWorkRequest = false;
                        dump(deployData);
                        return;
                    }
                    const existing = await ociUtils.listLogsByProject(provider, deployData.compartment.ocid);
                    let cnt = 1;
                    let logName: string;
                    do {
                        logName = `${projectName}Log${cnt++}`;
                    } while (existing.find(e => logName === e.displayName));
                    try {
                        deployData.projectLogWorkRequest = await ociUtils.createProjectLog(provider, deployData.compartment.ocid, deployData.logGroup, projectOCID, logName, {
                            'gcn_tooling_deployID': deployData.tag
                        });
                        projectLogPromise = ociUtils.loggingWaitForResourceCompletionStatus(provider, `Log for project ${projectName}`, deployData.projectLogWorkRequest).
                        then(ocid => {
                            if (!projectResources.logs) {
                                projectResources.logs = [];
                            }
                            projectResources.logs.push({
                                ocid: ocid,
                                originalName: logName
                            });
                        }).finally(() => projectLogCompleted = true);
                    } catch (e) {
                        resolve(dialogs.getErrorMessage('Failed to create project log', e));
                        deployData.projectLogWorkRequest = false;
                        dump(deployData);
                        return;
                    }
                }
                dump(deployData);
            }

            if (incrementalDeploy) {
                progress.report({
                    increment: increment
                });
            } else {
                // --- Setting up policy for accessing resources in compartment
                progress.report({
                    increment,
                    message: 'Setting up policy for accessing resources in compartment...'
                });
                try {
                    logUtils.logInfo(`[deploy] Setting up policy for accessing resources in compartment for ${deployData.compartment.name}/${projectName}`);
                    const compartmentAccessPolicy = await ociUtils.getCompartmentAccessPolicy(provider, deployData.compartment.ocid, true);
                    if (!compartmentAccessPolicy) {
                        resolve('Failed to resolve policy for accessing resources in compartment.');
                        return;
                    }
                } catch (err) {
                    resolve(dialogs.getErrorMessage('Failed to resolve policy for accessing resources in compartment', err));
                    return;
                }
            }

            if (deployData.artifactsRepository) {
                progress.report({
                    message: `Using already created artifact repository for ${projectName}...`
                });
                try {
                    const repository = await ociUtils.getArtifactRepository(provider, deployData.artifactsRepository);
                    if (!repository) {
                        deployData.artifactsRepository = undefined;
                    }
                } catch (err) {
                    deployData.artifactsRepository = undefined;
                }
            }
            let artifactRepositoryOCID: string | undefined;
            if (incrementalDeploy || deployData.artifactsRepository) {
                progress.report({
                    increment,
                });
                logUtils.logInfo(`[deploy] Using already created artifact repository for ${deployData.compartment.name}/${projectName}`);
                if (incrementalDeploy) {
                    logUtils.logInfo(`[deploy] Resolving existing artifact repository for ${deployData.compartment.name}/${projectName}`);
                    const artifactRepositories = await ociUtils.listArtifactRepositories(provider, deployData.compartment.ocid);
                    for (const artifactRepository of artifactRepositories) {
                        const tags = artifactRepository.freeformTags;
                        if (tags['gcn_tooling_projectOCID'] === projectOCID) {
                            artifactRepositoryOCID = artifactRepository.id;
                            break;
                        }
                    }
                    if (!artifactRepositoryOCID) {
                        // TODO: might be an imported DevOps project not created by our extension - (offer to) create new/select existing artifact repository? 
                        resolve(`Failed to resolve artifact repository for devops project ${projectName}`);
                        return;
                    }
                } else {
                    artifactRepositoryOCID = deployData.artifactsRepository;
                }
            } else {
                // --- Create artifact repository
                progress.report({
                    increment,
                    message: `Creating artifact repository for ${projectName}...`
                });
                try {
                    logUtils.logInfo(`[deploy] Creating artifact repository for ${deployData.compartment.name}/${projectName}`);
                    deployData.artifactsRepository = false;
                    const artifactsRepository = await ociUtils.createArtifactsRepository(provider, deployData.compartment.ocid, projectName, {
                        'gcn_tooling_deployID': deployData.tag,
                        'gcn_tooling_projectOCID': projectOCID
                    });
                    deployData.artifactsRepository = artifactsRepository.id;
                    artifactRepositoryOCID = deployData.artifactsRepository;
                    if (!projectResources.artifactRepositories) {
                        projectResources.artifactRepositories = [];
                    }
                    projectResources.artifactRepositories.push({
                        ocid: artifactsRepository.id,
                        originalName: artifactsRepository.displayName
                    });
                } catch (err) {
                    resolve(dialogs.getErrorMessage('Failed to create artifact repository', err));
                    deployData.artifactsRepository = false;
                    dump(deployData);
                    return;
                }
                dump(deployData);
            }
            const artifactRepository: string = artifactRepositoryOCID as string;

            if (deployData.okeCluster) {
                if (deployData.okeClusterEnvironment) {
                    progress.report({
                        message: `Using already created OKE cluster environment for ${projectName}...`
                    });
                    try {
                        const env = await ociUtils.getDeployEnvironment(provider, deployData.okeClusterEnvironment);
                        if (!env) {
                            deployData.okeClusterEnvironment = undefined;
                        }
                    } catch (err) {
                        deployData.okeClusterEnvironment = undefined;
                    }
                }
                if (deployData.okeClusterEnvironment) {
                    progress.report({
                        increment,
                    });
                    logUtils.logInfo(`[deploy] Using already created OKE cluster environment for ${deployData.compartment.name}/${projectName}`);
                } else {
                    // --- Create cluster environment
                    progress.report({
                        increment,
                        message: `Creating OKE cluster environment for ${projectName}...`
                    });
                    try {
                        logUtils.logInfo(`[deploy] Creating OKE cluster environment for ${deployData.compartment.name}/${projectName}`);
                        deployData.okeClusterEnvironment = false;
                        const okeClusterEnvironment = await ociUtils.createOkeDeployEnvironment(provider, projectOCID, projectName, deployData.okeCluster, {
                            'gcn_tooling_deployID': deployData.tag
                        });
                        deployData.okeClusterEnvironment = okeClusterEnvironment.id;
                        if (!projectResources.deployEnvironments) {
                            projectResources.deployEnvironments = [];
                        }
                        projectResources.deployEnvironments.push({
                            ocid: okeClusterEnvironment.id,
                            originalName: okeClusterEnvironment.displayName
                        });
                    } catch (err) {
                        resolve(dialogs.getErrorMessage('Failed to create OKE cluster environment', err));
                        deployData.okeClusterEnvironment = false;
                        dump(deployData);
                        return;
                    }
                    dump(deployData);
                }
            }

            let knowledgeCompleted: boolean = false;
            let knowledgePromise;
            if (deployData.knowledgeBaseWorkRequest) {
                progress.report({
                    message: `Using already created ADM knowledge base for ${projectName}...`
                });
                try {
                    const knowledgeBase = await ociUtils.admWaitForResourceCompletionStatus(provider, `Knowledge base for project ${projectName}`, deployData.knowledgeBaseWorkRequest);
                    if (knowledgeBase) {
                        knowledgeCompleted = true;
                    } else {
                        deployData.knowledgeBaseWorkRequest = undefined;
                    }
                } catch (err) {
                    deployData.knowledgeBaseWorkRequest = undefined;
                }
            }
            let knowledgeBaseOCID: string | undefined;
            if (incrementalDeploy || deployData.knowledgeBaseWorkRequest) {
                progress.report({
                    increment,
                });
                logUtils.logInfo(`[deploy] Using already created ADM knowledge base for ${deployData.compartment.name}/${projectName}`);
                if (incrementalDeploy) {
                    logUtils.logInfo(`[deploy] Resolving existing knowledge base for ${deployData.compartment.name}/${projectName}`);
                    const knowledgeBases = await ociUtils.listKnowledgeBases(provider, deployData.compartment.ocid);
                    for (const knowledgeBase of knowledgeBases) {
                        const tags = knowledgeBase.freeformTags;
                        if (tags['gcn_tooling_projectOCID'] === projectOCID) {
                            knowledgeBaseOCID = knowledgeBase.id;
                            break;
                        }
                    }
                    if (!knowledgeBaseOCID) {
                        // TODO: might be an imported DevOps project not created by our extension - (offer to) create new/select existing knowledge base? 
                        resolve(`Failed to resolve knowledge base for devops project ${projectName}`);
                        return;
                    }
                }
            } else {
                // --- Create a default knowledge base; tie it to a project + mark so it can be recognized later
                // displayName must match ".*(?:^[a-zA-Z_](-?[a-zA-Z_0-9])*$).*"
                progress.report({
                    increment,
                    message: `Creating ADM knowledge base for ${projectName}...`
                });
                const knowledgeBaseDescription = `Vulnerability audits for devops project ${projectName}`;
                try {
                    logUtils.logInfo(`[deploy] Creating ADM knowledge base for ${deployData.compartment.name}/${projectName}`);
                    deployData.knowledgeBaseWorkRequest = false;
                    deployData.knowledgeBaseWorkRequest = await ociUtils.createKnowledgeBase(provider, deployData.compartment?.ocid || "", projectName, {
                        'gcn_tooling_deployID': deployData.tag,
                        'gcn_tooling_projectOCID': projectOCID,
                        'gcn_tooling_description': knowledgeBaseDescription,
                        'gcn_tooling_usage': 'gcn-adm-audit'
                    });
                    knowledgePromise = ociUtils.admWaitForResourceCompletionStatus(provider, `Knowledge base for project ${projectName}`, deployData.knowledgeBaseWorkRequest).
                        then(ocid => {
                            deployData.knowledgeBaseOCID = ocid;
                            knowledgeBaseOCID = ocid;
                            if (!projectResources.knowledgeBases) {
                                projectResources.knowledgeBases = [];
                            }
                            projectResources.knowledgeBases.push({
                                ocid: ocid,
                                originalName: `${projectName}Audits` // TODO: better to be resolved from the created KB
                            });
                        }).finally(() => knowledgeCompleted = true);
                } catch (err) {
                    resolve(dialogs.getErrorMessage('Failed to create knowledge base', err));
                    if (!deployData.knowledgeBaseWorkRequest) {
                        deployData.knowledgeBaseWorkRequest = false;
                    }
                    dump(deployData);
                    return;
                }
                dump(deployData);
            }

            for (const folder of projectFolders) {
                const repositoryDir = folder.uri.fsPath;
                const repositoryName = removeSpaces(folder.name); // TODO: repositoryName should be unique within the devops project
                const repositoryNamePrefix = `${repositoryName}: `;
                const buildPipelines = [];
                const deployPipelines = [];
                if (!deployData.repositories) {
                    deployData.repositories = {};
                }
                let folderData = deployData.repositories[repositoryName];
                if (!folderData) {
                    folderData = deployData.repositories[repositoryName] = {};
                }

                const codeRepoResources: any = {}; // list of generated resources for the code repository (generic inline artifact)

                logUtils.logInfo(`[deploy] Deploying folder ${repositoryDir}`);

                let codeRepositoryCompleted: boolean = false;
                let codeRepositoryPromise;
                let codeRepository;
                if (folderData.codeRepository) {
                    progress.report({
                        message: `Using already created source code repository...`
                    });
                    try {
                        codeRepository = await ociUtils.getCodeRepository(provider, folderData.codeRepository);
                        if (codeRepository) {
                            codeRepositoryCompleted = true;
                        } else {
                            folderData.codeRepository = undefined;
                        }
                    } catch (err) {
                        folderData.codeRepository = undefined;
                    }
                }
                if (folderData.codeRepository) {
                    progress.report({
                        increment,
                    });
                    logUtils.logInfo(`[deploy] Using already created source code repository ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                } else {
                    // --- Create code repository
                    progress.report({
                        increment,
                        message: `Creating source code repository ${repositoryName}...`
                    });
                    const description = `Source code repository ${repositoryName}`;
                    try {
                        logUtils.logInfo(`[deploy] Creating source code repository ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                        folderData.codeRepository = false;
                        const repo = await ociUtils.createCodeRepository(provider, projectOCID, repositoryName, 'master', description, {
                            'gcn_tooling_deployID': deployData.tag,
                            'gcn_tooling_deployIncomplete': 'true'
                        });
                        codeRepository = repo.repository;
                        folderData.codeRepository = codeRepository.id;
                        codeRepositoryPromise = ociUtils.devopsWaitForResourceCompletionStatus(provider, `Source code repository ${repositoryName}`, repo.workRequestId)
                            .then(() => codeRepositoryCompleted = true);
                    } catch (err) {
                        resolve(dialogs.getErrorMessage(`Failed to create source code repository ${repositoryName}`, err));
                        if (!folderData.codeRepository) {
                            folderData.codeRepository = false;
                        }
                        dump(deployData);
                        return;
                    }
                    dump(deployData);
                }
                if (!codeRepository || !codeRepository.sshUrl || !codeRepository.httpUrl) {
                    resolve(`Failed to resolve URL of source code repository ${repositoryName}.`);
                    return;
                }

                if (codeRepository.sshUrl) {
                    try {
                        await sshUtils.checkSshConfigured(provider, codeRepository.sshUrl);
                    } catch (err) {
                        resolve(`Failed to configure SSH for repository ${repositoryName} URL ${codeRepository.sshUrl}.`);
                        return;
                    }
                }

                const project_devbuild_artifact_location = pathForTargetPlatform(await projectUtils.getProjectBuildArtifactLocation(folder));
                if (!project_devbuild_artifact_location && folder.projectType !== 'Unknown') {
                    dialogs.showErrorMessage(`Failed to resolve fat JAR artifact for folder ${folder.uri.fsPath}`);
                }
                const project_devbuild_command = folder.projectType === 'Unknown' ? buildCommands.get(folder) : await projectUtils.getProjectBuildCommand(folder);
                if (!project_devbuild_command && folder.projectType !== 'Unknown') {
                    dialogs.showErrorMessage(`Failed to resolve fat JAR build command for folder ${folder.uri.fsPath}`);
                }
                if (project_devbuild_artifact_location && project_devbuild_command) {
                    // --- Generate fat JAR build spec
                    progress.report({
                        increment,
                        message: `Creating fat JAR build spec for source code repository ${repositoryName}...`
                    });
                    const devbuildspec_template = 'devbuild_spec.yaml';
                    const devbuildArtifactName = `${repositoryName}_dev_fatjar`;
                    if (bypassArtifacts) {
                        logUtils.logInfo(`[deploy] Creating fat JAR build spec for ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                        const devbuildTemplate = expandTemplate(resourcesPath, 'devbuild_spec_no_output_artifacts.yaml', {
                            project_build_command: project_devbuild_command,
                            project_artifact_location: project_devbuild_artifact_location,
                            artifact_repository_id: artifactRepository,
                            artifact_path: `${repositoryName}-dev.jar`
                        }, folder, devbuildspec_template);
                        if (!devbuildTemplate) {
                            resolve(`Failed to configure fat JAR build spec for ${repositoryName}`);
                            return;
                        }
                    } else {
                        logUtils.logInfo(`[deploy] Creating fat JAR build spec for ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                        const devbuildTemplate = expandTemplate(resourcesPath, devbuildspec_template, {
                            project_build_command: project_devbuild_command,
                            project_artifact_location: project_devbuild_artifact_location,
                            deploy_artifact_name: devbuildArtifactName
                        }, folder);
                        if (!devbuildTemplate) {
                            resolve(`Failed to configure fat JAR build spec for ${repositoryName}`);
                            return;
                        }

                        if (folderData.devbuildArtifact) {
                            progress.report({
                                message: `Using already created fat JAR artifact for ${repositoryName}...`
                            });
                            try {
                                const artifact = await ociUtils.getDeployArtifact(provider, folderData.devbuildArtifact);
                                if (!artifact) {
                                    folderData.devbuildArtifact = undefined;
                                }
                            } catch (err) {
                                folderData.devbuildArtifact = undefined;
                            }
                        }
                        if (folderData.devbuildArtifact) {
                            progress.report({
                                increment,
                            });
                            logUtils.logInfo(`[deploy] Using already created fat JAR artifact for ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                        } else {
                            // --- Create fat JAR artifact
                            progress.report({
                                increment,
                                message: `Creating fat JAR artifact for ${repositoryName}...`
                            });
                            const devbuildArtifactPath = `${repositoryName}-dev.jar`;
                            const devbuildArtifactDescription = `Fat JAR artifact for devops project ${projectName} & repository ${repositoryName}`;
                            try {
                                logUtils.logInfo(`[deploy] Creating fat JAR artifact for ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                folderData.devbuildArtifact = false;
                                folderData.devbuildArtifact = (await ociUtils.createProjectDevArtifact(provider, artifactRepository, projectOCID, devbuildArtifactPath, devbuildArtifactName, devbuildArtifactDescription, {
                                    'gcn_tooling_deployID': deployData.tag,
                                    'gcn_tooling_codeRepoID': codeRepository.id
                                })).id;
                                if (!codeRepoResources.artifacts) {
                                    codeRepoResources.artifacts = [];
                                }
                                codeRepoResources.artifacts.push({
                                    ocid: folderData.devbuildArtifact,
                                    originalName: devbuildArtifactName
                                });
                            } catch (err) {
                                resolve(dialogs.getErrorMessage(`Failed to create fat JAR artifact for ${repositoryName}`, err));
                                folderData.devbuildArtifact = false;
                                dump(deployData);
                                return;
                            }
                            dump(deployData);
                        }
                    }

                    const devbuildPipelineName = 'Build Fat JAR';
                    if (folderData.devbuildPipeline) {
                        progress.report({
                            message: `Using already created build pipeline for fat JAR of ${repositoryName}...`
                        });
                        try {
                            const pipeline = await ociUtils.getBuildPipeline(provider, folderData.devbuildPipeline);
                            if (!pipeline) {
                                folderData.devbuildPipeline = undefined;
                            }
                        } catch (err) {
                            folderData.devbuildPipeline = undefined;
                        }
                    }
                    if (folderData.devbuildPipeline) {
                        progress.report({
                            increment,
                        });
                        logUtils.logInfo(`[deploy] Using already created build pipeline for fat JAR of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                    } else {
                        // --- Create fat JAR pipeline
                        progress.report({
                            increment,
                            message: `Creating build pipeline for fat JAR of ${repositoryName}...`
                        });
                        const devbuildPipelineDescription = `Build pipeline to build fat JAR for devops project ${projectName} & repository ${repositoryName}`;
                        try {
                            logUtils.logInfo(`[deploy] Creating build pipeline for fat JAR of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                            const pipelineName = `${repositoryNamePrefix}${devbuildPipelineName}`;
                            folderData.devbuildPipeline = false;
                            folderData.devbuildPipeline = (await ociUtils.createBuildPipeline(provider, projectOCID, pipelineName, devbuildPipelineDescription, {
                                'gcn_tooling_deployID': deployData.tag,
                                'gcn_tooling_codeRepoID': codeRepository.id,
                                'gcn_tooling_codeRepoPrefix': repositoryNamePrefix
                            })).id;
                            if (!codeRepoResources.buildPipelines) {
                                codeRepoResources.buildPipelines = [];
                            }
                            codeRepoResources.buildPipelines.push({
                                ocid: folderData.devbuildPipeline,
                                originalName: pipelineName
                            });
                        } catch (err) {
                            resolve(dialogs.getErrorMessage(`Failed to create fat JAR pipeline for ${repositoryName}`, err));
                            folderData.devbuildPipeline = false;
                            dump(deployData);
                            return;
                        }
                        dump(deployData);
                    }
                    if (folderData.devbuildPipelineBuildStage) {
                        try {
                            const stage = await ociUtils.getBuildPipelineStage(provider, folderData.devbuildPipelineBuildStage);
                            if (!stage) {
                                folderData.devbuildPipelineBuildStage = undefined;
                            }
                        } catch (err) {
                            folderData.devbuildPipelineBuildStage = undefined;
                        }
                    }
                    if (folderData.devbuildPipelineBuildStage) {
                        logUtils.logInfo(`[deploy] Using already created build stage of build pipeline for fat JAR of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                    } else {
                        try {
                            logUtils.logInfo(`[deploy] Creating build stage of build pipeline for fat JAR of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                            folderData.devbuildPipelineBuildStage = false;
                            folderData.devbuildPipelineBuildStage = (await ociUtils.createBuildPipelineBuildStage(provider, folderData.devbuildPipeline, codeRepository.id, repositoryName, codeRepository.httpUrl, `.gcn/${devbuildspec_template}`, false, {
                                'gcn_tooling_deployID': deployData.tag
                            })).id;
                        } catch (err) {
                            resolve(dialogs.getErrorMessage(`Failed to create fat JAR pipeline build stage for ${repositoryName}`, err));
                            folderData.devbuildPipelineBuildStage = false;
                            dump(deployData);
                            return;
                        }
                        dump(deployData);
                    }
                    if (!bypassArtifacts) {
                        if (folderData.devbuildPipelineArtifactsStage) {
                            try {
                                const stage = await ociUtils.getBuildPipelineStage(provider, folderData.devbuildPipelineArtifactsStage);
                                if (!stage) {
                                    folderData.devbuildPipelineArtifactsStage = undefined;
                                }
                            } catch (err) {
                                folderData.devbuildPipelineArtifactsStage = undefined;
                            }
                        }
                        if (folderData.devbuildPipelineArtifactsStage) {
                            logUtils.logInfo(`[deploy] Using already created artifacts stage of build pipeline for fat JAR of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                        } else {
                            try {
                                logUtils.logInfo(`[deploy] Creating artifacts stage of build pipeline for fat JAR of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                folderData.devbuildPipelineArtifactsStage = false;
                                folderData.devbuildPipelineArtifactsStage = (await ociUtils.createBuildPipelineArtifactsStage(provider, folderData.devbuildPipeline, folderData.devbuildPipelineBuildStage, folderData.devbuildArtifact, devbuildArtifactName, {
                                    'gcn_tooling_deployID': deployData.tag
                                })).id;
                            } catch (err) {
                                resolve(dialogs.getErrorMessage(`Failed to create fat JAR pipeline artifacts stage for ${repositoryName}`, err));
                                folderData.devbuildPipelineArtifactsStage = false;
                                dump(deployData);
                                return;
                            }
                            dump(deployData);
                        }
                    }
                }

                const project_native_executable_artifact_location = pathForTargetPlatform(await projectUtils.getProjectNativeExecutableArtifactLocation(folder));
                if (!project_native_executable_artifact_location && folder.projectType !== 'Unknown') {
                    dialogs.showErrorMessage(`Failed to resolve native executable artifact for folder ${folder.uri.fsPath}`);
                }
                const project_build_native_executable_command = folder.projectType === 'Unknown' ? niBuildCommands.get(folder) : await projectUtils.getProjectBuildNativeExecutableCommand(folder);
                if (!project_build_native_executable_command && folder.projectType !== 'Unknown') {
                    dialogs.showErrorMessage(`Failed to resolve native executable build command for folder ${folder.uri.fsPath}`);
                }
                if (project_native_executable_artifact_location && project_build_native_executable_command) {
                    // --- Generate native image build spec
                    progress.report({
                        increment,
                        message: `Creating native executable build spec for source code repository ${repositoryName}...`
                    });
                    const nibuildspec_template = 'nibuild_spec.yaml';
                    const nibuildArtifactName = `${repositoryName}_dev_executable`;
                    if (bypassArtifacts) {
                        logUtils.logInfo(`[deploy] Creating native executable build spec for ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                        const nibuildTemplate = expandTemplate(resourcesPath, 'nibuild_spec_no_output_artifacts.yaml', {
                            project_build_command: project_build_native_executable_command,
                            project_artifact_location: project_native_executable_artifact_location,
                            artifact_repository_id: artifactRepository,
                            artifact_path: `${repositoryName}-dev`
                        }, folder, nibuildspec_template);
                        if (!nibuildTemplate) {
                            resolve(`Failed to configure native executable build spec for ${repositoryName}`);
                            return;
                        }
                    } else {
                        logUtils.logInfo(`[deploy] Creating native executable build spec for ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                        const nibuildTemplate = expandTemplate(resourcesPath, nibuildspec_template, {
                            project_build_command: project_build_native_executable_command,
                            project_artifact_location: project_native_executable_artifact_location,
                            deploy_artifact_name: nibuildArtifactName
                        }, folder);
                        if (!nibuildTemplate) {
                            resolve(`Failed to configure native executable build spec for ${repositoryName}`);
                            return;
                        }

                        if (folderData.nibuildArtifact) {
                            progress.report({
                                message: `Using already created native executable artifact for ${repositoryName}...`
                            });
                            try {
                                const artifact = await ociUtils.getDeployArtifact(provider, folderData.nibuildArtifact);
                                if (!artifact) {
                                    folderData.nibuildArtifact = undefined;
                                }
                            } catch (err) {
                                folderData.nibuildArtifact = undefined;
                            }
                        }
                        if (folderData.nibuildArtifact) {
                            progress.report({
                                increment,
                            });
                            logUtils.logInfo(`[deploy] Using already created native executable artifact for ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                        } else {
                            // --- Create native image artifact
                            progress.report({
                                increment,
                                message: `Creating native executable artifact for ${repositoryName}...`
                            });
                            const nibuildArtifactPath = `${repositoryName}-dev`;
                            const nibuildArtifactDescription = `Native executable artifact for devops project ${projectName} & repository ${repositoryName}`;
                            try {
                                logUtils.logInfo(`[deploy] Creating native executable artifact for ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                folderData.nibuildArtifact = false;
                                folderData.nibuildArtifact = (await ociUtils.createProjectDevArtifact(provider, artifactRepository, projectOCID, nibuildArtifactPath, nibuildArtifactName, nibuildArtifactDescription, {
                                    'gcn_tooling_deployID': deployData.tag,
                                    'gcn_tooling_codeRepoID': codeRepository.id
                                })).id;
                                if (!codeRepoResources.artifacts) {
                                    codeRepoResources.artifacts = [];
                                }
                                codeRepoResources.artifacts.push({
                                    ocid: folderData.nibuildArtifact,
                                    originalName: nibuildArtifactName
                                });
                            } catch (err) {
                                resolve(dialogs.getErrorMessage(`Failed to create native executable artifact for ${repositoryName}`, err));
                                folderData.nibuildArtifact = false;
                                dump(deployData);
                                return;
                            }
                            dump(deployData);
                        }
                    }

                    const nibuildPipelineName = 'Build Native Executable';
                    if (folderData.nibuildPipeline) {
                        progress.report({
                            message: `Using already created build pipeline for native executable of ${repositoryName}...`
                        });
                        try {
                            const pipeline = await ociUtils.getBuildPipeline(provider, folderData.nibuildPipeline);
                            if (!pipeline) {
                                folderData.nibuildPipeline = undefined;
                            }
                        } catch (err) {
                            folderData.nibuildPipeline = undefined;
                        }
                    }
                    if (folderData.nibuildPipeline) {
                        progress.report({
                            increment,
                        });
                        logUtils.logInfo(`[deploy] Using already created build pipeline for native executable of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                    } else {
                        // --- Create native image pipeline
                        progress.report({
                            increment,
                            message: `Creating build pipeline for native executable of ${repositoryName}...`
                        });
                        const nibuildPipelineDescription = `Build pipeline to build native executable for devops project ${projectName} & repository ${repositoryName}. Initially configured to use custom build runner shape - running it may impose additional costs!`;
                        try {
                            logUtils.logInfo(`[deploy] Creating build pipeline for native executable of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                            const pipelineName = `${repositoryNamePrefix}${nibuildPipelineName}`;
                            folderData.nibuildPipeline = false;
                            folderData.nibuildPipeline = (await ociUtils.createBuildPipeline(provider, projectOCID, pipelineName, nibuildPipelineDescription, {
                                'gcn_tooling_deployID': deployData.tag,
                                'gcn_tooling_codeRepoID': codeRepository.id,
                                'gcn_tooling_codeRepoPrefix': repositoryNamePrefix
                            })).id;
                            if (!codeRepoResources.buildPipelines) {
                                codeRepoResources.buildPipelines = [];
                            }
                            codeRepoResources.buildPipelines.push({
                                ocid: folderData.nibuildPipeline,
                                originalName: pipelineName
                            });
                        } catch (err) {
                            resolve(dialogs.getErrorMessage(`Failed to create native executable pipeline for ${repositoryName}`, err));
                            folderData.nibuildPipeline = false;
                            dump(deployData);
                            return;
                        }
                        dump(deployData);
                    }
                    if (folderData.nibuildPipelineBuildStage) {
                        try {
                            const stage = await ociUtils.getBuildPipelineStage(provider, folderData.nibuildPipelineBuildStage);
                            if (!stage) {
                                folderData.nibuildPipelineBuildStage = undefined;
                            }
                        } catch (err) {
                            folderData.nibuildPipelineBuildStage = undefined;
                        }
                    }
                    if (folderData.nibuildPipelineBuildStage) {
                        logUtils.logInfo(`[deploy] Using already created build stage of build pipeline for native executable of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                    } else {
                        try {
                            logUtils.logInfo(`[deploy] Creating build stage of build pipeline for native executable of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                            folderData.nibuildPipelineBuildStage = false;
                            folderData.nibuildPipelineBuildStage = (await ociUtils.createBuildPipelineBuildStage(provider, folderData.nibuildPipeline, codeRepository.id, repositoryName, codeRepository.httpUrl, `.gcn/${nibuildspec_template}`, true, {
                                'gcn_tooling_deployID': deployData.tag
                            })).id;
                        } catch (err) {
                            resolve(dialogs.getErrorMessage(`Failed to create native executable pipeline build stage for ${repositoryName}`, err));
                            folderData.nibuildPipelineBuildStage = false;
                            dump(deployData);
                            return;
                        }
                        dump(deployData);
                    }
                    if (!bypassArtifacts) {
                        if (folderData.nibuildPipelineArtifactsStage) {
                            try {
                                const stage = await ociUtils.getBuildPipelineStage(provider, folderData.nibuildPipelineArtifactsStage);
                                if (!stage) {
                                    folderData.nibuildPipelineArtifactsStage = undefined;
                                }
                            } catch (err) {
                                folderData.nibuildPipelineArtifactsStage = undefined;
                            }
                        }
                        if (folderData.nibuildPipelineArtifactsStage) {
                            logUtils.logInfo(`[deploy] Using already created artifacts stage of build pipeline for native executable of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                        } else {
                            try {
                                logUtils.logInfo(`[deploy] Creating artifacts stage of build pipeline for native executable of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                folderData.nibuildPipelineArtifactsStage = false;
                                folderData.nibuildPipelineArtifactsStage = (await ociUtils.createBuildPipelineArtifactsStage(provider, folderData.nibuildPipeline, folderData.nibuildPipelineBuildStage, folderData.nibuildArtifact, nibuildArtifactName, {
                                    'gcn_tooling_deployID': deployData.tag
                                })).id;
                            } catch (err) {
                                resolve(dialogs.getErrorMessage(`Failed to create native executable pipeline artifacts stage for ${repositoryName}`, err));
                                folderData.nibuildPipelineArtifactsStage = false;
                                dump(deployData);
                                return;
                            }
                            dump(deployData);
                        }
                    }
                }

                if (deployData.okeClusterEnvironment) {
                    folderData.secretName = `${repositoryName.toLowerCase().replace(/[^0-9a-z]+/g, '-')}-vscode-generated-ocirsecret`;

                    // --- Create OKE deployment setup command spec
                    progress.report({
                        increment,
                        message: `Creating OKE deployment setup secret command spec for ${repositoryName}...`
                    });
                    const oke_deploy_setup_command_template = 'oke_docker_secret_setup.yaml';
                    const oke_deploySetupCommandInlineContent = expandTemplate(resourcesPath, oke_deploy_setup_command_template, {
                        repo_endpoint: `${provider.getRegion().regionCode}.ocir.io`,
                        region: provider.getRegion().regionId,
                        cluster_id: deployData.okeCluster,
                        secret_name: folderData.secretName
                    });
                    if (!oke_deploySetupCommandInlineContent) {
                        resolve(`Failed to create OKE deployment setup secret command spec for ${repositoryName}`);
                        return;
                    }
                    if (folderData.oke_deploySetupCommandArtifact) {
                        progress.report({
                            message: `Using already created OKE deployment setup secret command spec artifact for ${repositoryName}...`
                        });
                        try {
                            const artifact = await ociUtils.getDeployArtifact(provider, folderData.oke_deploySetupCommandArtifact);
                            if (!artifact) {
                                folderData.oke_deploySetupCommandArtifact = undefined;
                            }
                        } catch (err) {
                            folderData.oke_deploySetupCommandArtifact = undefined;
                        }
                    }
                    if (folderData.oke_deploySetupCommandArtifact) {
                        progress.report({
                            increment,
                        });
                        logUtils.logInfo(`[deploy] Using already created OKE deployment setup secret command spec artifact for ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                    } else {
                        // --- Create OKE deployment setup command spec artifact
                        progress.report({
                            increment,
                            message: `Creating OKE deployment setup secret command spec artifact for ${repositoryName}...`
                        });
                        const oke_deploySetupCommandArtifactName = `${repositoryName}_oke_deploy_docker_secret_setup_command`;
                        const oke_deploySetupCommandArtifactDescription = `OKE deployment setup secret command specification artifact for devops project ${projectName} & repository ${repositoryName}`;
                        try {
                            logUtils.logInfo(`[deploy] Creating OKE deployment setup secret command spec artifact for ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                            folderData.oke_deploySetupCommandArtifact = false;
                            folderData.oke_deploySetupCommandArtifact = (await ociUtils.createOkeDeploySetupCommandArtifact(provider, projectOCID, oke_deploySetupCommandInlineContent, oke_deploySetupCommandArtifactName, oke_deploySetupCommandArtifactDescription, {
                                'gcn_tooling_deployID': deployData.tag,
                                'gcn_tooling_codeRepoID': codeRepository.id,
                                'gcn_tooling_oke_cluster': deployData.okeCluster
                            })).id;
                            if (!codeRepoResources.artifacts) {
                                codeRepoResources.artifacts = [];
                            }
                            codeRepoResources.artifacts.push({
                                ocid: folderData.oke_deploySetupCommandArtifact,
                                originalName: oke_deploySetupCommandArtifactName
                            });
                        } catch (err) {
                            resolve(dialogs.getErrorMessage(`Failed to create OKE deployment setup secret command spec artifact for ${repositoryName}`, err));
                            folderData.oke_deploySetupCommandArtifact = false;
                            dump(deployData);
                            return;
                        }
                        dump(deployData);
                    }
                }

                if (folder.projectType === 'GCN') {
                    logUtils.logInfo(`[deploy] Recognized GCN project in ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                    for (const subName of projectUtils.getCloudSpecificSubProjectNames(folder)) {
                        if (subName !== 'lib' && subName !== 'app') {
                            if (!folderData.subs) {
                                folderData.subs = {} ;
                            }
                            let subData = folderData.subs[subName];
                            if (!subData) {
                                subData = folderData.subs[subName] = {};
                            }

                            logUtils.logInfo(`[deploy] Setting up GCN ${subName} project resources for ${deployData.compartment.name}/${projectName}/${repositoryName}`);

                            const project_native_executable_artifact_location = pathForTargetPlatform(await projectUtils.getProjectNativeExecutableArtifactLocation(folder, subName));
                            if (!project_native_executable_artifact_location) {
                                dialogs.showErrorMessage(`Failed to resolve native executable artifact for folder ${folder.uri.fsPath} & subproject ${subName}`);
                            }
                            const project_build_native_executable_command = await projectUtils.getProjectBuildNativeExecutableCommand(folder, subName);
                            if (!project_build_native_executable_command) {
                                dialogs.showErrorMessage(`Failed to resolve native executable build command for folder ${folder.uri.fsPath} & subproject ${subName}`);
                            }
                            if (project_native_executable_artifact_location && project_build_native_executable_command) {
                                let nativeContainerRepository;
                                if (subData.nativeContainerRepository) {
                                    progress.report({
                                        message: `Using already created native container repository for ${repositoryName}...`
                                    });
                                    try {
                                        nativeContainerRepository = await ociUtils.getContainerRepository(provider, subData.nativeContainerRepository);
                                        if (!nativeContainerRepository) {
                                            subData.nativeContainerRepository = undefined;
                                        }
                                    } catch (err) {
                                        subData.nativeContainerRepository = undefined;
                                    }
                                }
                                if (nativeContainerRepository) {
                                    progress.report({
                                        increment,
                                    });
                                    logUtils.logInfo(`[deploy] Using already created native container repository for ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                } else {
                                    // --- Create native container repository
                                    progress.report({
                                        increment,
                                        message: `Creating native container repository for ${repositoryName}...`
                                    });
                                    const containerRepositoryName = incrementalDeploy || folders.length > 1 ? `${projectName}-${repositoryName}-${subName}` : `${projectName}-${subName}`;
                                    try {
                                        logUtils.logInfo(`[deploy] Creating native container repository for ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                        subData.nativeContainerRepository = false;
                                        nativeContainerRepository = await ociUtils.createContainerRepository(provider, deployData.compartment.ocid, containerRepositoryName);
                                        subData.nativeContainerRepository = nativeContainerRepository.id;
                                        if (!codeRepoResources.containerRepositories) {
                                            codeRepoResources.containerRepositories = [];
                                        }
                                        codeRepoResources.containerRepositories.push({
                                            ocid: nativeContainerRepository.id,
                                            originalName: containerRepositoryName.toLowerCase()
                                        });
                                    } catch (err) {
                                        resolve(dialogs.getErrorMessage(`Failed to create native container repository ${containerRepositoryName}`, err));
                                        subData.nativeContainerRepository = false;
                                        dump(deployData);
                                        return;
                                    }
                                    dump(deployData);
                                }
    
                                // --- Generate docker native image build spec
                                progress.report({
                                    increment,
                                    message: `Creating ${subName} container image with native executable build spec for source code repository ${repositoryName}...`
                                });
                                const docker_nibuildspec_template = 'docker_nibuild_spec.yaml';
                                const docker_nibuildArtifactName = `${repositoryName}_${subName}_native_docker_image`;
                                logUtils.logInfo(`[deploy] Creating ${subName} container image with native executable build spec for ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                const docker_nibuildTemplate = expandTemplate(resourcesPath, docker_nibuildspec_template, {
                                    project_build_command: project_build_native_executable_command,
                                    project_artifact_location: project_native_executable_artifact_location,
                                    deploy_artifact_name: docker_nibuildArtifactName,
                                    image_name: nativeContainerRepository.displayName.toLowerCase()
                                }, folder, `${subName}_${docker_nibuildspec_template}`);
                                if (!docker_nibuildTemplate) {
                                    resolve(`Failed to configure ${subName} container image with native executable build spec for ${repositoryName}`);
                                    return;
                                }
                                if (subName === 'oci') {
                                    const docker_ni_file = 'Dockerfile.native';
                                    const docker_niFile = expandTemplate(resourcesPath, docker_ni_file, {}, folder);
                                    if (!docker_niFile) {
                                        resolve(`Failed to configure container image with native executable file for ${repositoryName}`);
                                        return;
                                    }
                                }

                                const docker_nibuildImage = `${provider.getRegion().regionCode}.ocir.io/${deployData.namespace}/${nativeContainerRepository.displayName}:\${DOCKER_TAG}`;
                                if (subData.docker_nibuildArtifact) {
                                    progress.report({
                                        message: `Using already created ${subName} container image with native executable artifact for ${repositoryName}...`
                                    });
                                    try {
                                        const artifact = await ociUtils.getDeployArtifact(provider, subData.docker_nibuildArtifact);
                                        if (!artifact) {
                                            subData.docker_nibuildArtifact = undefined;
                                        }
                                    } catch (err) {
                                        subData.docker_nibuildArtifact = undefined;
                                    }
                                }
                                if (subData.docker_nibuildArtifact) {
                                    progress.report({
                                        increment,
                                    });
                                    logUtils.logInfo(`[deploy] Using already created ${subName} container image with native executable artifact for ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                } else {
                                    // --- Create docker native image artifact
                                    progress.report({
                                        increment,
                                        message: `Creating ${subName} container image with native executable artifact for ${repositoryName}...`
                                    });
                                    const docker_nibuildArtifactDescription = `Container image with native executable artifact for ${subName.toUpperCase()} & devops project ${projectName} & repository ${repositoryName}`;
                                    try {
                                        logUtils.logInfo(`[deploy] Creating ${subName} container image with native executable artifact for ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                        subData.docker_nibuildArtifact = false;
                                        subData.docker_nibuildArtifact = (await ociUtils.createProjectDockerArtifact(provider, projectOCID, docker_nibuildImage, docker_nibuildArtifactName, docker_nibuildArtifactDescription, {
                                            'gcn_tooling_deployID': deployData.tag,
                                            'gcn_tooling_codeRepoID': codeRepository.id
                                        })).id;
                                        if (!codeRepoResources.artifacts) {
                                            codeRepoResources.artifacts = [];
                                        }
                                        codeRepoResources.artifacts.push({
                                            ocid: subData.docker_nibuildArtifact,
                                            originalName: docker_nibuildArtifactName
                                        });
                                    } catch (err) {
                                        resolve(dialogs.getErrorMessage(`Failed to create ${subName} container image with native executable artifact for ${repositoryName}`, err));
                                        subData.docker_nibuildArtifact = false;
                                        dump(deployData);
                                        return;
                                    }
                                    dump(deployData);
                                }

                                const docker_nibuildPipelineName = `Build ${subName.toUpperCase()} Container Image with Native Executable`;
                                if (subData.docker_nibuildPipeline) {
                                    progress.report({
                                        message: `Using already created build pipeline for ${subName} container image with native executable of ${repositoryName}...`
                                    });
                                    try {
                                        const pipeline = await ociUtils.getBuildPipeline(provider, subData.docker_nibuildPipeline);
                                        if (!pipeline) {
                                            subData.docker_nibuildPipeline = undefined;
                                        }
                                    } catch (err) {
                                        subData.docker_nibuildPipeline = undefined;
                                    }
                                }
                                if (subData.docker_nibuildPipeline) {
                                    progress.report({
                                        increment,
                                    });
                                    logUtils.logInfo(`[deploy] Using already created build pipeline for ${subName} container image with native executable of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                } else {
                                    // --- Create docker native image pipeline
                                    progress.report({
                                        increment,
                                        message: `Creating build pipeline for ${subName} container image with native executable of ${repositoryName}...`
                                    });
                                    const docker_nibuildPipelineDescription = `Build pipeline to build container image with native executable for ${subName.toUpperCase()} & devops project ${projectName} & repository ${repositoryName}. Initially configured to use custom build runner shape - running it may impose additional costs!`;
                                    try {
                                        logUtils.logInfo(`[deploy] Creating build pipeline for ${subName} container image with native executable of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                        const pipelineName = `${repositoryNamePrefix}${docker_nibuildPipelineName}`;
                                        subData.docker_nibuildPipeline = false;
                                        subData.docker_nibuildPipeline = (await ociUtils.createBuildPipeline(provider, projectOCID, pipelineName, docker_nibuildPipelineDescription, {
                                            'gcn_tooling_deployID': deployData.tag,
                                            'gcn_tooling_codeRepoID': codeRepository.id,
                                            'gcn_tooling_codeRepoPrefix': repositoryNamePrefix,
                                            'gcn_tooling_docker_image': subName.toLowerCase()
                                        })).id;
                                        if (!codeRepoResources.buildPipelines) {
                                            codeRepoResources.buildPipelines = [];
                                        }
                                        codeRepoResources.buildPipelines.push({
                                            ocid: subData.docker_nibuildPipeline,
                                            originalName: pipelineName,
                                            autoImport: ociFeatures.NI_PIPELINES_ENABLED && subName === 'oci' ? 'true' : undefined
                                        });
                                    } catch (err) {
                                        resolve(dialogs.getErrorMessage(`Failed to create ${subName} container image with native executable build pipeline for ${repositoryName}`, err));
                                        subData.docker_nibuildPipeline = false;
                                        dump(deployData);
                                        return;
                                    }
                                    dump(deployData);
                                }
                                if (subData.docker_nibuildPipelineBuildStage) {
                                    try {
                                        const stage = await ociUtils.getBuildPipelineStage(provider, subData.docker_nibuildPipelineBuildStage);
                                        if (!stage) {
                                            subData.docker_nibuildPipelineBuildStage = undefined;
                                        }
                                    } catch (err) {
                                        subData.docker_nibuildPipelineBuildStage = undefined;
                                    }
                                }
                                if (subData.docker_nibuildPipelineBuildStage) {
                                    logUtils.logInfo(`[deploy] Using already created build stage of build pipeline for ${subName} container image with native executable of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                } else {
                                    try {
                                        logUtils.logInfo(`[deploy] Creating build stage of build pipeline for ${subName} container image with native executable of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                        subData.docker_nibuildPipelineBuildStage = false;
                                        subData.docker_nibuildPipelineBuildStage = (await ociUtils.createBuildPipelineBuildStage(provider, subData.docker_nibuildPipeline, codeRepository.id, repositoryName, codeRepository.httpUrl, `.gcn/${subName}_${docker_nibuildspec_template}`, true, {
                                            'gcn_tooling_deployID': deployData.tag
                                        })).id;
                                    } catch (err) {
                                        resolve(dialogs.getErrorMessage(`Failed to create ${subName} container image with native executable pipeline build stage for ${repositoryName}`, err));
                                        subData.docker_nibuildPipelineBuildStage = false;
                                        dump(deployData);
                                        return;
                                    }
                                    dump(deployData);
                                }
                                if (subData.docker_nibuildPipelineArtifactsStage) {
                                    try {
                                        const stage = await ociUtils.getBuildPipelineStage(provider, subData.docker_nibuildPipelineArtifactsStage);
                                        if (!stage) {
                                            subData.docker_nibuildPipelineArtifactsStage = undefined;
                                        }
                                    } catch (err) {
                                        subData.docker_nibuildPipelineArtifactsStage = undefined;
                                    }
                                }
                                if (subData.docker_nibuildPipelineArtifactsStage) {
                                    logUtils.logInfo(`[deploy] Using already created artifacts stage of build pipeline for ${subName} container image with native executable of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                } else {
                                    try {
                                        logUtils.logInfo(`[deploy] Creating artifacts stage of build pipeline for ${subName} container image with native executable of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                        subData.docker_nibuildPipelineArtifactsStage = false;
                                        subData.docker_nibuildPipelineArtifactsStage = (await ociUtils.createBuildPipelineArtifactsStage(provider, subData.docker_nibuildPipeline, subData.docker_nibuildPipelineBuildStage, subData.docker_nibuildArtifact, docker_nibuildArtifactName, {
                                            'gcn_tooling_deployID': deployData.tag
                                        })).id;
                                    } catch (err) {
                                        resolve(dialogs.getErrorMessage(`Failed to create ${subName} container image with native executable pipeline artifacts stage for ${repositoryName}`, err));
                                        subData.docker_nibuildPipelineArtifactsStage = false;
                                        dump(deployData);
                                        return;
                                    }
                                    dump(deployData);
                                }

                                if (subName === 'oci') {
                                    if (ociFeatures.NI_PIPELINES_ENABLED) {
                                        buildPipelines.push({ 'ocid': subData.docker_nibuildPipeline, 'displayName': docker_nibuildPipelineName });
                                    }

                                    if (deployData.okeClusterEnvironment) {

                                        // --- Create OKE native deployment configuration spec
                                        progress.report({
                                            increment,
                                            message: `Creating OKE native deployment configuration spec for ${subName} of ${repositoryName}...`
                                        });
                                        const oke_deploy_native_config_template = 'oke_deploy_config.yaml';
                                        const oke_deployNativeConfigInlineContent = expandTemplate(resourcesPath, oke_deploy_native_config_template, {
                                            image_name: docker_nibuildImage,
                                            app_name: repositoryName.toLowerCase().replace(/[^0-9a-z]+/g, '-'),
                                            secret_name: folderData.secretName
                                        });
                                        if (!oke_deployNativeConfigInlineContent) {
                                            resolve(`Failed to create OKE native deployment configuration spec for ${subName} of ${repositoryName}`);
                                            return;
                                        }
                                        if (subData.oke_deployNativeConfigArtifact) {
                                            progress.report({
                                                message: `Using already created OKE native deployment configuration artifact for ${subName} of ${repositoryName}...`
                                            });
                                            try {
                                                const artifact = await ociUtils.getDeployArtifact(provider, subData.oke_deployNativeConfigArtifact);
                                                if (!artifact) {
                                                    subData.oke_deployNativeConfigArtifact = undefined;
                                                }
                                            } catch (err) {
                                                subData.oke_deployNativeConfigArtifact = undefined;
                                            }
                                        }
                                        if (subData.oke_deployNativeConfigArtifact) {
                                            progress.report({
                                                increment,
                                            });
                                            logUtils.logInfo(`[deploy] Using already created OKE native deployment configuration artifact for ${subName} of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                        } else {
                                            // --- Create OKE native deployment configuration artifact
                                            progress.report({
                                                increment,
                                                message: `Creating OKE native deployment configuration artifact for ${subName} of ${repositoryName}...`
                                            });
                                            const oke_deployNativeConfigArtifactName = `${repositoryName}_oke_deploy_ni_configuration`;
                                            const oke_deployNativeConfigArtifactDescription = `OKE native deployment configuration artifact for devops project ${projectName} & repository ${repositoryName}`;
                                            try {
                                                logUtils.logInfo(`[deploy] Creating OKE native deployment configuration artifact for ${subName} of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                                subData.oke_deployNativeConfigArtifact = false;
                                                subData.oke_deployNativeConfigArtifact = (await ociUtils.createOkeDeployConfigurationArtifact(provider, projectOCID, oke_deployNativeConfigInlineContent, oke_deployNativeConfigArtifactName, oke_deployNativeConfigArtifactDescription, {
                                                    'gcn_tooling_deployID': deployData.tag,
                                                    'gcn_tooling_codeRepoID': codeRepository.id,
                                                    'gcn_tooling_image_name': docker_nibuildImage
                                                })).id;
                                                if (!codeRepoResources.artifacts) {
                                                    codeRepoResources.artifacts = [];
                                                }
                                                codeRepoResources.artifacts.push({
                                                    ocid: subData.oke_deployNativeConfigArtifact,
                                                    originalName: oke_deployNativeConfigArtifactName
                                                });
                                            } catch (err) {
                                                resolve(dialogs.getErrorMessage(`Failed to create OKE native deployment configuration artifact for ${subName} of ${repositoryName}`, err));
                                                subData.oke_deployNativeConfigArtifact = false;
                                                dump(deployData);
                                                return;
                                            }
                                            dump(deployData);
                                        }

                                        const oke_deployNativePipelineName = `Deploy ${subName.toUpperCase()} Container with Native Executable to OKE`;
                                        if (subData.oke_deployNativePipeline) {
                                            progress.report({
                                                message: `Using already created deployment to OKE pipeline for ${subName} container image with native executable of ${repositoryName}...`
                                            });
                                            try {
                                                const pipeline = await ociUtils.getDeployPipeline(provider, subData.oke_deployNativePipeline);
                                                if (!pipeline) {
                                                    subData.oke_deployNativePipeline = undefined;
                                                }
                                            } catch (err) {
                                                subData.oke_deployNativePipeline = undefined;
                                            }
                                        }
                                        if (subData.oke_deployNativePipeline) {
                                            progress.report({
                                                increment,
                                            });
                                            logUtils.logInfo(`[deploy] Using already created deployment to OKE pipeline for ${subName} container image with native executable of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                        } else {
                                            // --- Create OKE native deployment pipeline
                                            progress.report({
                                                increment,
                                                message: `Creating deployment to OKE pipeline for ${subName} container image with native executable of ${repositoryName}...`
                                            });
                                            const oke_deployNativePipelineDescription = `Deployment pipeline to deploy container image with native executable for OCI & devops project ${projectName} & repository ${repositoryName} to OKE`;
                                            try {
                                                logUtils.logInfo(`[deploy] Creating deployment to OKE pipeline for ${subName} container image with native executable of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                                const pipelineName = `${repositoryNamePrefix}${oke_deployNativePipelineName}`;
                                                subData.oke_deployNativePipeline = false;
                                                subData.oke_deployNativePipeline = (await ociUtils.createDeployPipeline(provider, projectOCID, pipelineName, oke_deployNativePipelineDescription, [{
                                                    name: 'DOCKER_TAG',
                                                    defaultValue: 'latest'
                                                }], {
                                                    'gcn_tooling_deployID': deployData.tag,
                                                    'gcn_tooling_codeRepoID': codeRepository.id,
                                                    'gcn_tooling_codeRepoPrefix': repositoryNamePrefix,
                                                    'gcn_tooling_buildPipelineOCID': subData.docker_nibuildPipeline,
                                                    'gcn_tooling_okeDeploymentName': repositoryName.toLowerCase().replace(/[^0-9a-z]+/g, '-')
                                                })).id;
                                                if (!codeRepoResources.deploymentPipelines) {
                                                    codeRepoResources.deploymentPipelines = [];
                                                }
                                                codeRepoResources.deploymentPipelines.push({
                                                    ocid: subData.oke_deployNativePipeline,
                                                    originalName: pipelineName,
                                                    autoImport: ociFeatures.NI_PIPELINES_ENABLED ? 'true' : undefined
                                                });
                                            } catch (err) {
                                                resolve(dialogs.getErrorMessage(`Failed to create ${subName} container image with native executable deployment to OKE pipeline for ${repositoryName}`, err));
                                                subData.oke_deployNativePipeline = false;
                                                dump(deployData);
                                                return;
                                            }
                                            dump(deployData);
                                        }
                                        if (subData.setupSecretForDeployNativeStage) {
                                            try {
                                                const stage = await ociUtils.getDeployStage(provider, subData.setupSecretForDeployNativeStage);
                                                if (!stage) {
                                                    subData.setupSecretForDeployNativeStage = undefined;
                                                }
                                            } catch (err) {
                                                subData.setupSecretForDeployNativeStage = undefined;
                                            }
                                        }
                                        if (subData.setupSecretForDeployNativeStage) {
                                            logUtils.logInfo(`[deploy] Using already created setup secret stage of deployment to OKE pipeline for ${subName} container image with native executable of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                        } else {
                                            try {
                                                logUtils.logInfo(`[deploy] Creating setup secret stage of deployment to OKE pipeline for ${subName} container image with native executable of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                                subData.setupSecretForDeployNativeStage = false;
                                                subData.setupSecretForDeployNativeStage = (await ociUtils.createSetupKubernetesDockerSecretStage(provider, subData.oke_deployNativePipeline, folderData.oke_deploySetupCommandArtifact, deployData.subnetId, {
                                                    'gcn_tooling_deployID': deployData.tag
                                                })).id;
                                            } catch (err) {
                                                resolve(dialogs.getErrorMessage(`Failed to create ${subName} container image with native executable setup secret stage for ${repositoryName}`, err));
                                                subData.setupSecretForDeployNativeStage = false;
                                                dump(deployData);
                                                return;
                                            }
                                            dump(deployData);
                                        }
                                        if (subData.deployNativeToOkeStage) {
                                            try {
                                                const stage = await ociUtils.getDeployStage(provider, subData.deployNativeToOkeStage);
                                                if (!stage) {
                                                    subData.deployNativeToOkeStage = undefined;
                                                }
                                            } catch (err) {
                                                subData.deployNativeToOkeStage = undefined;
                                            }
                                        }
                                        if (subData.deployNativeToOkeStage) {
                                            logUtils.logInfo(`[deploy] Using already created deploy to OKE stage of deployment to OKE pipeline for ${subName} container image with native executable of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                        } else {
                                            try {
                                                logUtils.logInfo(`[deploy] Creating deploy to OKE stage of deployment to OKE pipeline for ${subName} container image with native executable of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                                subData.deployNativeToOkeStage = false;
                                                subData.deployNativeToOkeStage = (await ociUtils.createDeployToOkeStage(provider, subData.oke_deployNativePipeline, subData.setupSecretForDeployNativeStage, deployData.okeClusterEnvironment, subData.oke_deployNativeConfigArtifact, {
                                                    'gcn_tooling_deployID': deployData.tag
                                                })).id;
                                            } catch (err) {
                                                resolve(dialogs.getErrorMessage(`Failed to create ${subName} container image with native executable deployment to OKE stage for ${repositoryName}`, err));
                                                subData.deployNativeToOkeStage = false;
                                                dump(deployData);
                                                return;
                                            }
                                            dump(deployData);
                                        }
                                        if (ociFeatures.NI_PIPELINES_ENABLED) {
                                            deployPipelines.push({ 'ocid': subData.oke_deployNativePipeline, 'displayName': oke_deployNativePipelineName });
                                        }
                                    }
                                }
                            }

                            if (subName === 'oci') {
                                const project_devbuild_artifact_location = pathForTargetPlatform(await projectUtils.getProjectBuildArtifactLocation(folder, subName));
                                if (!project_devbuild_artifact_location) {
                                    dialogs.showErrorMessage(`Failed to resolve jvm image artifact for folder ${folder.uri.fsPath} & subproject ${subName}`);
                                }
                                const project_devbuild_command = await projectUtils.getProjectBuildCommand(folder, subName);
                                if (!project_devbuild_command) {
                                    dialogs.showErrorMessage(`Failed to resolve jvm image build command for folder ${folder.uri.fsPath} & subproject ${subName}`);
                                }
                                if (project_devbuild_artifact_location && project_devbuild_command) {
                                    let jvmContainerRepository;
                                    if (subData.jvmContainerRepository) {
                                        progress.report({
                                            message: `Using already created jvm container repository for ${repositoryName}...`
                                        });
                                        try {
                                            jvmContainerRepository = await ociUtils.getContainerRepository(provider, subData.jvmContainerRepository);
                                            if (!jvmContainerRepository) {
                                                subData.jvmContainerRepository = undefined;
                                            }
                                        } catch (err) {
                                            subData.jvmContainerRepository = undefined;
                                        }
                                    }
                                    if (jvmContainerRepository) {
                                        progress.report({
                                            increment,
                                        });
                                        logUtils.logInfo(`[deploy] Using already created jvm container repository for ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                    } else {
                                        // --- Create jvm container repository
                                        progress.report({
                                            increment,
                                            message: `Creating jvm container repository for ${repositoryName}...`
                                        });
                                        const containerRepositoryName = incrementalDeploy || folders.length > 1 ? `${projectName}-${repositoryName}-${subName}-jvm` : `${projectName}-${subName}-jvm`;
                                        try {
                                            logUtils.logInfo(`[deploy] Creating jvm container repository for ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                            subData.jvmContainerRepository = false;
                                            jvmContainerRepository = await ociUtils.createContainerRepository(provider, deployData.compartment.ocid, containerRepositoryName);
                                            subData.jvmContainerRepository = jvmContainerRepository.id;
                                            if (!codeRepoResources.containerRepositories) {
                                                codeRepoResources.containerRepositories = [];
                                            }
                                            codeRepoResources.containerRepositories.push({
                                                ocid: jvmContainerRepository.id,
                                                originalName: containerRepositoryName.toLowerCase()
                                            });
                                        } catch (err) {
                                            resolve(dialogs.getErrorMessage(`Failed to create jvm container repository ${containerRepositoryName}`, err));
                                            subData.jvmContainerRepository = false;
                                            dump(deployData);
                                            return;
                                        }
                                        dump(deployData);
                                    }

                                    // --- Generate docker jvm image build spec
                                    progress.report({
                                        increment,
                                        message: `Creating ${subName} container image with JVM build spec for source code repository ${repositoryName}...`
                                    });
                                    const docker_jvmbuildspec_template = 'docker_jvmbuild_spec.yaml';
                                    const docker_jvmbuildArtifactName = `${repositoryName}_${subName}_jvm_docker_image`;
                                    logUtils.logInfo(`[deploy] Creating ${subName} container image with JVM build spec for ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                    const docker_jvmbuildTemplate = expandTemplate(resourcesPath, docker_jvmbuildspec_template, {
                                        project_build_command: project_devbuild_command,
                                        project_artifact_location: project_devbuild_artifact_location,
                                        deploy_artifact_name: docker_jvmbuildArtifactName,
                                        image_name: jvmContainerRepository.displayName.toLowerCase()
                                    }, folder, `${subName}_${docker_jvmbuildspec_template}`);
                                    if (!docker_jvmbuildTemplate) {
                                        resolve(`Failed to configure ${subName} container image with JVM build spec for ${repositoryName}`);
                                        return;
                                    }
                                    const docker_jvm_file = 'Dockerfile.jvm';
                                    const docker_jvmFile = expandTemplate(resourcesPath, docker_jvm_file, {}, folder);
                                    if (!docker_jvmFile) {
                                        resolve(`Failed to configure container image with JVM file for ${repositoryName}`);
                                        return;
                                    }

                                    const docker_jvmbuildImage = `${provider.getRegion().regionCode}.ocir.io/${deployData.namespace}/${jvmContainerRepository.displayName}:\${DOCKER_TAG}`;
                                    if (subData.docker_jvmbuildArtifact) {
                                        progress.report({
                                            message: `Using already created ${subName} container image with JVM artifact for ${repositoryName}...`
                                        });
                                        try {
                                            const artifact = await ociUtils.getDeployArtifact(provider, subData.docker_jvmbuildArtifact);
                                            if (!artifact) {
                                                subData.docker_jvmbuildArtifact = undefined;
                                            }
                                        } catch (err) {
                                            subData.docker_jvmbuildArtifact = undefined;
                                        }
                                    }
                                    if (subData.docker_jvmbuildArtifact) {
                                        progress.report({
                                            increment,
                                        });
                                        logUtils.logInfo(`[deploy] Using already created ${subName} container image with JVM artifact for ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                    } else {
                                        // --- Create docker jvm image artifact
                                        progress.report({
                                            increment,
                                            message: `Creating ${subName} container image with JVM artifact for ${repositoryName}...`
                                        });
                                        const docker_jvmbuildArtifactDescription = `container image with JVM artifact for ${subName.toUpperCase()} & devops project ${projectName} & repository ${repositoryName}`;
                                        try {
                                            logUtils.logInfo(`[deploy] Creating ${subName} container image with JVM artifact for ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                            subData.docker_jvmbuildArtifact = false;
                                            subData.docker_jvmbuildArtifact = (await ociUtils.createProjectDockerArtifact(provider, projectOCID, docker_jvmbuildImage, docker_jvmbuildArtifactName, docker_jvmbuildArtifactDescription, {
                                                'gcn_tooling_deployID': deployData.tag,
                                                'gcn_tooling_codeRepoID': codeRepository.id
                                            })).id;
                                            if (!codeRepoResources.artifacts) {
                                                codeRepoResources.artifacts = [];
                                            }
                                            codeRepoResources.artifacts.push({
                                                ocid: subData.docker_jvmbuildArtifact,
                                                originalName: docker_jvmbuildArtifactName
                                            });
                                        } catch (err) {
                                            resolve(dialogs.getErrorMessage(`Failed to create ${subName} container image with JVM artifact for ${repositoryName}`, err));
                                            subData.docker_jvmbuildArtifact = false;
                                            dump(deployData);
                                            return;
                                        }
                                        dump(deployData);
                                    }

                                    const docker_jvmbuildPipelineName = `Build ${subName.toUpperCase()} Container Image with JVM`;
                                    if (subData.docker_jvmbuildPipeline) {
                                        progress.report({
                                            message: `Using already created build pipeline for ${subName} container image with JVM of ${repositoryName}...`
                                        });
                                        try {
                                            const pipeline = await ociUtils.getBuildPipeline(provider, subData.docker_jvmbuildPipeline);
                                            if (!pipeline) {
                                                subData.docker_jvmbuildPipeline = undefined;
                                            }
                                        } catch (err) {
                                            subData.docker_jvmbuildPipeline = undefined;
                                        }
                                    }
                                    if (subData.docker_jvmbuildPipeline) {
                                        progress.report({
                                            increment,
                                        });
                                        logUtils.logInfo(`[deploy] Using already created build pipeline for ${subName} container image with JVM of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                    } else {
                                        // --- Create docker jvm image pipeline
                                        progress.report({
                                            increment,
                                            message: `Creating build pipeline for ${subName} container image with JVM of ${repositoryName}...`
                                        });
                                        const docker_jvmbuildPipelineDescription = `Build pipeline to build container image with JVM for ${subName.toUpperCase()} & devops project ${projectName} & repository ${repositoryName}`;
                                        try {
                                            logUtils.logInfo(`[deploy] Creating build pipeline for ${subName} container image with JVM of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                            const pipelineName = `${repositoryNamePrefix}${docker_jvmbuildPipelineName}`;
                                            subData.docker_jvmbuildPipeline = false;
                                            subData.docker_jvmbuildPipeline = (await ociUtils.createBuildPipeline(provider, projectOCID, pipelineName, docker_jvmbuildPipelineDescription, {
                                                'gcn_tooling_deployID': deployData.tag,
                                                'gcn_tooling_codeRepoID': codeRepository.id,
                                                'gcn_tooling_codeRepoPrefix': repositoryNamePrefix,
                                                'gcn_tooling_docker_image': subName.toLowerCase()
                                            })).id;
                                            if (!codeRepoResources.buildPipelines) {
                                                codeRepoResources.buildPipelines = [];
                                            }
                                            codeRepoResources.buildPipelines.push({
                                                ocid: subData.docker_jvmbuildPipeline,
                                                originalName: pipelineName,
                                                autoImport: 'true'
                                            });
                                        } catch (err) {
                                            resolve(dialogs.getErrorMessage(`Failed to create ${subName} container image with JVM build pipeline for ${repositoryName}`, err));
                                            subData.docker_jvmbuildPipeline = false;
                                            dump(deployData);
                                            return;
                                        }
                                        dump(deployData);
                                    }
                                    if (subData.docker_jvmbuildPipelineBuildStage) {
                                        try {
                                            const stage = await ociUtils.getBuildPipelineStage(provider, subData.docker_jvmbuildPipelineBuildStage);
                                            if (!stage) {
                                                subData.docker_jvmbuildPipelineBuildStage = undefined;
                                            }
                                        } catch (err) {
                                            subData.docker_jvmbuildPipelineBuildStage = undefined;
                                        }
                                    }
                                    if (subData.docker_jvmbuildPipelineBuildStage) {
                                        logUtils.logInfo(`[deploy] Using already created build stage of build pipeline for ${subName} container image with JVM of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                    } else {
                                        try {
                                            logUtils.logInfo(`[deploy] Creating build stage of build pipeline for ${subName} container image with JVM of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                            subData.docker_jvmbuildPipelineBuildStage = false;
                                            subData.docker_jvmbuildPipelineBuildStage = (await ociUtils.createBuildPipelineBuildStage(provider, subData.docker_jvmbuildPipeline, codeRepository.id, repositoryName, codeRepository.httpUrl, `.gcn/${subName}_${docker_jvmbuildspec_template}`, false, {
                                                'gcn_tooling_deployID': deployData.tag
                                            })).id;
                                        } catch (err) {
                                            resolve(dialogs.getErrorMessage(`Failed to create ${subName} container image with JVM pipeline build stage for ${repositoryName}`, err));
                                            subData.docker_jvmbuildPipelineBuildStage = false;
                                            dump(deployData);
                                            return;
                                        }
                                        dump(deployData);
                                    }
                                    if (subData.docker_jvmbuildPipelineArtifactsStage) {
                                        try {
                                            const stage = await ociUtils.getBuildPipelineStage(provider, subData.docker_jvmbuildPipelineArtifactsStage);
                                            if (!stage) {
                                                subData.docker_jvmbuildPipelineArtifactsStage = undefined;
                                            }
                                        } catch (err) {
                                            subData.docker_jvmbuildPipelineArtifactsStage = undefined;
                                        }
                                    }
                                    if (subData.docker_jvmbuildPipelineArtifactsStage) {
                                        logUtils.logInfo(`[deploy] Using already created artifacts stage of build pipeline for ${subName} container image with JVM of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                    } else {
                                        try {
                                            logUtils.logInfo(`[deploy] Creating artifacts stage of build pipeline for ${subName} container image with JVM of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                            subData.docker_jvmbuildPipelineArtifactsStage = false;
                                            subData.docker_jvmbuildPipelineArtifactsStage = (await ociUtils.createBuildPipelineArtifactsStage(provider, subData.docker_jvmbuildPipeline, subData.docker_jvmbuildPipelineBuildStage, subData.docker_jvmbuildArtifact, docker_jvmbuildArtifactName, {
                                                'gcn_tooling_deployID': deployData.tag
                                            })).id;
                                        } catch (err) {
                                            resolve(dialogs.getErrorMessage(`Failed to create ${subName} container image with JVM pipeline artifacts stage for ${repositoryName}`, err));
                                            subData.docker_jvmbuildPipelineArtifactsStage = false;
                                            dump(deployData);
                                            return;
                                        }
                                        dump(deployData);
                                    }
                                    buildPipelines.push({ 'ocid': subData.docker_jvmbuildPipeline, 'displayName': docker_jvmbuildPipelineName });

                                    if (deployData.okeClusterEnvironment) {

                                        // --- Create OKE jvm deployment configuration spec
                                        progress.report({
                                            increment,
                                            message: `Creating OKE jvm deployment configuration spec for ${subName} of ${repositoryName}...`
                                        });
                                        const oke_deploy_jvm_config_template = 'oke_deploy_config.yaml';
                                        const oke_deployJvmConfigInlineContent = expandTemplate(resourcesPath, oke_deploy_jvm_config_template, {
                                            image_name: docker_jvmbuildImage,
                                            app_name: repositoryName.toLowerCase().replace(/[^0-9a-z]+/g, '-'),
                                            secret_name: folderData.secretName
                                        });
                                        if (!oke_deployJvmConfigInlineContent) {
                                            resolve(`Failed to create OKE jvm deployment configuration spec for ${subName} of ${repositoryName}`);
                                            return;
                                        }
                                        if (subData.oke_deployJvmConfigArtifact) {
                                            progress.report({
                                                message: `Using already created OKE jvm deployment configuration artifact for ${subName} of ${repositoryName}...`
                                            });
                                            try {
                                                const artifact = await ociUtils.getDeployArtifact(provider, subData.oke_deployJvmConfigArtifact);
                                                if (!artifact) {
                                                    subData.oke_deployJvmConfigArtifact = undefined;
                                                }
                                            } catch (err) {
                                                subData.oke_deployJvmConfigArtifact = undefined;
                                            }
                                        }
                                        if (subData.oke_deployJvmConfigArtifact) {
                                            progress.report({
                                                increment,
                                            });
                                            logUtils.logInfo(`[deploy] Using already created OKE jvm deployment configuration artifact for ${subName} of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                        } else {
                                            // --- Create OKE jvm deployment configuration artifact
                                            progress.report({
                                                increment,
                                                message: `Creating OKE jvm deployment configuration artifact for ${subName} of ${repositoryName}...`
                                            });
                                            const oke_deployJvmConfigArtifactName = `${repositoryName}_oke_deploy_jvm_configuration`;
                                            const oke_deployJvmConfigArtifactDescription = `OKE jvm deployment configuration artifact for devops project ${projectName} & repository ${repositoryName}`;
                                            try {
                                                logUtils.logInfo(`[deploy] Creating OKE jvm deployment configuration artifact for ${subName} of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                                subData.oke_deployJvmConfigArtifact = false;
                                                subData.oke_deployJvmConfigArtifact = (await ociUtils.createOkeDeployConfigurationArtifact(provider, projectOCID, oke_deployJvmConfigInlineContent, oke_deployJvmConfigArtifactName, oke_deployJvmConfigArtifactDescription, {
                                                    'gcn_tooling_deployID': deployData.tag,
                                                    'gcn_tooling_codeRepoID': codeRepository.id,
                                                    'gcn_tooling_image_name': docker_jvmbuildImage
                                                })).id;
                                                if (!codeRepoResources.artifacts) {
                                                    codeRepoResources.artifacts = [];
                                                }
                                                codeRepoResources.artifacts.push({
                                                    ocid: subData.oke_deployJvmConfigArtifact,
                                                    originalName: oke_deployJvmConfigArtifactName
                                                });
                                            } catch (err) {
                                                resolve(dialogs.getErrorMessage(`Failed to create OKE jvm deployment configuration artifact for ${subName} of ${repositoryName}`, err));
                                                subData.oke_deployJvmConfigArtifact = false;
                                                dump(deployData);
                                                return;
                                            }
                                            dump(deployData);
                                        }

                                        const oke_deployJvmPipelineName = `Deploy ${subName.toUpperCase()} Container with JVM to OKE`;
                                        if (subData.oke_deployJvmPipeline) {
                                            progress.report({
                                                message: `Using already created deployment to OKE pipeline for ${subName} container image with JVM of ${repositoryName}...`
                                            });
                                            try {
                                                const pipeline = await ociUtils.getDeployPipeline(provider, subData.oke_deployJvmPipeline);
                                                if (!pipeline) {
                                                    subData.oke_deployJvmPipeline = undefined;
                                                }
                                            } catch (err) {
                                                subData.oke_deployJvmPipeline = undefined;
                                            }
                                        }
                                        if (subData.oke_deployJvmPipeline) {
                                            progress.report({
                                                increment,
                                            });
                                            logUtils.logInfo(`[deploy] Using already created deployment to OKE pipeline for ${subName} container image with JVM of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                        } else {
                                            // --- Create OKE native deployment pipeline
                                            progress.report({
                                                increment,
                                                message: `Creating deployment to OKE pipeline for ${subName} container image with JVM of ${repositoryName}...`
                                            });
                                            const oke_deployJvmPipelineDescription = `Deployment pipeline to deploy container image with JVM for OCI & devops project ${projectName} & repository ${repositoryName} to OKE`;
                                            try {
                                                logUtils.logInfo(`[deploy] Creating deployment to OKE pipeline for ${subName} container image with JVM of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                                const pipelineName = `${repositoryNamePrefix}${oke_deployJvmPipelineName}`;
                                                subData.oke_deployJvmPipeline = false;
                                                subData.oke_deployJvmPipeline = (await ociUtils.createDeployPipeline(provider, projectOCID, pipelineName, oke_deployJvmPipelineDescription, [{
                                                    name: 'DOCKER_TAG',
                                                    defaultValue: 'latest'
                                                }], {
                                                    'gcn_tooling_deployID': deployData.tag,
                                                    'gcn_tooling_codeRepoID': codeRepository.id,
                                                    'gcn_tooling_codeRepoPrefix': repositoryNamePrefix,
                                                    'gcn_tooling_buildPipelineOCID': subData.docker_jvmbuildPipeline,
                                                    'gcn_tooling_okeDeploymentName': repositoryName.toLowerCase().replace(/[^0-9a-z]+/g, '-')
                                                })).id;
                                                if (!codeRepoResources.deploymentPipelines) {
                                                    codeRepoResources.deploymentPipelines = [];
                                                }
                                                codeRepoResources.deploymentPipelines.push({
                                                    ocid: subData.oke_deployJvmPipeline,
                                                    originalName: pipelineName,
                                                    autoImport: 'true'
                                                });
                                            } catch (err) {
                                                resolve(dialogs.getErrorMessage(`Failed to create ${subName} container image with JVM deployment to OKE pipeline for ${repositoryName}`, err));
                                                subData.oke_deployJvmPipeline = false;
                                                dump(deployData);
                                                return;
                                            }
                                            dump(deployData);
                                        }
                                        if (subData.setupSecretForDeployJvmStage) {
                                            try {
                                                const stage = await ociUtils.getDeployStage(provider, subData.setupSecretForDeployJvmStage);
                                                if (!stage) {
                                                    subData.setupSecretForDeployJvmStage = undefined;
                                                }
                                            } catch (err) {
                                                subData.setupSecretForDeployJvmStage = undefined;
                                            }
                                        }
                                        if (subData.setupSecretForDeployJvmStage) {
                                            logUtils.logInfo(`[deploy] Using already created setup secret stage of deployment to OKE pipeline for ${subName} container image with JVM of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                        } else {
                                            try {
                                                logUtils.logInfo(`[deploy] Creating setup secret stage of deployment to OKE pipeline for ${subName} container image with JVM of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                                subData.setupSecretForDeployJvmStage = false;
                                                subData.setupSecretForDeployJvmStage = (await ociUtils.createSetupKubernetesDockerSecretStage(provider, subData.oke_deployJvmPipeline, folderData.oke_deploySetupCommandArtifact, deployData.subnetId, {
                                                    'gcn_tooling_deployID': deployData.tag
                                                })).id;
                                            } catch (err) {
                                                resolve(dialogs.getErrorMessage(`Failed to create ${subName} container image with JVM setup secret stage for ${repositoryName}`, err));
                                                subData.setupSecretForDeployJvmStage = false;
                                                dump(deployData);
                                                return;
                                            }
                                            dump(deployData);
                                        }
                                        if (subData.deployJvmToOkeStage) {
                                            try {
                                                const stage = await ociUtils.getDeployStage(provider, subData.deployJvmToOkeStage);
                                                if (!stage) {
                                                    subData.deployJvmToOkeStage = undefined;
                                                }
                                            } catch (err) {
                                                subData.deployJvmToOkeStage = undefined;
                                            }
                                        }
                                        if (subData.deployJvmToOkeStage) {
                                            logUtils.logInfo(`[deploy] Using already created deploy to OKE stage of deployment to OKE pipeline for ${subName} container image with JVM of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                        } else {
                                            try {
                                                logUtils.logInfo(`[deploy] Creating deploy to OKE stage of deployment to OKE pipeline for ${subName} container image with JVM of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                                subData.deployJvmToOkeStage = false;
                                                subData.deployJvmToOkeStage = (await ociUtils.createDeployToOkeStage(provider, subData.oke_deployJvmPipeline, subData.setupSecretForDeployJvmStage, deployData.okeClusterEnvironment, subData.oke_deployJvmConfigArtifact, {
                                                    'gcn_tooling_deployID': deployData.tag
                                                })).id;
                                            } catch (err) {
                                                resolve(dialogs.getErrorMessage(`Failed to create ${subName} container image with JVM deployment to OKE stage for ${repositoryName}`, err));
                                                subData.deployJvmToOkeStage = false;
                                                dump(deployData);
                                                return;
                                            }
                                            dump(deployData);
                                        }
                                        deployPipelines.push({ 'ocid': subData.oke_deployJvmPipeline, 'displayName': oke_deployJvmPipelineName });
                                    }
                                }
                            }
                        }
                    }

                    // Add /bin folders created by EDT to .gitignore
                    gitUtils.addGitIgnoreEntry(folder.uri.fsPath, '**/bin');

                } else { // Micronaut, SpringBoot, other Java projects
                    logUtils.logInfo(`[deploy] ${folder.projectType !== 'Unknown' ? 'Recognized ' : ''}${folder.projectType} project in ${deployData.compartment.name}/${projectName}/${repositoryName}`);

                    if (project_native_executable_artifact_location && project_build_native_executable_command) {
                        let nativeContainerRepository;
                        if (folderData.nativeContainerRepository) {
                            progress.report({
                                message: `Using already created native container repository for ${repositoryName}...`
                            });
                            try {
                                nativeContainerRepository = await ociUtils.getContainerRepository(provider, folderData.nativeContainerRepository);
                                if (!nativeContainerRepository) {
                                    folderData.nativeContainerRepository = undefined;
                                }
                            } catch (err) {
                                folderData.nativeContainerRepository = undefined;
                            }
                        }
                        if (nativeContainerRepository) {
                            progress.report({
                                increment,
                            });
                            logUtils.logInfo(`[deploy] Using already created native container repository for ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                        } else {
                            // --- Create native container repository
                            progress.report({
                                increment,
                                message: `Creating native container repository for ${repositoryName}...`
                            });
                            const containerRepositoryName = incrementalDeploy || folders.length > 1 ? `${projectName}-${repositoryName}` : projectName;
                            try {
                                logUtils.logInfo(`[deploy] Creating native container repository for ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                folderData.nativeContainerRepository = false;
                                nativeContainerRepository = await ociUtils.createContainerRepository(provider, deployData.compartment.ocid, containerRepositoryName);
                                folderData.nativeContainerRepository = nativeContainerRepository.id;
                                if (!codeRepoResources.containerRepositories) {
                                    codeRepoResources.containerRepositories = [];
                                }
                                codeRepoResources.containerRepositories.push({
                                    ocid: nativeContainerRepository.id,
                                    originalName: containerRepositoryName.toLowerCase()
                                });
                            } catch (err) {
                                resolve(dialogs.getErrorMessage(`Failed to create native container repository ${containerRepositoryName}`, err));
                                folderData.nativeContainerRepository = false;
                                dump(deployData);
                                return;
                            }
                            dump(deployData);
                        }

                        // --- Generate docker native image build spec
                        progress.report({
                            increment,
                            message: `Creating container image with native executable build spec for source code repository ${repositoryName}...`
                        });
                        const docker_nibuildspec_template = 'docker_nibuild_spec.yaml';
                        const docker_nibuildArtifactName = `${repositoryName}_native_docker_image`;
                        logUtils.logInfo(`[deploy] Creating container image with native executable build spec for ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                        const docker_nibuildTemplate = expandTemplate(resourcesPath, docker_nibuildspec_template, {
                            project_build_command: project_build_native_executable_command,
                            project_artifact_location: project_native_executable_artifact_location,
                            deploy_artifact_name: docker_nibuildArtifactName,
                            image_name: nativeContainerRepository.displayName.toLowerCase()
                        }, folder);
                        if (!docker_nibuildTemplate) {
                            resolve(`Failed to configure container image with native executable build spec for ${repositoryName}`);
                            return;
                        }
                        const docker_ni_file = 'Dockerfile.native';
                        const docker_niFile = expandTemplate(resourcesPath, docker_ni_file, {}, folder);
                        if (!docker_niFile) {
                            resolve(`Failed to configure container image with native executable file for ${repositoryName}`);
                            return;
                        }

                        const docker_nibuildImage = `${provider.getRegion().regionCode}.ocir.io/${deployData.namespace}/${nativeContainerRepository.displayName}:\${DOCKER_TAG}`;
                        if (folderData.docker_nibuildArtifact) {
                            progress.report({
                                message: `Using already created container image with native executable artifact for ${repositoryName}...`
                            });
                            try {
                                const artifact = await ociUtils.getDeployArtifact(provider, folderData.docker_nibuildArtifact);
                                if (!artifact) {
                                    folderData.docker_nibuildArtifact = undefined;
                                }
                            } catch (err) {
                                folderData.docker_nibuildArtifact = undefined;
                            }
                        }
                        if (folderData.docker_nibuildArtifact) {
                            progress.report({
                                increment,
                            });
                            logUtils.logInfo(`[deploy] Using already created container image with native executable artifact for ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                        } else {
                            // --- Create docker native image artifact
                            progress.report({
                                increment,
                                message: `Creating container image with native executable artifact for ${repositoryName}...`
                            });
                            const docker_nibuildArtifactDescription = `Container image with native executable artifact for devops project ${projectName} & repository ${repositoryName}`;
                            try {
                                logUtils.logInfo(`[deploy] Creating container image with native executable artifact for ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                folderData.docker_nibuildArtifact = false;
                                folderData.docker_nibuildArtifact = (await ociUtils.createProjectDockerArtifact(provider, projectOCID, docker_nibuildImage, docker_nibuildArtifactName, docker_nibuildArtifactDescription, {
                                    'gcn_tooling_deployID': deployData.tag,
                                    'gcn_tooling_codeRepoID': codeRepository.id
                                })).id;
                                if (!codeRepoResources.artifacts) {
                                    codeRepoResources.artifacts = [];
                                }
                                codeRepoResources.artifacts.push({
                                    ocid: folderData.docker_nibuildArtifact,
                                    originalName: docker_nibuildArtifactName
                                });
                            } catch (err) {
                                resolve(dialogs.getErrorMessage(`Failed to create container image with native executable artifact for ${repositoryName}`, err));
                                folderData.docker_nibuildArtifact = false;
                                dump(deployData);
                                return;
                            }
                            dump(deployData);
                        }

                        const docker_nibuildPipelineName = 'Build Container Image with Native Executable';
                        if (folderData.docker_nibuildPipeline) {
                            progress.report({
                                message: `Using already created build pipeline for container image with native executable of ${repositoryName}...`
                            });
                            try {
                                const pipeline = await ociUtils.getBuildPipeline(provider, folderData.docker_nibuildPipeline);
                                if (!pipeline) {
                                    folderData.docker_nibuildPipeline = undefined;
                                }
                            } catch (err) {
                                folderData.docker_nibuildPipeline = undefined;
                            }
                        }
                        if (folderData.docker_nibuildPipeline) {
                            progress.report({
                                increment,
                            });
                            logUtils.logInfo(`[deploy] Using already created build pipeline for container image with native executable of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                        } else {
                            // --- Create docker native image pipeline
                            progress.report({
                                increment,
                                message: `Creating build pipeline for container image with native executable of ${repositoryName}...`
                            });
                            const docker_nibuildPipelineDescription = `Build pipeline to build container image with native executable for devops project ${projectName} & repository ${repositoryName}. Initially configured to use custom build runner shape - running it may impose additional costs!`;
                            try {
                                logUtils.logInfo(`[deploy] Creating build pipeline for container image with native executable of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                const pipelineName = `${repositoryNamePrefix}${docker_nibuildPipelineName}`;
                                folderData.docker_nibuildPipeline = false;
                                folderData.docker_nibuildPipeline = (await ociUtils.createBuildPipeline(provider, projectOCID, pipelineName, docker_nibuildPipelineDescription, {
                                    'gcn_tooling_deployID': deployData.tag,
                                    'gcn_tooling_codeRepoID': codeRepository.id,
                                    'gcn_tooling_codeRepoPrefix': repositoryNamePrefix,
                                    'gcn_tooling_docker_image': 'oci'
                                })).id;
                                if (!codeRepoResources.buildPipelines) {
                                    codeRepoResources.buildPipelines = [];
                                }
                                codeRepoResources.buildPipelines.push({
                                    ocid: folderData.docker_nibuildPipeline,
                                    originalName: pipelineName,
                                    autoImport: ociFeatures.NI_PIPELINES_ENABLED ? 'true' : undefined
                                });
                            } catch (err) {
                                resolve(dialogs.getErrorMessage(`Failed to create container image with native executable build pipeline for ${repositoryName}`, err));
                                folderData.docker_nibuildPipeline = false;
                                dump(deployData);
                                return;
                            }
                            dump(deployData);
                        }
                        if (folderData.docker_nibuildPipelineBuildStage) {
                            try {
                                const stage = await ociUtils.getBuildPipelineStage(provider, folderData.docker_nibuildPipelineBuildStage);
                                if (!stage) {
                                    folderData.docker_nibuildPipelineBuildStage = undefined;
                                }
                            } catch (err) {
                                folderData.docker_nibuildPipelineBuildStage = undefined;
                            }
                        }
                        if (folderData.docker_nibuildPipelineBuildStage) {
                            logUtils.logInfo(`[deploy] Using already created build stage of build pipeline for container image with native executable of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                        } else {
                            try {
                                logUtils.logInfo(`[deploy] Creating build stage of build pipeline for container image with native executable of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                folderData.docker_nibuildPipelineBuildStage = false;
                                folderData.docker_nibuildPipelineBuildStage = (await ociUtils.createBuildPipelineBuildStage(provider, folderData.docker_nibuildPipeline, codeRepository.id, repositoryName, codeRepository.httpUrl, `.gcn/${docker_nibuildspec_template}`, true, {
                                    'gcn_tooling_deployID': deployData.tag
                                })).id;
                            } catch (err) {
                                resolve(dialogs.getErrorMessage(`Failed to create container image with native executable pipeline build stage for ${repositoryName}`, err));
                                folderData.docker_nibuildPipelineBuildStage = false;
                                dump(deployData);
                                return;
                            }
                            dump(deployData);
                        }
                        if (folderData.docker_nibuildPipelineArtifactsStage) {
                            try {
                                const stage = await ociUtils.getBuildPipelineStage(provider, folderData.docker_nibuildPipelineArtifactsStage);
                                if (!stage) {
                                    folderData.docker_nibuildPipelineArtifactsStage = undefined;
                                }
                            } catch (err) {
                                folderData.docker_nibuildPipelineArtifactsStage = undefined;
                            }
                        }
                        if (folderData.docker_nibuildPipelineArtifactsStage) {
                            logUtils.logInfo(`[deploy] Using already created artifacts stage of build pipeline for container image with native executable of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                        } else {
                            try {
                                logUtils.logInfo(`[deploy] Creating artifacts stage of build pipeline for container image with native executable of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                folderData.docker_nibuildPipelineArtifactsStage = false;
                                folderData.docker_nibuildPipelineArtifactsStage = (await ociUtils.createBuildPipelineArtifactsStage(provider, folderData.docker_nibuildPipeline, folderData.docker_nibuildPipelineBuildStage, folderData.docker_nibuildArtifact, docker_nibuildArtifactName, {
                                    'gcn_tooling_deployID': deployData.tag
                                })).id;
                            } catch (err) {
                                resolve(dialogs.getErrorMessage(`Failed to create container image with native executable pipeline artifacts stage for ${repositoryName}`, err));
                                folderData.docker_nibuildPipelineArtifactsStage = false;
                                dump(deployData);
                                return;
                            }
                            dump(deployData);
                        }
                        if (ociFeatures.NI_PIPELINES_ENABLED) {
                            buildPipelines.push({ 'ocid': folderData.docker_nibuildPipeline, 'displayName': docker_nibuildPipelineName });
                        }

                        if (deployData.okeClusterEnvironment) {

                            // --- Create OKE native deployment configuration spec
                            progress.report({
                                increment,
                                message: `Creating OKE native deployment configuration spec for ${repositoryName}...`
                            });
                            const oke_deploy_native_config_template = 'oke_deploy_config.yaml';
                            const oke_deployNativeConfigInlineContent = expandTemplate(resourcesPath, oke_deploy_native_config_template, {
                                image_name: docker_nibuildImage,
                                app_name: repositoryName.toLowerCase().replace(/[^0-9a-z]+/g, '-'),
                                secret_name: folderData.secretName
                            });
                            if (!oke_deployNativeConfigInlineContent) {
                                resolve(`Failed to create OKE native deployment configuration spec for ${repositoryName}`);
                                return;
                            }
                            if (folderData.oke_deployNativeConfigArtifact) {
                                progress.report({
                                    message: `Using already created OKE native deployment configuration artifact for ${repositoryName}...`
                                });
                                try {
                                    const artifact = await ociUtils.getDeployArtifact(provider, folderData.oke_deployNativeConfigArtifact);
                                    if (!artifact) {
                                        folderData.oke_deployNativeConfigArtifact = undefined;
                                    }
                                } catch (err) {
                                    folderData.oke_deployNativeConfigArtifact = undefined;
                                }
                            }
                            if (folderData.oke_deployNativeConfigArtifact) {
                                progress.report({
                                    increment,
                                });
                                logUtils.logInfo(`[deploy] Using already created OKE native deployment configuration artifact for ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                            } else {
                                // --- Create OKE native deployment configuration artifact
                                progress.report({
                                    increment,
                                    message: `Creating OKE native deployment configuration artifact for ${repositoryName}...`
                                });
                                const oke_deployNativeConfigArtifactName = `${repositoryName}_oke_deploy_ni_configuration`;
                                const oke_deployNativeConfigArtifactDescription = `OKE native deployment configuration artifact for devops project ${projectName} & repository ${repositoryName}`;
                                try {
                                    logUtils.logInfo(`[deploy] Creating OKE native deployment configuration artifact for ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                    folderData.oke_deployNativeConfigArtifact = false;
                                    folderData.oke_deployNativeConfigArtifact = (await ociUtils.createOkeDeployConfigurationArtifact(provider, projectOCID, oke_deployNativeConfigInlineContent, oke_deployNativeConfigArtifactName, oke_deployNativeConfigArtifactDescription, {
                                        'gcn_tooling_deployID': deployData.tag,
                                        'gcn_tooling_codeRepoID': codeRepository.id,
                                        'gcn_tooling_image_name': docker_nibuildImage
                                    })).id;
                                    if (!codeRepoResources.artifacts) {
                                        codeRepoResources.artifacts = [];
                                    }
                                    codeRepoResources.artifacts.push({
                                        ocid: folderData.oke_deployNativeConfigArtifact,
                                        originalName: oke_deployNativeConfigArtifactName
                                    });
                                } catch (err) {
                                    resolve(dialogs.getErrorMessage(`Failed to create OKE native deployment configuration artifact for ${repositoryName}`, err));
                                    folderData.oke_deployNativeConfigArtifact = false;
                                    dump(deployData);
                                    return;
                                }
                                dump(deployData);
                            }

                            const oke_deployNativePipelineName = 'Deploy Container with Native Executable to OKE';
                            if (folderData.oke_deployNativePipeline) {
                                progress.report({
                                    message: `Using already created deployment to OKE pipeline for container image with native executable of ${repositoryName}...`
                                });
                                try {
                                    const pipeline = await ociUtils.getDeployPipeline(provider, folderData.oke_deployNativePipeline);
                                    if (!pipeline) {
                                        folderData.oke_deployNativePipeline = undefined;
                                    }
                                } catch (err) {
                                    folderData.oke_deployNativePipeline = undefined;
                                }
                            }
                            if (folderData.oke_deployNativePipeline) {
                                progress.report({
                                    increment,
                                });
                                logUtils.logInfo(`[deploy] Using already created deployment to OKE pipeline for container image with native executable of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                            } else {
                                // --- Create OKE native deployment pipeline
                                progress.report({
                                    increment,
                                    message: `Creating deployment to OKE pipeline for container image with native executable of ${repositoryName}...`
                                });
                                const oke_deployNativePipelineDescription = `Deployment pipeline to deploy container image with native executable for devops project ${projectName} & repository ${repositoryName} to OKE`;
                                try {
                                    logUtils.logInfo(`[deploy] Creating deployment to OKE pipeline for container image with native executable of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                    const pipelineName = `${repositoryNamePrefix}${oke_deployNativePipelineName}`;
                                    folderData.oke_deployNativePipeline = false;
                                    folderData.oke_deployNativePipeline = (await ociUtils.createDeployPipeline(provider, projectOCID, pipelineName, oke_deployNativePipelineDescription, [{
                                        name: 'DOCKER_TAG',
                                        defaultValue: 'latest'
                                    }], {
                                        'gcn_tooling_deployID': deployData.tag,
                                        'gcn_tooling_codeRepoID': codeRepository.id,
                                        'gcn_tooling_codeRepoPrefix': repositoryNamePrefix,
                                        'gcn_tooling_buildPipelineOCID': folderData.docker_nibuildPipeline,
                                        'gcn_tooling_okeDeploymentName': repositoryName.toLowerCase().replace(/[^0-9a-z]+/g, '-')
                                    })).id;
                                    if (!codeRepoResources.deploymentPipelines) {
                                        codeRepoResources.deploymentPipelines = [];
                                    }
                                    codeRepoResources.deploymentPipelines.push({
                                        ocid: folderData.oke_deployNativePipeline,
                                        originalName: pipelineName,
                                        autoImport: ociFeatures.NI_PIPELINES_ENABLED ? 'true' : undefined
                                    });
                                } catch (err) {
                                    resolve(dialogs.getErrorMessage(`Failed to create container image with native executable deployment to OKE pipeline for ${repositoryName}`, err));
                                    folderData.oke_deployNativePipeline = false;
                                    dump(deployData);
                                    return;
                                }
                                dump(deployData);
                            }
                            if (folderData.setupSecretForDeployNativeStage) {
                                try {
                                    const stage = await ociUtils.getDeployStage(provider, folderData.setupSecretForDeployNativeStage);
                                    if (!stage) {
                                        folderData.setupSecretForDeployNativeStage = undefined;
                                    }
                                } catch (err) {
                                    folderData.setupSecretForDeployNativeStage = undefined;
                                }
                            }
                            if (folderData.setupSecretForDeployNativeStage) {
                                logUtils.logInfo(`[deploy] Using already created setup secret stage of deployment to OKE pipeline for container image with native executable of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                            } else {
                                try {
                                    logUtils.logInfo(`[deploy] Creating setup secret stage of deployment to OKE pipeline for container image with native executable of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                    folderData.setupSecretForDeployNativeStage = false;
                                    folderData.setupSecretForDeployNativeStage = (await ociUtils.createSetupKubernetesDockerSecretStage(provider, folderData.oke_deployNativePipeline, folderData.oke_deploySetupCommandArtifact, deployData.subnetId, {
                                        'gcn_tooling_deployID': deployData.tag
                                    })).id;
                                } catch (err) {
                                    resolve(dialogs.getErrorMessage(`Failed to create container image with native executable setup secret stage for ${repositoryName}`, err));
                                    folderData.setupSecretForDeployNativeStage = false;
                                    dump(deployData);
                                    return;
                                }
                                dump(deployData);
                            }
                            if (folderData.deployNativeToOkeStage) {
                                try {
                                    const stage = await ociUtils.getDeployStage(provider, folderData.deployNativeToOkeStage);
                                    if (!stage) {
                                        folderData.deployNativeToOkeStage = undefined;
                                    }
                                } catch (err) {
                                    folderData.deployNativeToOkeStage = undefined;
                                }
                            }
                            if (folderData.deployNativeToOkeStage) {
                                logUtils.logInfo(`[deploy] Using already created deploy to OKE stage of deployment to OKE pipeline for container image with native executable of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                            } else {
                                try {
                                    logUtils.logInfo(`[deploy] Creating deploy to OKE stage of deployment to OKE pipeline for container image with native executable of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                    folderData.deployNativeToOkeStage = false;
                                    folderData.deployNativeToOkeStage = (await ociUtils.createDeployToOkeStage(provider, folderData.oke_deployNativePipeline, folderData.setupSecretForDeployNativeStage, deployData.okeClusterEnvironment, folderData.oke_deployNativeConfigArtifact, {
                                        'gcn_tooling_deployID': deployData.tag
                                    })).id;
                                } catch (err) {
                                    resolve(dialogs.getErrorMessage(`Failed to create container image with native executable deployment to OKE stage for ${repositoryName}`, err));
                                    folderData.deployNativeToOkeStage = false;
                                    dump(deployData);
                                    return;
                                }
                                dump(deployData);
                            }
                            if (ociFeatures.NI_PIPELINES_ENABLED) {
                                deployPipelines.push({ 'ocid': folderData.oke_deployNativePipeline, 'displayName': oke_deployNativePipelineName });
                            }
                        }
                    }

                    if (project_devbuild_artifact_location && project_devbuild_command) {
                        let jvmContainerRepository;
                        if (folderData.jvmContainerRepository) {
                            progress.report({
                                message: `Using already created jvm container repository for ${repositoryName}...`
                            });
                            try {
                                jvmContainerRepository = await ociUtils.getContainerRepository(provider, folderData.jvmContainerRepository);
                                if (!jvmContainerRepository) {
                                    folderData.jvmContainerRepository = undefined;
                                }
                            } catch (err) {
                                folderData.jvmContainerRepository = undefined;
                            }
                        }
                        if (jvmContainerRepository) {
                            progress.report({
                                increment,
                            });
                            logUtils.logInfo(`[deploy] Using already created jvm container repository for ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                        } else {
                            // --- Create jvm container repository
                            progress.report({
                                increment,
                                message: `Creating jvm container repository for ${repositoryName}...`
                            });
                            const containerRepositoryName = incrementalDeploy || folders.length > 1 ? `${projectName}-${repositoryName}-jvm` : `${projectName}-jvm`;
                            try {
                                logUtils.logInfo(`[deploy] Creating jvm container repository for ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                folderData.jvmContainerRepository = false;
                                jvmContainerRepository = await ociUtils.createContainerRepository(provider, deployData.compartment.ocid, containerRepositoryName);
                                folderData.jvmContainerRepository = jvmContainerRepository.id;
                                if (!codeRepoResources.containerRepositories) {
                                    codeRepoResources.containerRepositories = [];
                                }
                                codeRepoResources.containerRepositories.push({
                                    ocid: jvmContainerRepository.id,
                                    originalName: containerRepositoryName.toLowerCase()
                                });
                            } catch (err) {
                                resolve(dialogs.getErrorMessage(`Failed to create jvm container repository ${containerRepositoryName}`, err));
                                folderData.jvmContainerRepository = false;
                                dump(deployData);
                                return;
                            }
                            dump(deployData);
                        }

                        // --- Generate docker jvm image build spec
                        progress.report({
                            increment,
                            message: `Creating container image with JVM build build spec for source code repository ${repositoryName}...`
                        });
                        const docker_jvmbuildspec_template = 'docker_jvmbuild_spec.yaml';
                        const docker_jvmbuildArtifactName = `${repositoryName}_jvm_docker_image`;
                        logUtils.logInfo(`[deploy] Creating container image with JVM build spec for ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                        const docker_jvmbuildTemplate = expandTemplate(resourcesPath, docker_jvmbuildspec_template, {
                            project_build_command: project_devbuild_command,
                            project_artifact_location: project_devbuild_artifact_location,
                            deploy_artifact_name: docker_jvmbuildArtifactName,
                            image_name: jvmContainerRepository.displayName.toLowerCase()
                        }, folder);
                        if (!docker_jvmbuildTemplate) {
                            resolve(`Failed to configure container image with JVM build spec for ${repositoryName}`);
                            return;
                        }
                        const docker_jvm_file = 'Dockerfile.jvm';
                        const docker_jvmFile = expandTemplate(resourcesPath, docker_jvm_file, {}, folder);
                        if (!docker_jvmFile) {
                            resolve(`Failed to configure container image with JVM file for ${repositoryName}`);
                            return;
                        }

                        const docker_jvmbuildImage = `${provider.getRegion().regionCode}.ocir.io/${deployData.namespace}/${jvmContainerRepository.displayName}:\${DOCKER_TAG}`;
                        if (folderData.docker_jvmbuildArtifact) {
                            progress.report({
                                message: `Using already created container image with JVM artifact for ${repositoryName}...`
                            });
                            try {
                                const artifact = await ociUtils.getDeployArtifact(provider, folderData.docker_jvmbuildArtifact);
                                if (!artifact) {
                                    folderData.docker_jvmbuildArtifact = undefined;
                                }
                            } catch (err) {
                                folderData.docker_jvmbuildArtifact = undefined;
                            }
                        }
                        if (folderData.docker_jvmbuildArtifact) {
                            progress.report({
                                increment,
                            });
                            logUtils.logInfo(`[deploy] Using already created container image with JVM artifact for ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                        } else {
                            // --- Create docker jvm image artifact
                            progress.report({
                                increment,
                                message: `Creating container image with JVM artifact for ${repositoryName}...`
                            });
                            const docker_jvmbuildArtifactDescription = `Container image with JVM artifact for devops project ${projectName} & repository ${repositoryName}`;
                            try {
                                logUtils.logInfo(`[deploy] Creating container image with JVM artifact for ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                folderData.docker_jvmbuildArtifact = false;
                                folderData.docker_jvmbuildArtifact = (await ociUtils.createProjectDockerArtifact(provider, projectOCID, docker_jvmbuildImage, docker_jvmbuildArtifactName, docker_jvmbuildArtifactDescription, {
                                    'gcn_tooling_deployID': deployData.tag,
                                    'gcn_tooling_codeRepoID': codeRepository.id
                                })).id;
                                if (!codeRepoResources.artifacts) {
                                    codeRepoResources.artifacts = [];
                                }
                                codeRepoResources.artifacts.push({
                                    ocid: folderData.docker_jvmbuildArtifact,
                                    originalName: docker_jvmbuildArtifactName
                                });
                            } catch (err) {
                                resolve(dialogs.getErrorMessage(`Failed to create container image with JVM artifact for ${repositoryName}`, err));
                                folderData.docker_jvmbuildArtifact = false;
                                dump(deployData);
                                return;
                            }
                            dump(deployData);
                        }

                        const docker_jvmbuildPipelineName = 'Build Container Image with JVM';
                        if (folderData.docker_jvmbuildPipeline) {
                            progress.report({
                                message: `Using already created build pipeline for container image with JVM of ${repositoryName}...`
                            });
                            try {
                                const pipeline = await ociUtils.getBuildPipeline(provider, folderData.docker_jvmbuildPipeline);
                                if (!pipeline) {
                                    folderData.docker_jvmbuildPipeline = undefined;
                                }
                            } catch (err) {
                                folderData.docker_jvmbuildPipeline = undefined;
                            }
                        }
                        if (folderData.docker_jvmbuildPipeline) {
                            progress.report({
                                increment,
                            });
                            logUtils.logInfo(`[deploy] Using already created build pipeline for container image with JVM of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                        } else {
                            // --- Create docker jvm image pipeline
                            progress.report({
                                increment,
                                message: `Creating build pipeline for container image with JVM of ${repositoryName}...`
                            });
                            const docker_jvmbuildPipelineDescription = `Build pipeline to build container image with JVM for devops project ${projectName} & repository ${repositoryName}`;
                            try {
                                logUtils.logInfo(`[deploy] Creating build pipeline for container image with JVM of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                const pipelineName = `${repositoryNamePrefix}${docker_jvmbuildPipelineName}`;
                                folderData.docker_jvmbuildPipeline = false;
                                folderData.docker_jvmbuildPipeline = (await ociUtils.createBuildPipeline(provider, projectOCID, pipelineName, docker_jvmbuildPipelineDescription, {
                                    'gcn_tooling_deployID': deployData.tag,
                                    'gcn_tooling_codeRepoID': codeRepository.id,
                                    'gcn_tooling_codeRepoPrefix': repositoryNamePrefix,
                                    'gcn_tooling_docker_image': 'oci'
                                })).id;
                                if (!codeRepoResources.buildPipelines) {
                                    codeRepoResources.buildPipelines = [];
                                }
                                codeRepoResources.buildPipelines.push({
                                    ocid: folderData.docker_jvmbuildPipeline,
                                    originalName: pipelineName,
                                    autoImport: 'true'
                                });
                            } catch (err) {
                                resolve(dialogs.getErrorMessage(`Failed to create container image with JVM build pipeline for ${repositoryName}`, err));
                                folderData.docker_jvmbuildPipeline = false;
                                dump(deployData);
                                return;
                            }
                            dump(deployData);
                        }
                        if (folderData.docker_jvmbuildPipelineBuildStage) {
                            try {
                                const stage = await ociUtils.getBuildPipelineStage(provider, folderData.docker_jvmbuildPipelineBuildStage);
                                if (!stage) {
                                    folderData.docker_jvmbuildPipelineBuildStage = undefined;
                                }
                            } catch (err) {
                                folderData.docker_jvmbuildPipelineBuildStage = undefined;
                            }
                        }
                        if (folderData.docker_jvmbuildPipelineBuildStage) {
                            logUtils.logInfo(`[deploy] Using already created build stage of build pipeline for container image with JVM of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                        } else {
                            try {
                                logUtils.logInfo(`[deploy] Creating build stage of build pipeline for container image with JVM of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                folderData.docker_jvmbuildPipelineBuildStage = false;
                                folderData.docker_jvmbuildPipelineBuildStage = (await ociUtils.createBuildPipelineBuildStage(provider, folderData.docker_jvmbuildPipeline, codeRepository.id, repositoryName, codeRepository.httpUrl, `.gcn/${docker_jvmbuildspec_template}`, false, {
                                    'gcn_tooling_deployID': deployData.tag
                                })).id;
                            } catch (err) {
                                resolve(dialogs.getErrorMessage(`Failed to create container image with JVM pipeline build stage for ${repositoryName}`, err));
                                folderData.docker_jvmbuildPipelineBuildStage = false;
                                dump(deployData);
                                return;
                            }
                            dump(deployData);
                        }
                        if (folderData.docker_jvmbuildPipelineArtifactsStage) {
                            try {
                                const stage = await ociUtils.getBuildPipelineStage(provider, folderData.docker_jvmbuildPipelineArtifactsStage);
                                if (!stage) {
                                    folderData.docker_jvmbuildPipelineArtifactsStage = undefined;
                                }
                            } catch (err) {
                                folderData.docker_jvmbuildPipelineArtifactsStage = undefined;
                            }
                        }
                        if (folderData.docker_jvmbuildPipelineArtifactsStage) {
                            logUtils.logInfo(`[deploy] Using already created artifacts stage of build pipeline for container image with JVM of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                        } else {
                            try {
                                logUtils.logInfo(`[deploy] Creating artifacts stage of build pipeline for container image with JVM of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                folderData.docker_jvmbuildPipelineArtifactsStage = false;
                                folderData.docker_jvmbuildPipelineArtifactsStage = (await ociUtils.createBuildPipelineArtifactsStage(provider, folderData.docker_jvmbuildPipeline, folderData.docker_jvmbuildPipelineBuildStage, folderData.docker_jvmbuildArtifact, docker_jvmbuildArtifactName, {
                                    'gcn_tooling_deployID': deployData.tag
                                })).id;
                            } catch (err) {
                                resolve(dialogs.getErrorMessage(`Failed to create container image with JVM pipeline artifacts stage for ${repositoryName}`, err));
                                folderData.docker_jvmbuildPipelineArtifactsStage = false;
                                dump(deployData);
                                return;
                            }
                            dump(deployData);
                        }
                        buildPipelines.push({ 'ocid': folderData.docker_jvmbuildPipeline, 'displayName': docker_jvmbuildPipelineName });

                        if (deployData.okeClusterEnvironment) {

                            // --- Create OKE jvm deployment configuration spec
                            progress.report({
                                increment,
                                message: `Creating OKE jvm deployment configuration development spec for ${repositoryName}...`
                            });
                            const oke_deploy_jvm_config_template = 'oke_deploy_config.yaml';
                            const oke_deployJvmConfigInlineContent = expandTemplate(resourcesPath, oke_deploy_jvm_config_template, {
                                image_name: docker_jvmbuildImage,
                                app_name: repositoryName.toLowerCase().replace(/[^0-9a-z]+/g, '-'),
                                secret_name: folderData.secretName
                            });
                            if (!oke_deployJvmConfigInlineContent) {
                                resolve(`Failed to create OKE jvm deployment configuration development spec for ${repositoryName}`);
                                return;
                            }
                            if (folderData.oke_deployJvmConfigArtifact) {
                                progress.report({
                                    message: `Using already created OKE jvm deployment configuration development artifact for ${repositoryName}...`
                                });
                                try {
                                    const artifact = await ociUtils.getDeployArtifact(provider, folderData.oke_deployJvmConfigArtifact);
                                    if (!artifact) {
                                        folderData.oke_deployJvmConfigArtifact = undefined;
                                    }
                                } catch (err) {
                                    folderData.oke_deployJvmConfigArtifact = undefined;
                                }
                            }
                            if (folderData.oke_deployJvmConfigArtifact) {
                                progress.report({
                                    increment,
                                });
                                logUtils.logInfo(`[deploy] Using already created OKE jvm deployment configuration artifact for ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                            } else {
                                // --- Create OKE jvm deployment configuration artifact
                                progress.report({
                                    increment,
                                    message: `Creating OKE jvm deployment configuration artifact for ${repositoryName}...`
                                });
                                const oke_deployJvmConfigArtifactName = `${repositoryName}_oke_deploy_jvm_configuration`;
                                const oke_deployJvmConfigArtifactDescription = `OKE jvm deployment configuration artifact for devops project ${projectName} & repository ${repositoryName}`;
                                try {
                                    logUtils.logInfo(`[deploy] Creating OKE jvm deployment configuration artifact for ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                    folderData.oke_deployJvmConfigArtifact = false;
                                    folderData.oke_deployJvmConfigArtifact = (await ociUtils.createOkeDeployConfigurationArtifact(provider, projectOCID, oke_deployJvmConfigInlineContent, oke_deployJvmConfigArtifactName, oke_deployJvmConfigArtifactDescription, {
                                        'gcn_tooling_deployID': deployData.tag,
                                        'gcn_tooling_codeRepoID': codeRepository.id,
                                        'gcn_tooling_image_name': docker_jvmbuildImage
                                    })).id;
                                    if (!codeRepoResources.artifacts) {
                                        codeRepoResources.artifacts = [];
                                    }
                                    codeRepoResources.artifacts.push({
                                        ocid: folderData.oke_deployJvmConfigArtifact,
                                        originalName: oke_deployJvmConfigArtifactName
                                    });
                                } catch (err) {
                                    resolve(dialogs.getErrorMessage(`Failed to create OKE jvm deployment configuration artifact for ${repositoryName}`, err));
                                    folderData.oke_deployJvmConfigArtifact = false;
                                    dump(deployData);
                                    return;
                                }
                                dump(deployData);
                            }

                            const oke_deployJvmPipelineName = 'Deploy Container with JVM to OKE';
                            if (folderData.oke_deployJvmPipeline) {
                                progress.report({
                                    message: `Using already created deployment to OKE pipeline for container image with JVM of ${repositoryName}...`
                                });
                                try {
                                    const pipeline = await ociUtils.getDeployPipeline(provider, folderData.oke_deployJvmPipeline);
                                    if (!pipeline) {
                                        folderData.oke_deployJvmPipeline = undefined;
                                    }
                                } catch (err) {
                                    folderData.oke_deployJvmPipeline = undefined;
                                }
                            }
                            if (folderData.oke_deployJvmPipeline) {
                                progress.report({
                                    increment,
                                });
                                logUtils.logInfo(`[deploy] Using already created deployment to OKE pipeline for container image with JVM of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                            } else {
                                // --- Create OKE jvm deployment pipeline
                                progress.report({
                                    increment,
                                    message: `Creating deployment to OKE pipeline for container image with JVM of ${repositoryName}...`
                                });
                                const oke_deployJvmPipelineDescription = `Deployment pipeline to deploy container image with JVM for devops project ${projectName} & repository ${repositoryName} to OKE`;
                                try {
                                    logUtils.logInfo(`[deploy] Creating deployment to OKE pipeline for container image with JVM of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                    const pipelineName = `${repositoryNamePrefix}${oke_deployJvmPipelineName}`;
                                    folderData.oke_deployJvmPipeline = false;
                                    folderData.oke_deployJvmPipeline = (await ociUtils.createDeployPipeline(provider, projectOCID, pipelineName, oke_deployJvmPipelineDescription, [{
                                        name: 'DOCKER_TAG',
                                        defaultValue: 'latest'
                                    }], {
                                        'gcn_tooling_deployID': deployData.tag,
                                        'gcn_tooling_codeRepoID': codeRepository.id,
                                        'gcn_tooling_codeRepoPrefix': repositoryNamePrefix,
                                        'gcn_tooling_buildPipelineOCID': folderData.docker_jvmbuildPipeline,
                                        'gcn_tooling_okeDeploymentName': repositoryName.toLowerCase().replace(/[^0-9a-z]+/g, '-')
                                    })).id;
                                    if (!codeRepoResources.deploymentPipelines) {
                                        codeRepoResources.deploymentPipelines = [];
                                    }
                                    codeRepoResources.deploymentPipelines.push({
                                        ocid: folderData.oke_deployJvmPipeline,
                                        originalName: pipelineName,
                                        autoImport: 'true'
                                    });
                                } catch (err) {
                                    resolve(dialogs.getErrorMessage(`Failed to create container image with JVM deployment to OKE pipeline for ${repositoryName}`, err));
                                    folderData.oke_deployJvmPipeline = false;
                                    dump(deployData);
                                    return;
                                }
                                dump(deployData);
                            }
                            if (folderData.setupSecretForDeployJvmStage) {
                                try {
                                    const stage = await ociUtils.getDeployStage(provider, folderData.setupSecretForDeployJvmStage);
                                    if (!stage) {
                                        folderData.setupSecretForDeployJvmStage = undefined;
                                    }
                                } catch (err) {
                                    folderData.setupSecretForDeployJvmStage = undefined;
                                }
                            }
                            if (folderData.setupSecretForDeployJvmStage) {
                                logUtils.logInfo(`[deploy] Using already created setup secret stage of deployment to OKE pipeline for container image with JVM of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                            } else {
                                try {
                                    logUtils.logInfo(`[deploy] Creating setup secret stage of deployment to OKE pipeline for container image with JVM of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                    folderData.setupSecretForDeployJvmStage = false;
                                    folderData.setupSecretForDeployJvmStage = (await ociUtils.createSetupKubernetesDockerSecretStage(provider, folderData.oke_deployJvmPipeline, folderData.oke_deploySetupCommandArtifact, deployData.subnetId, {
                                        'gcn_tooling_deployID': deployData.tag
                                    })).id;
                                } catch (err) {
                                    resolve(dialogs.getErrorMessage(`Failed to create container image with JVM setup secret stage for ${repositoryName}`, err));
                                    folderData.setupSecretForDeployJvmStage = false;
                                    dump(deployData);
                                    return;
                                }
                                dump(deployData);
                            }
                            if (folderData.deployJvmToOkeStage) {
                                try {
                                    const stage = await ociUtils.getDeployStage(provider, folderData.deployJvmToOkeStage);
                                    if (!stage) {
                                        folderData.deployJvmToOkeStage = undefined;
                                    }
                                } catch (err) {
                                    folderData.deployJvmToOkeStage = undefined;
                                }
                            }
                            if (folderData.deployJvmToOkeStage) {
                                logUtils.logInfo(`[deploy] Using already created deploy to OKE stage of deployment to OKE pipeline for container image with JVM of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                            } else {
                                try {
                                    logUtils.logInfo(`[deploy] Creating deploy to OKE stage of deployment to OKE pipeline for container image with JVM of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                    folderData.deployJvmToOkeStage = false;
                                    folderData.deployJvmToOkeStage = (await ociUtils.createDeployToOkeStage(provider, folderData.oke_deployJvmPipeline, folderData.setupSecretForDeployJvmStage, deployData.okeClusterEnvironment, folderData.oke_deployJvmConfigArtifact, {
                                        'gcn_tooling_deployID': deployData.tag
                                    })).id;
                                } catch (err) {
                                    resolve(dialogs.getErrorMessage(`Failed to create container image with JVM deployment to OKE stage for ${repositoryName}`, err));
                                    folderData.deployJvmToOkeStage = false;
                                    dump(deployData);
                                    return;
                                }
                                dump(deployData);
                            }
                            deployPipelines.push({ 'ocid': folderData.oke_deployJvmPipeline, 'displayName': oke_deployJvmPipelineName });
                        }
                    }
                }

                // --- Populate code repository
                progress.report({
                    increment,
                    message: `Populating source code repository ${repositoryName}...`
                });
                if (!codeRepositoryCompleted) {
                    progress.report({
                        message: `Still waiting for source code repository ${deployData.compartment.name}/${projectName}/${repositoryName} to be created...`
                    });
                    logUtils.logInfo(`[deploy] Waiting for source code repository ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                    try {
                        // let also the potential error from the call to be thrown
                        await codeRepositoryPromise;
                    } catch (err) {
                        resolve(dialogs.getErrorMessage('Failed to create source code repository', err));
                        return;
                    }
                }
                logUtils.logInfo(`[deploy] Populating source code repository ${deployData.compartment.name}/${projectName}/${repositoryName} from ${repositoryDir}`);
                gitUtils.addGitIgnoreEntry(folder.uri.fsPath, '.vscode/gcn.json');
                const pushErr = await gitUtils.populateNewRepository(codeRepository.sshUrl, repositoryDir, folderData, async () => {
                    if (!deployData.user) {
                        const user = await ociUtils.getUser(provider);
                        deployData.user = { name: user.description, email: user.email };
                    }
                    return deployData.user;
                }, /*, storage*/);
                if (pushErr) {
                    resolve(`Failed to push source code repository ${repositoryName}: ${pushErr}`);
                    dump(deployData);
                    return;
                }
                dump(deployData);

                try {
                    logUtils.logInfo(`[deploy] Remove incomplete tag for source code repository ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                    await ociUtils.updateCodeRepository(provider, folderData.codeRepository, undefined, undefined, undefined, {
                        'gcn_tooling_deployID': deployData.tag
                    });
                } catch (err) {
                    resolve(dialogs.getErrorMessage(`Failed to remove incomplete tag for source code repository ${repositoryName}`, err));
                    return;
                }

                // --- Save list of generated resources
                progress.report({
                    increment,
                    message: `Saving list of resources generated for code repository ${repositoryName}...`
                });
                try {
                    const codeRepoResourcesArtifactName = `GeneratedResources-CodeRepository-${repositoryName}`;
                    const codeRepoResourcesArtifactDescription = `List of resources automatically generated by VS Code for code repository ${repositoryName}. Do not modify or delete these resources to not break the VS Code functionality!`;
                    const codeRepoResourcesArtifactContent = JSON.stringify(codeRepoResources, undefined, 4);
                    await ociUtils.creatGenericInlineArtifact(provider, projectOCID, codeRepoResourcesArtifactName, codeRepoResourcesArtifactDescription, codeRepoResourcesArtifactContent, {
                        'gcn_tooling_deployID': deployData.tag,
                        'gcn_tooling_codeRepoID': codeRepository.id,
                        'gcn_tooling_codeRepoResourcesList': 'true'
                    });
                    logUtils.logInfo(`[deploy] Persisting list of generated resources for ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                } catch (err) {
                    logUtils.logError(dialogs.getErrorMessage(`[deploy] Failed to persist list of generated resources for ${deployData.compartment.name}/${projectName}/${repositoryName}`, err));
                }

                // --- Store cloud services configuration (.vscode/gcn.json)
                progress.report({
                    increment,
                    message: `Configuring project services for ${repositoryName}...`
                });
                const data: any = {
                    version: '1.0'
                };
                data[authentication.getDataName()] = authentication.getData();
                const oci = new ociContext.Context(authentication, deployData.compartment.ocid, projectOCID, codeRepository.id);
                data[oci.getDataName()] = oci.getData();
                data.services = {
                    // TODO: Might use populated instance of buildServices.Service as dataSupport.DataProducer
                    buildPipelines: {
                        items: buildPipelines
                    },
                    // TODO: Might use populated instance of deploymentServices.Service as dataSupport.DataProducer
                    deploymentPipelines: {
                        items: deployPipelines
                    }
                };
                if (knowledgeBaseOCID) {
                    // TODO: Might use populated instance of knowledgeBaseServices.Service as dataSupport.DataProducer
                    data.services.knowledgeBases = {
                        settings: {
                            folderAuditsKnowledgeBase: knowledgeBaseOCID
                        }
                    };
                }
                logUtils.logInfo(`[deploy] Saving project services configuration for ${deployData.compartment.name}/${projectName}/${repositoryName} into ${repositoryDir}`);
                const saved = saveConfig(repositoryDir, data);
                if (!saved) {
                    resolve(`Failed to save project services configuration for ${repositoryName}.`);
                    return;
                }
            }

            dump();

            if (!deployData.knowledgeBaseOCID) {
                if (!knowledgeCompleted) {
                    progress.report({
                        message: `Still waiting for ADM knowledge for ${projectName} to be created...`
                    });
                    logUtils.logInfo(`[deploy] Waiting for knowledge base for ${deployData.compartment.name}/${projectName}`);
                }
                try {
                    // let also the potential error from the call to be thrown
                    await knowledgePromise;
                } catch (err) {
                    resolve(dialogs.getErrorMessage('Failed to create knowledge base', err));
                    return;
                }
            }

            if (projectLogPromise) {
                if (!projectLogCompleted) {
                    progress.report({
                        message: `Still waiting for project log for ${projectName} to be created...`
                    });
                    logUtils.logInfo(`[deploy] Waiting for project log for ${deployData.compartment.name}/${projectName}`);
                }
                try {
                    // let also the potential error from the call to be thrown
                    await projectLogPromise;
                } catch (err) {
                    resolve(dialogs.getErrorMessage('Failed to create project log', err));
                    return;
                }
            }

            // --- Save list of generated resources
            progress.report({
                increment,
                message: `Saving list of resources generated for devops project ${projectName}...`
            });
            try {
                const projectResourcesArtifactName = 'GeneratedResources-Project';
                const projectResourcesArtifactDescription = `List of resources automatically generated by VS Code for devops project ${projectName}. Do not modify or delete these resources to not break the VS Code functionality!`;
                const projectResourcesArtifactContent = JSON.stringify(projectResources, undefined, 4);
                await ociUtils.creatGenericInlineArtifact(provider, projectOCID, projectResourcesArtifactName, projectResourcesArtifactDescription, projectResourcesArtifactContent, {
                    'gcn_tooling_deployID': deployData.tag,
                    'gcn_tooling_projectResourcesList': 'true'
                });
                logUtils.logInfo(`[deploy] Persisting list of generated resources for ${deployData.compartment.name}/${projectName}`);
            } catch (err) {
                logUtils.logError(dialogs.getErrorMessage(`[deploy] Failed to persist list of generated resources for ${deployData.compartment.name}/${projectName}`, err));
            }

            resolve(undefined);
            return;
        });
    });

    if (error) {
        dialogs.showErrorMessage(error);
        logUtils.logInfo(`[deploy] Failed: ${error}`);
        return false;
    } else {
        logUtils.logInfo(`[deploy] New devops project successfully created`);
        return true;
    }
}

async function selectProjectName(suggestedName?: string): Promise<string | undefined> {
    function validateProjectName(name: string): string | undefined {
        if (!name || name.length === 0) {
            return 'DevOps project name cannot be empty.';
        }
        if (name.indexOf(' ') !== -1) {
            return 'DevOps project name may not contain spaces.';
        }
        if (name.startsWith('-') || name.endsWith('-')) {
            return 'DevOps project name cannot start or end with \'-\'.';
        }
        if (name.indexOf('--') != -1) {
            return 'DevOps project name cannot contain \'--\'.';
        }
        if (!isNaN(name.charAt(0) as any)) {
            return 'DevOps project name cannot start with a number';
        }
        if (!/.*(?:^[a-zA-Z_](-?[a-zA-Z_0-9])*$).*/g.test(name)) {
            return 'DevOps project name must match ".*(?:^[a-zA-Z_](-?[a-zA-Z_0-9])*$).*"';
        }
        return undefined;
    }
    let projectName = await vscode.window.showInputBox({
        title: `${ACTION_NAME}: Provide DevOps Project Name`,
        placeHolder: 'Provide unique devops project name',
        value: suggestedName,
        validateInput: input => validateProjectName(input),
    });
    return projectName ? removeSpaces(projectName) : projectName;
}

function removeSpaces(name: string): string {
    return name.replace(/\s+/g, '_');
}

function pathForTargetPlatform(path: string | undefined): string | undefined {
    if (path && os.platform() === 'win32') {
        path = path.replace(/\\/g, '/');
        path = path.replace(/.exe/g, '');
    }
    return path;
}

export function expandTemplate(templatesStorage: string, template: string, args: { [key:string] : string }, folder?: vscode.WorkspaceFolder, name?: string): string | undefined {
    const templatespec = path.join(templatesStorage, template);
    let templateString = fs.readFileSync(templatespec).toString();

    templateString = mustache.render(templateString, args);

    if (folder) {
        const dest = path.join(folder.uri.fsPath, '.gcn');
        if (!fs.existsSync(dest)) {
            fs.mkdirSync(dest);
        }
        const templatedest = path.join(dest, name || template);
        fs.writeFileSync(templatedest, templateString);
    }
    return templateString;
}
