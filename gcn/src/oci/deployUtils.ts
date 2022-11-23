/*
 * Copyright (c) 2022, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as mustache from 'mustache';
import * as gitUtils from '../gitUtils'
import * as folderStorage from '../folderStorage';
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


const ACTION_NAME = 'Deploy To OCI';

export type SaveConfig = (folder: string, config: any) => boolean;

export async function deployFolders(folders: vscode.WorkspaceFolder[], resourcesPath: string, saveConfig: SaveConfig, dump: model.DumpDeployData): Promise<boolean> {
    logUtils.logInfo('[deploy] Invoked create new devops project');
    
    const nblsErr = await projectUtils.checkNBLS();
    if (nblsErr) {
        dialogs.showErrorMessage(nblsErr);
        logUtils.logInfo(`[deploy] ${nblsErr}`);
        return false;
    }

    const dumpData: any = dump(null);
    const deployData: any = dumpData || {};

    const openContexts: ociContext.Context[] | undefined = dumpData ? undefined : [];

    const folderData = openContexts ? gcnServices.getFolderData() : undefined;
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

    if (incrementalDeploy) {
        const profiles: string[] = [];
        for (const context of openContexts) {
            const contextProfile = context.getProfile();
            if (!profiles.includes(contextProfile)) {
                profiles.push(contextProfile);
            }
        }
        const selectedProfile = await ociDialogs.selectOciProfileFromList(profiles, true, ACTION_NAME);
        if (selectedProfile) {
            deployData.profile = selectedProfile;
        }
    }

    const authentication = await ociAuthentication.resolve(ACTION_NAME, deployData.profile);
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
            const state = (await ociUtils.getCluster(provider, deployData.okeCluster)).lifecycleState;
            if (!ociUtils.isUp(state)) {
                deployData.okeCluster = undefined;
            }
        } catch (err) {
            deployData.okeCluster = undefined;
        }
    }
    if (!deployData.okeCluster) {
        deployData.okeCluster = await okeUtils.selectOkeCluster(provider, deployData.compartment.ocid, provider.getRegion().regionId, true, deployData.compartment.name, true);
        if (deployData.okeCluster === undefined) {
            dump();
            return false;
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
                const projectFolder = await projectUtils.getProjectFolder(folder);
                logUtils.logInfo(`[deploy] Folder ${folder.uri.fsPath} identified as project of type ${projectFolder.projectType} with build system ${projectFolder.buildSystem}`);
                projectFolders.push(projectFolder);
                totalSteps += 3; // code repository, cloud services config, populating code repository
                if (projectFolder.projectType === 'GCN') {
                    totalSteps += 8; // Jar artifact, build spec and pipeline, NI artifact, build spec and pipeline, OKE deploy spec and artifact
                    if (deployData.okeCluster) {
                        totalSteps += 1; // deploy to OKE pipeline
                    }
                    totalSteps += 4; // Docker jvm image, build spec, and pipeline, jvm container repository
                    totalSteps += 4 * projectUtils.getCloudSpecificSubProjectNames(projectFolder).length; // Docker native image, build spec, and pipeline, native container repository per cloud specific subproject
                } else if (projectFolder.projectType === 'Micronaut' || projectFolder.projectType === 'SpringBoot') {
                    totalSteps += 18; // Jar artifact, build spec and pipeline, NI artifact, build spec and pipeline, Docker native image, build spec and pipeline, Docker jvm image, build spec and pipeline, OKE deploy spec and artifact, dev OKE deploy spec and artifact, native container repository, jvm container repository
                    if (deployData.okeCluster) {
                        totalSteps += 2; // deploy to OKE pipeline, dev deploy to OKE pipeline
                    }
                } else {
                    const baLocation = await projectUtils.getProjectBuildArtifactLocation(projectFolder);
                    const buildCommand = baLocation ? await projectUtils.getProjectBuildCommand(projectFolder) : undefined;
                    if (buildCommand) {
                        totalSteps += 7; // Jar artifact, build spec and pipeline, Docker jvm image, build spec and pipeline, jvm container repository
                        buildCommands.set(projectFolder, buildCommand);
                    }
                    const niLocation = await projectUtils.getProjectNativeExecutableArtifactLocation(projectFolder);
                    const niBuildCommand = niLocation ? await projectUtils.getProjectBuildNativeExecutableCommand(projectFolder) : undefined;
                    if (niBuildCommand) {
                        totalSteps += 9; // NI artifact, build spec and pipeline, Docker native image, build spec and pipeline, OKE deploy spec and artifact, native container repository
                        niBuildCommands.set(projectFolder, niBuildCommand);
                    }
                    if (!buildCommand && !niBuildCommand) {
                        resolve(`Cannot deploy unsupported project without build or native executable build command specified: ${folder.name}`);
                        return;
                    }
                }
            }
            totalSteps += 10; // notification topic, devops project, project log, dynamic groups and policies, artifact repository, OKE cluster environment, knowledge base
            const increment = 100 / totalSteps;

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
                    deployData.notificationTopic = await ociUtils.getOrCreateNotificationTopic(provider, deployData.compartment.ocid, notificationTopicDescription);
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
                    const group = await ociUtils.getDefaultLogGroup(provider, deployData.compartment.ocid);
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
                    deployData.logGroup = await ociUtils.getDefaultLogGroup(provider, deployData.compartment.ocid, true, logGroupDescription);
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
                    deployData.projectLogWorkRequest = await ociUtils.createProjectLog(provider, deployData.compartment.ocid, deployData.logGroup, projectOCID, `${projectName}Log`, {
                        'gcn_tooling_deployID': deployData.tag
                    });
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
                    increment: increment * 4
                });
            } else {
                // --- Create build pipelines dynamic group
                progress.report({
                    increment,
                    message: 'Setting up dynamic group for build pipelines...'
                });
                logUtils.logInfo(`[deploy] Setting up dynamic group for build pipelines for ${deployData.compartment.name}/${projectName}`);
                const buildPipelinesGroup = await ociUtils.getDefaultBuildPipelinesGroup(provider, deployData.compartment.ocid, true).catch(err => {
                    dialogs.showErrorMessage('Failed to resolve group for build pipelines', err);
                });

                // --- Create deployment pipelines dynamic group
                progress.report({
                    increment,
                    message: 'Setting up dynamic group for deployment pipelines...'
                });
                logUtils.logInfo(`[deploy] Setting up dynamic group for deployment pipelines for ${deployData.compartment.name}/${projectName}`);
                const deployPipelinesGroup = await ociUtils.getDefaultDeployPipelinesGroup(provider, deployData.compartment.ocid, true).catch(err => {
                    dialogs.showErrorMessage('Failed to resolve group for deployment pipelines', err);
                });

                // --- Create code repositories dynamic group
                progress.report({
                    increment,
                    message: 'Setting up dynamic group for code repositories...'
                });
                logUtils.logInfo(`[deploy] Setting up dynamic group for code repositories for ${deployData.compartment.name}/${projectName}`);
                const codeRepositoriesGroup = await ociUtils.getDefaultCodeRepositoriesGroup(provider, deployData.compartment.ocid, true).catch(err => {
                    dialogs.showErrorMessage('Failed to resolve group for code repositories', err);
                });

                if (buildPipelinesGroup && deployPipelinesGroup && codeRepositoriesGroup) {
                    // --- Setting up policy for accessing resources in compartment
                    progress.report({
                        increment,
                        message: 'Setting up policy for accessing resources in compartment...'
                    });
                    try {
                        logUtils.logInfo(`[deploy] Setting up policy for accessing resources in compartment for ${deployData.compartment.name}/${projectName}`);
                        const compartmentAccessPolicy = await ociUtils.getCompartmentAccessPolicy(provider, deployData.compartment.ocid, buildPipelinesGroup.name, deployPipelinesGroup.name, codeRepositoriesGroup.name, true);
                        if (!compartmentAccessPolicy) {
                            resolve('Failed to resolve policy for accessing resources in compartment.');
                            return;
                        }
                    } catch (err) {
                        resolve(dialogs.getErrorMessage('Failed to resolve policy for accessing resources in compartment', err));
                        return;
                    }
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
                }
            } else {
                // --- Create artifact repository
                progress.report({
                    increment,
                    message: `Creating artifact repository for ${projectName}...`
                });
                try {
                    logUtils.logInfo(`[deploy] Creating artifact repository for ${deployData.compartment.name}/${projectName}`);
                    deployData.artifactsRepository = (await ociUtils.createArtifactsRepository(provider, deployData.compartment.ocid, projectName, {
                        'gcn_tooling_deployID': deployData.tag,
                        "gcn_tooling_projectOCID" : projectOCID
                    })).id;
                    artifactRepositoryOCID = deployData.artifactsRepository;
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
                        deployData.okeClusterEnvironment = (await ociUtils.createOkeDeployEnvironment(provider, projectOCID, projectName, deployData.okeCluster, {
                            'gcn_tooling_deployID': deployData.tag
                        })).id;
                    } catch (err) {
                        resolve(dialogs.getErrorMessage('Failed to create OKE cluster environment', err));
                        deployData.okeClusterEnvironment = false;
                        dump(deployData);
                        return;
                    }
                    dump(deployData);
                }
            }

            let knowledgeCompleted : boolean = false;
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
                const buildPipelines = [];
                const deployPipelines = [];
                if (!deployData.repositories) {
                    deployData.repositories = {};
                }
                let folderData = deployData.repositories[repositoryName];
                if (!folderData) {
                    folderData = deployData.repositories[repositoryName] = {};
                }

                logUtils.logInfo(`[deploy] Deploying folder ${repositoryDir}`);

                let codeRepositoryCompleted : boolean = false;
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
                    await sshUtils.checkSshConfigured(provider, codeRepository.sshUrl);
                }

                // --- Generate fat JAR build spec
                progress.report({
                    increment,
                    message: `Creating fat JAR build spec for source code repository ${repositoryName}...`
                });
                const devbuildspec_template = 'devbuild_spec.yaml';
                const devbuildArtifactName = `${repositoryName}_dev_fatjar`;
                logUtils.logInfo(`[deploy] Creating fat JAR build spec for ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                const project_devbuild_artifact_location = await projectUtils.getProjectBuildArtifactLocation(folder);
                if (!project_devbuild_artifact_location && folder.projectType !== 'Unknown') {
                    dialogs.showErrorMessage(`Failed to resolve fat JAR artifact for folder ${folder.uri.fsPath}`);
                }
                const project_devbuild_command = folder.projectType === 'Unknown' ? buildCommands.get(folder) : await projectUtils.getProjectBuildCommand(folder);
                if (!project_devbuild_command && folder.projectType !== 'Unknown') {
                    dialogs.showErrorMessage(`Failed to resolve fat JAR build command for folder ${folder.uri.fsPath}`);
                }
                if (project_devbuild_artifact_location && project_devbuild_command) {
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
                            folderData.devbuildArtifact = (await ociUtils.createProjectDevArtifact(provider, artifactRepository, projectOCID, devbuildArtifactPath, devbuildArtifactName, devbuildArtifactDescription, {
                                'gcn_tooling_deployID': deployData.tag
                            })).id;
                        } catch (err) {
                            resolve(dialogs.getErrorMessage(`Failed to create fat JAR artifact for ${repositoryName}`, err));
                            folderData.devbuildArtifact = false;
                            dump(deployData);
                            return;
                        }
                        dump(deployData);
                    }

                    const devbuildPipelineName = 'Build Fat JAR';
                    if (folderData.devbuildPipeline) {
                        progress.report({
                            message: `Using already created build pipeline for fat JARs of ${repositoryName}...`
                        });
                        try {
                            const pipeline = await ociUtils.getBuildPipeline(provider, folderData.devbuildPipeline);
                            if (devbuildPipelineName !== pipeline.displayName) {
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
                        logUtils.logInfo(`[deploy] Using already created build pipeline for fat JARs of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                    } else {
                        // --- Create fat JAR pipeline
                        progress.report({
                            increment,
                            message: `Creating build pipeline for fat JARs of ${repositoryName}...`
                        });
                        const devbuildPipelineDescription = `Build pipeline to build fat JAR for devops project ${projectName} & repository ${repositoryName}`;
                        try {
                            logUtils.logInfo(`[deploy] Creating build pipeline for fat JARs of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                            folderData.devbuildPipeline = (await ociUtils.createBuildPipeline(provider, projectOCID, devbuildPipelineName, devbuildPipelineDescription, {
                                'gcn_tooling_deployID': deployData.tag
                            })).id;
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
                        logUtils.logInfo(`[deploy] Using already created build stage of build pipeline for fat JARs of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                    } else {
                        try {
                            logUtils.logInfo(`[deploy] Creating build stage of build pipeline for fat JARs of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                            folderData.devbuildPipelineBuildStage = (await ociUtils.createBuildPipelineBuildStage(provider, folderData.devbuildPipeline, codeRepository.id, repositoryName, codeRepository.httpUrl, `.gcn/${devbuildspec_template}`, {
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
                        logUtils.logInfo(`[deploy] Using already created artifacts stage of build pipeline for fat JARs of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                    } else {
                        try {
                            logUtils.logInfo(`[deploy] Creating artifacts stage of build pipeline for fat JARs of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
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
                    buildPipelines.push({ 'ocid': folderData.devbuildPipeline, 'displayName': devbuildPipelineName });
                }

                // --- Generate native image build spec
                progress.report({
                    increment,
                    message: `Creating native executable build spec for source code repository ${repositoryName}...`
                });
                const nibuildspec_template = 'nibuild_spec.yaml';
                const nibuildArtifactName = `${repositoryName}_dev_executable`;
                logUtils.logInfo(`[deploy] Creating native executable build spec for ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                const project_native_executable_artifact_location = await projectUtils.getProjectNativeExecutableArtifactLocation(folder);
                if (!project_native_executable_artifact_location && folder.projectType !== 'Unknown') {
                    dialogs.showErrorMessage(`Failed to resolve native executable artifact for folder ${folder.uri.fsPath}`);
                }
                const project_build_native_executable_command = folder.projectType === 'Unknown' ? niBuildCommands.get(folder) : await projectUtils.getProjectBuildNativeExecutableCommand(folder);
                if (!project_build_native_executable_command && folder.projectType !== 'Unknown') {
                    dialogs.showErrorMessage(`Failed to resolve native executable build command for folder ${folder.uri.fsPath}`);
                }
                if (project_native_executable_artifact_location && project_build_native_executable_command) {
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
                            folderData.nibuildArtifact = (await ociUtils.createProjectDevArtifact(provider, artifactRepository, projectOCID, nibuildArtifactPath, nibuildArtifactName, nibuildArtifactDescription, {
                                'gcn_tooling_deployID': deployData.tag
                            })).id;
                        } catch (err) {
                            resolve(dialogs.getErrorMessage(`Failed to create native executable artifact for ${repositoryName}`, err));
                            folderData.nibuildArtifact = false;
                            dump(deployData);
                            return;
                        }
                        dump(deployData);
                    }

                    const nibuildPipelineName = 'Build Native Executable';
                    if (folderData.nibuildPipeline) {
                        progress.report({
                            message: `Using already created build pipeline for native executables of ${repositoryName}...`
                        });
                        try {
                            const pipeline = await ociUtils.getBuildPipeline(provider, folderData.nibuildPipeline);
                            if (nibuildPipelineName !== pipeline.displayName) {
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
                        logUtils.logInfo(`[deploy] Using already created build pipeline for native executables of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                    } else {
                        // --- Create native image pipeline
                        progress.report({
                            increment,
                            message: `Creating build pipeline for native executables of ${repositoryName}...`
                        });
                        const nibuildPipelineDescription = `Build pipeline to build native executable for devops project ${projectName} & repository ${repositoryName}`;
                        try {
                            logUtils.logInfo(`[deploy] Creating build pipeline for native executables of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                            folderData.nibuildPipeline = (await ociUtils.createBuildPipeline(provider, projectOCID, nibuildPipelineName, nibuildPipelineDescription, {
                                'gcn_tooling_deployID': deployData.tag
                            })).id;
                        } catch (err) {
                            resolve(dialogs.getErrorMessage(`Failed to create native executables pipeline for ${repositoryName}`, err));
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
                        logUtils.logInfo(`[deploy] Using already created build stage of build pipeline for native executables of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                    } else {
                        try {
                            logUtils.logInfo(`[deploy] Creating build stage of build pipeline for native executables o ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                            folderData.nibuildPipelineBuildStage = (await ociUtils.createBuildPipelineBuildStage(provider, folderData.nibuildPipeline, codeRepository.id, repositoryName, codeRepository.httpUrl, `.gcn/${nibuildspec_template}`, {
                                'gcn_tooling_deployID': deployData.tag
                            })).id;
                        } catch (err) {
                            resolve(dialogs.getErrorMessage(`Failed to create native executables pipeline build stage for ${repositoryName}`, err));
                            folderData.nibuildPipelineBuildStage = false;
                            dump(deployData);
                            return;
                        }
                        dump(deployData);
                    }
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
                        logUtils.logInfo(`[deploy] Using already created artifacts stage of build pipeline for native executables of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                    } else {
                        try {
                            logUtils.logInfo(`[deploy] Creating artifacts stage of build pipeline for native executables of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                            folderData.nibuildPipelineArtifactsStage = (await ociUtils.createBuildPipelineArtifactsStage(provider, folderData.nibuildPipeline, folderData.nibuildPipelineBuildStage, folderData.nibuildArtifact, nibuildArtifactName, {
                                'gcn_tooling_deployID': deployData.tag
                            })).id;
                        } catch (err) {
                            resolve(dialogs.getErrorMessage(`Failed to create native executables pipeline artifacts stage for ${repositoryName}`, err));
                            folderData.nibuildPipelineArtifactsStage = false;
                            dump(deployData);
                            return;
                        }
                        dump(deployData);
                    }
                    buildPipelines.push({ 'ocid': folderData.nibuildPipeline, 'displayName': nibuildPipelineName });
                }

                let namesapce: string | undefined;
                try {
                    logUtils.logInfo(`[deploy] Resolving object storage namespace`);
                    namesapce = await ociUtils.getObjectStorageNamespace(provider);
                } catch (err) {}
                if (!namesapce) {
                    resolve(`Failed to create docker native executables pipeline for ${repositoryName} - cannot resolve object storage namespace.`);
                    return;
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

                            let nativeContainerRepository;
                            if (subData.nativeContainerRepository) {
                                progress.report({
                                    message: `Using already created native container repository for ${repositoryName}...`
                                });
                                try {
                                    nativeContainerRepository = await ociUtils.getContainerRepository(provider, subData.containerRepository);
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
                                    nativeContainerRepository = await ociUtils.createContainerRepository(provider, deployData.compartment.ocid, containerRepositoryName);
                                    subData.nativeContainerRepository = nativeContainerRepository.id;
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
                                message: `Creating ${subName} docker native executable build spec for source code repository ${repositoryName}...`
                            });
                            const docker_nibuildspec_template = 'docker_nibuild_spec.yaml';
                            const docker_nibuildArtifactName = `${repositoryName}_${subName}_native_docker_image`;
                            logUtils.logInfo(`[deploy] Creating ${subName} docker native executable build spec for ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                            const project_native_executable_artifact_location = await projectUtils.getProjectNativeExecutableArtifactLocation(folder, subName);
                            if (!project_native_executable_artifact_location) {
                                dialogs.showErrorMessage(`Failed to resolve native executable artifact for folder ${folder.uri.fsPath} & subproject ${subName}`);
                            }
                            const project_build_native_executable_command = await projectUtils.getProjectBuildNativeExecutableCommand(folder, subName);
                            if (!project_build_native_executable_command) {
                                dialogs.showErrorMessage(`Failed to resolve native executable build command for folder ${folder.uri.fsPath} & subproject ${subName}`);
                            }
                            if (project_native_executable_artifact_location && project_build_native_executable_command) {
                                const docker_nibuildTemplate = expandTemplate(resourcesPath, docker_nibuildspec_template, {
                                    project_build_command: project_build_native_executable_command,
                                    project_artifact_location: project_native_executable_artifact_location,
                                    deploy_artifact_name: docker_nibuildArtifactName,
                                    image_name: nativeContainerRepository.displayName.toLowerCase()
                                }, folder, `${subName}_${docker_nibuildspec_template}`);
                                if (!docker_nibuildTemplate) {
                                    resolve(`Failed to configure ${subName} docker native executable build spec for ${repositoryName}`);
                                    return;
                                }
                                if (subName === 'oci') {
                                    const docker_ni_file = 'Dockerfile.native';
                                    const docker_niFile = expandTemplate(resourcesPath, docker_ni_file, {}, folder);
                                    if (!docker_niFile) {
                                        resolve(`Failed to configure docker native file for ${repositoryName}`);
                                        return;
                                    }
                                }

                                const docker_nibuildImage = `${provider.getRegion().regionCode}.ocir.io/${namesapce}/${nativeContainerRepository.displayName}:\${DOCKER_TAG}`;
                                if (subData.docker_nibuildArtifact) {
                                    progress.report({
                                        message: `Using already created ${subName} docker native executable artifact for ${repositoryName}...`
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
                                    logUtils.logInfo(`[deploy] Using already created ${subName} docker native executable artifact for ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                } else {
                                    // --- Create docker native image artifact
                                    progress.report({
                                        increment,
                                        message: `Creating ${subName} docker native executable artifact for ${repositoryName}...`
                                    });
                                    const docker_nibuildArtifactDescription = `Docker native executable artifact for ${subName.toUpperCase()} & devops project ${projectName} & repository ${repositoryName}`;
                                    try {
                                        logUtils.logInfo(`[deploy] Creating ${subName} docker native executable artifact for ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                        subData.docker_nibuildArtifact = (await ociUtils.createProjectDockerArtifact(provider, projectOCID, docker_nibuildImage, docker_nibuildArtifactName, docker_nibuildArtifactDescription, {
                                            'gcn_tooling_deployID': deployData.tag
                                        })).id;
                                    } catch (err) {
                                        resolve(dialogs.getErrorMessage(`Failed to create ${subName} docker native executable artifact for ${repositoryName}`, err));
                                        subData.docker_nibuildArtifact = false;
                                        dump(deployData);
                                        return;
                                    }
                                    dump(deployData);
                                }

                                const docker_nibuildPipelineName = `Build ${subName.toUpperCase()} Docker Native Executable`;
                                if (subData.docker_nibuildPipeline) {
                                    progress.report({
                                        message: `Using already created build pipeline for ${subName} docker native executables of ${repositoryName}...`
                                    });
                                    try {
                                        const pipeline = await ociUtils.getBuildPipeline(provider, subData.docker_nibuildPipeline);
                                        if (docker_nibuildPipelineName !== pipeline.displayName) {
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
                                    logUtils.logInfo(`[deploy] Using already created build pipeline for ${subName} docker native executables of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                } else {
                                    // --- Create docker native image pipeline
                                    progress.report({
                                        increment,
                                        message: `Creating build pipeline for ${subName} docker native executable of ${repositoryName}...`
                                    });
                                    const docker_nibuildPipelineDescription = `Build pipeline to build docker native executable for ${subName.toUpperCase()} & devops project ${projectName} & repository ${repositoryName}`;
                                    try {
                                        logUtils.logInfo(`[deploy] Creating build pipeline for ${subName} docker native executable of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                        subData.docker_nibuildPipeline = (await ociUtils.createBuildPipeline(provider, projectOCID, docker_nibuildPipelineName, docker_nibuildPipelineDescription, {
                                            'gcn_tooling_deployID': deployData.tag,
                                            'gcn_tooling_docker_image': subName.toLowerCase()
                                        })).id;
                                    } catch (err) {
                                        resolve(dialogs.getErrorMessage(`Failed to create ${subName} docker native executable build pipeline for ${repositoryName}`, err));
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
                                    logUtils.logInfo(`[deploy] Using already created build stage of build pipeline for ${subName} docker native executables of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                } else {
                                    try {
                                        logUtils.logInfo(`[deploy] Creating build stage of build pipeline for ${subName} docker native executable of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                        subData.docker_nibuildPipelineBuildStage = (await ociUtils.createBuildPipelineBuildStage(provider, subData.docker_nibuildPipeline, codeRepository.id, repositoryName, codeRepository.httpUrl, `.gcn/${subName}_${docker_nibuildspec_template}`, {
                                            'gcn_tooling_deployID': deployData.tag
                                        })).id;
                                    } catch (err) {
                                        resolve(dialogs.getErrorMessage(`Failed to create ${subName} docker native executable pipeline build stage for ${repositoryName}`, err));
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
                                    logUtils.logInfo(`[deploy] Using already created artifacts stage of build pipeline for ${subName} docker native executables of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                } else {
                                    try {
                                        logUtils.logInfo(`[deploy] Creating artifacts stage of build pipeline for ${subName} docker native executable of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                        subData.docker_nibuildPipelineArtifactsStage = (await ociUtils.createBuildPipelineArtifactsStage(provider, subData.docker_nibuildPipeline, subData.docker_nibuildPipelineBuildStage, subData.docker_nibuildArtifact, docker_nibuildArtifactName, {
                                            'gcn_tooling_deployID': deployData.tag
                                        })).id;
                                    } catch (err) {
                                        resolve(dialogs.getErrorMessage(`Failed to create ${subName} docker native executable pipeline artifacts stage for ${repositoryName}`, err));
                                        subData.docker_nibuildPipelineArtifactsStage = false;
                                        dump(deployData);
                                        return;
                                    }
                                    dump(deployData);
                                }

                                if (subName === 'oci') {
                                    buildPipelines.push({ 'ocid': subData.docker_nibuildPipeline, 'displayName': docker_nibuildPipelineName });

                                    // --- Create OKE native deployment configuration spec
                                    progress.report({
                                        increment,
                                        message: `Creating OKE native deployment configuration spec for ${subName} of ${repositoryName}...`
                                    });
                                    const oke_deploy_native_config_template = 'oke_deploy_config.yaml';
                                    const oke_deployNativeConfigInlineContent = expandTemplate(resourcesPath, oke_deploy_native_config_template, {
                                        image_name: docker_nibuildImage,
                                        app_name: repositoryName.toLowerCase()
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
                                            subData.oke_deployNativeConfigArtifact = (await ociUtils.createOkeDeployConfigurationArtifact(provider, projectOCID, oke_deployNativeConfigInlineContent, oke_deployNativeConfigArtifactName, oke_deployNativeConfigArtifactDescription, {
                                                'gcn_tooling_deployID': deployData.tag
                                            })).id;
                                        } catch (err) {
                                            resolve(dialogs.getErrorMessage(`Failed to create OKE native deployment configuration artifact for ${subName} of ${repositoryName}`, err));
                                            subData.oke_deployNativeConfigArtifact = false;
                                            dump(deployData);
                                            return;
                                        }
                                        dump(deployData);
                                    }

                                    if (deployData.okeClusterEnvironment) {

                                        const oke_deployNativePipelineName = 'Deploy OCI Docker Native Executable to OKE';
                                        if (subData.oke_deployNativePipeline) {
                                            progress.report({
                                                message: `Using already created deployment to OKE pipeline for ${subName} docker native executables of ${repositoryName}...`
                                            });
                                            try {
                                                const pipeline = await ociUtils.getDeployPipeline(provider, subData.oke_deployNativePipeline);
                                                if (oke_deployNativePipelineName !== pipeline.displayName) {
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
                                            logUtils.logInfo(`[deploy] Using already created deployment to OKE pipeline for ${subName} docker native executables of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                        } else {
                                            // --- Create OKE native deployment pipeline
                                            progress.report({
                                                increment,
                                                message: `Creating deployment to OKE pipeline for ${subName} docker native executables of ${repositoryName}...`
                                            });
                                            const oke_deployNativePipelineDescription = `Deployment pipeline to deploy docker native executable for OCI & devops project ${projectName} & repository ${repositoryName} to OKE`;
                                            try {
                                                logUtils.logInfo(`[deploy] Creating deployment to OKE pipeline for ${subName} docker native executables of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                                subData.oke_deployNativePipeline = (await ociUtils.createDeployPipeline(provider, projectOCID, oke_deployNativePipelineName, oke_deployNativePipelineDescription, [{
                                                    name: 'DOCKER_TAG',
                                                    defaultValue: 'latest'
                                                }], {
                                                    'gcn_tooling_deployID': deployData.tag,
                                                    'gcn_tooling_buildPipelineOCID': subData.docker_nibuildPipeline,
                                                    'gcn_tooling_okeDeploymentName': repositoryName.toLowerCase()
                                                })).id;
                                            } catch (err) {
                                                resolve(dialogs.getErrorMessage(`Failed to create ${subName} docker native executables deployment to OKE pipeline for ${repositoryName}`, err));
                                                subData.oke_deployNativePipeline = false;
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
                                            logUtils.logInfo(`[deploy] Using already created deploy to OKE stage of deployment to OKE pipeline for ${subName} docker native executables of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                        } else {
                                            try {
                                                logUtils.logInfo(`[deploy] Creating deploy to OKE stage of deployment to OKE pipeline for ${subName} docker native executables of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                                subData.deployNativeToOkeStage = (await ociUtils.createDeployToOkeStage(provider, subData.oke_deployNativePipeline, deployData.okeClusterEnvironment, subData.oke_deployNativeConfigArtifact, {
                                                    'gcn_tooling_deployID': deployData.tag
                                                })).id;
                                            } catch (err) {
                                                resolve(dialogs.getErrorMessage(`Failed to create ${subName} docker native executables deployment to OKE stage for ${repositoryName}`, err));
                                                subData.deployNativeToOkeStage = false;
                                                dump(deployData);
                                                return;
                                            }
                                            dump(deployData);
                                        }
                                        deployPipelines.push({ 'ocid': subData.oke_deployNativePipeline, 'displayName': oke_deployNativePipelineName });
                                    }

                                    let jvmContainerRepository;
                                    if (subData.jvmContainerRepository) {
                                        progress.report({
                                            message: `Using already created jvm container repository for ${repositoryName}...`
                                        });
                                        try {
                                            jvmContainerRepository = await ociUtils.getContainerRepository(provider, subData.containerRepository);
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
                                            jvmContainerRepository = await ociUtils.createContainerRepository(provider, deployData.compartment.ocid, containerRepositoryName);
                                            subData.jvmContainerRepository = jvmContainerRepository.id;
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
                                        message: `Creating ${subName} docker jvm image build spec for source code repository ${repositoryName}...`
                                    });
                                    const docker_jvmbuildspec_template = 'docker_jvmbuild_spec.yaml';
                                    const docker_jvmbuildArtifactName = `${repositoryName}_${subName}_jvm_docker_image`;
                                    logUtils.logInfo(`[deploy] Creating ${subName} docker jvm image build spec for ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                    const project_devbuild_artifact_location = await projectUtils.getProjectBuildArtifactLocation(folder, subName);
                                    if (!project_devbuild_artifact_location) {
                                        dialogs.showErrorMessage(`Failed to resolve jvm image artifact for folder ${folder.uri.fsPath} & subproject ${subName}`);
                                    }
                                    const project_devbuild_command = await projectUtils.getProjectBuildCommand(folder, subName);
                                    if (!project_devbuild_command) {
                                        dialogs.showErrorMessage(`Failed to resolve jvm image build command for folder ${folder.uri.fsPath} & subproject ${subName}`);
                                    }
                                    if (project_devbuild_artifact_location && project_devbuild_command) {
                                        const docker_jvmbuildTemplate = expandTemplate(resourcesPath, docker_jvmbuildspec_template, {
                                            project_build_command: project_devbuild_command,
                                            project_artifact_location: project_devbuild_artifact_location,
                                            deploy_artifact_name: docker_jvmbuildArtifactName,
                                            image_name: jvmContainerRepository.displayName.toLowerCase()
                                        }, folder, `${subName}_${docker_jvmbuildspec_template}`);
                                        if (!docker_jvmbuildTemplate) {
                                            resolve(`Failed to configure ${subName} docker jvm image build spec for ${repositoryName}`);
                                            return;
                                        }
                                        const docker_jvm_file = 'Dockerfile.jvm';
                                        const docker_jvmFile = expandTemplate(resourcesPath, docker_jvm_file, {}, folder);
                                        if (!docker_jvmFile) {
                                            resolve(`Failed to configure docker jvm image file for ${repositoryName}`);
                                            return;
                                        }

                                        const docker_jvmbuildImage = `${provider.getRegion().regionCode}.ocir.io/${namesapce}/${jvmContainerRepository.displayName}:\${DOCKER_TAG}`;
                                        if (subData.docker_jvmbuildArtifact) {
                                            progress.report({
                                                message: `Using already created ${subName} docker jvm image artifact for ${repositoryName}...`
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
                                            logUtils.logInfo(`[deploy] Using already created ${subName} docker jvm image artifact for ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                        } else {
                                            // --- Create docker jvm image artifact
                                            progress.report({
                                                increment,
                                                message: `Creating ${subName} docker jvm image artifact for ${repositoryName}...`
                                            });
                                            const docker_jvmbuildArtifactDescription = `Docker jvm image artifact for ${subName.toUpperCase()} & devops project ${projectName} & repository ${repositoryName}`;
                                            try {
                                                logUtils.logInfo(`[deploy] Creating ${subName} docker jvm image artifact for ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                                subData.docker_jvmbuildArtifact = (await ociUtils.createProjectDockerArtifact(provider, projectOCID, docker_jvmbuildImage, docker_jvmbuildArtifactName, docker_jvmbuildArtifactDescription, {
                                                    'gcn_tooling_deployID': deployData.tag
                                                })).id;
                                            } catch (err) {
                                                resolve(dialogs.getErrorMessage(`Failed to create ${subName} docker jvm image artifact for ${repositoryName}`, err));
                                                subData.docker_jvmbuildArtifact = false;
                                                dump(deployData);
                                                return;
                                            }
                                            dump(deployData);
                                        }

                                        const docker_jvmbuildPipelineName = `Build ${subName.toUpperCase()} Docker JVM Image`;
                                        if (subData.docker_jvmbuildPipeline) {
                                            progress.report({
                                                message: `Using already created build pipeline for ${subName} docker jvm image of ${repositoryName}...`
                                            });
                                            try {
                                                const pipeline = await ociUtils.getBuildPipeline(provider, subData.docker_jvmbuildPipeline);
                                                if (docker_jvmbuildPipelineName !== pipeline.displayName) {
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
                                            logUtils.logInfo(`[deploy] Using already created build pipeline for ${subName} docker jvm image of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                        } else {
                                            // --- Create docker jvm image pipeline
                                            progress.report({
                                                increment,
                                                message: `Creating build pipeline for ${subName} docker jvm image of ${repositoryName}...`
                                            });
                                            const docker_jvmbuildPipelineDescription = `Build pipeline to build docker jvm image for ${subName.toUpperCase()} & devops project ${projectName} & repository ${repositoryName}`;
                                            try {
                                                logUtils.logInfo(`[deploy] Creating build pipeline for ${subName} docker jvm image of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                                subData.docker_jvmbuildPipeline = (await ociUtils.createBuildPipeline(provider, projectOCID, docker_jvmbuildPipelineName, docker_jvmbuildPipelineDescription, {
                                                    'gcn_tooling_deployID': deployData.tag,
                                                    'gcn_tooling_docker_image': subName.toLowerCase()
                                                })).id;
                                            } catch (err) {
                                                resolve(dialogs.getErrorMessage(`Failed to create ${subName} docker jvm image build pipeline for ${repositoryName}`, err));
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
                                            logUtils.logInfo(`[deploy] Using already created build stage of build pipeline for ${subName} docker jvm image of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                        } else {
                                            try {
                                                logUtils.logInfo(`[deploy] Creating build stage of build pipeline for ${subName} docker jvm image of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                                subData.docker_jvmbuildPipelineBuildStage = (await ociUtils.createBuildPipelineBuildStage(provider, subData.docker_jvmbuildPipeline, codeRepository.id, repositoryName, codeRepository.httpUrl, `.gcn/${subName}_${docker_jvmbuildspec_template}`, {
                                                    'gcn_tooling_deployID': deployData.tag
                                                })).id;
                                            } catch (err) {
                                                resolve(dialogs.getErrorMessage(`Failed to create ${subName} docker jvm image pipeline build stage for ${repositoryName}`, err));
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
                                            logUtils.logInfo(`[deploy] Using already created artifacts stage of build pipeline for ${subName} docker jvm image of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                        } else {
                                            try {
                                                logUtils.logInfo(`[deploy] Creating artifacts stage of build pipeline for ${subName} docker jvm image of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                                subData.docker_jvmbuildPipelineArtifactsStage = (await ociUtils.createBuildPipelineArtifactsStage(provider, subData.docker_jvmbuildPipeline, subData.docker_jvmbuildPipelineBuildStage, subData.docker_jvmbuildArtifact, docker_jvmbuildArtifactName, {
                                                    'gcn_tooling_deployID': deployData.tag
                                                })).id;
                                            } catch (err) {
                                                resolve(dialogs.getErrorMessage(`Failed to create ${subName} docker jvm image pipeline artifacts stage for ${repositoryName}`, err));
                                                subData.docker_jvmbuildPipelineArtifactsStage = false;
                                                dump(deployData);
                                                return;
                                            }
                                            dump(deployData);
                                        }

                                        // --- Create OKE jvm deployment configuration spec
                                        progress.report({
                                            increment,
                                            message: `Creating OKE jvm deployment configuration spec for ${subName} of ${repositoryName}...`
                                        });
                                        const oke_deploy_jvm_config_template = 'oke_deploy_config.yaml';
                                        const oke_deployJvmConfigInlineContent = expandTemplate(resourcesPath, oke_deploy_jvm_config_template, {
                                            image_name: docker_jvmbuildImage,
                                            app_name: repositoryName.toLowerCase()
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
                                                subData.oke_deployJvmConfigArtifact = (await ociUtils.createOkeDeployConfigurationArtifact(provider, projectOCID, oke_deployJvmConfigInlineContent, oke_deployJvmConfigArtifactName, oke_deployJvmConfigArtifactDescription, {
                                                    'gcn_tooling_deployID': deployData.tag
                                                })).id;
                                            } catch (err) {
                                                resolve(dialogs.getErrorMessage(`Failed to create OKE jvm deployment configuration artifact for ${subName} of ${repositoryName}`, err));
                                                subData.oke_deployJvmConfigArtifact = false;
                                                dump(deployData);
                                                return;
                                            }
                                            dump(deployData);
                                        }

                                        if (deployData.okeClusterEnvironment) {

                                            const oke_deployJvmPipelineName = 'Deploy OCI Docker JVM Image to OKE';
                                            if (subData.oke_deployJvmPipeline) {
                                                progress.report({
                                                    message: `Using already created deployment to OKE pipeline for ${subName} docker jvm image of ${repositoryName}...`
                                                });
                                                try {
                                                    const pipeline = await ociUtils.getDeployPipeline(provider, subData.oke_deployJvmPipeline);
                                                    if (oke_deployJvmPipelineName !== pipeline.displayName) {
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
                                                logUtils.logInfo(`[deploy] Using already created deployment to OKE pipeline for ${subName} docker jvm image of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                            } else {
                                                // --- Create OKE native deployment pipeline
                                                progress.report({
                                                    increment,
                                                    message: `Creating deployment to OKE pipeline for ${subName} docker jvm image of ${repositoryName}...`
                                                });
                                                const oke_deployJvmPipelineDescription = `Deployment pipeline to deploy docker jvm image for OCI & devops project ${projectName} & repository ${repositoryName} to OKE`;
                                                try {
                                                    logUtils.logInfo(`[deploy] Creating deployment to OKE pipeline for ${subName} docker jvm image of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                                    subData.oke_deployJvmPipeline = (await ociUtils.createDeployPipeline(provider, projectOCID, oke_deployJvmPipelineName, oke_deployJvmPipelineDescription, [{
                                                        name: 'DOCKER_TAG',
                                                        defaultValue: 'latest'
                                                    }], {
                                                        'gcn_tooling_deployID': deployData.tag,
                                                        'gcn_tooling_buildPipelineOCID': subData.docker_jvmbuildPipeline,
                                                        'gcn_tooling_okeDeploymentName': repositoryName.toLowerCase()
                                                    })).id;
                                                } catch (err) {
                                                    resolve(dialogs.getErrorMessage(`Failed to create ${subName} docker jvm image deployment to OKE pipeline for ${repositoryName}`, err));
                                                    subData.oke_deployJvmPipeline = false;
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
                                                logUtils.logInfo(`[deploy] Using already created deploy to OKE stage of deployment to OKE pipeline for ${subName} docker jvm image of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                            } else {
                                                try {
                                                    logUtils.logInfo(`[deploy] Creating deploy to OKE stage of deployment to OKE pipeline for ${subName} docker jvm image of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                                    subData.deployJvmToOkeStage = (await ociUtils.createDeployToOkeStage(provider, subData.oke_deployJvmPipeline, deployData.okeClusterEnvironment, subData.oke_deployJvmConfigArtifact, {
                                                        'gcn_tooling_deployID': deployData.tag
                                                    })).id;
                                                } catch (err) {
                                                    resolve(dialogs.getErrorMessage(`Failed to create ${subName} docker jvm image deployment to OKE stage for ${repositoryName}`, err));
                                                    subData.deployJvmToOkeStage = false;
                                                    dump(deployData);
                                                    return;
                                                }
                                                dump(deployData);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }

                    // Add /bin folders created by EDT to .gitignore
                    gitUtils.addGitIgnoreEntry(folder.uri.fsPath, '**/bin');

                } else { // Micronaut, SpringBoot, other Java projects
                    logUtils.logInfo(`[deploy] ${folder.projectType !== 'Unknown' ? 'Recognized ' : ''}${folder.projectType} project in ${deployData.compartment.name}/${projectName}/${repositoryName}`);

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
                            nativeContainerRepository = await ociUtils.createContainerRepository(provider, deployData.compartment.ocid, containerRepositoryName);
                            folderData.nativeContainerRepository = nativeContainerRepository.id;
                        } catch (err) {
                            resolve(dialogs.getErrorMessage(`Failed to create native container repository ${containerRepositoryName}`, err));
                            folderData.nativeContainerRepository = false;
                            dump(deployData);
                            return;
                        }
                        dump(deployData);
                    }

                    if (project_native_executable_artifact_location && project_build_native_executable_command) {

                        // --- Generate docker native image build spec
                        progress.report({
                            increment,
                            message: `Creating docker native executable build spec for source code repository ${repositoryName}...`
                        });
                        const docker_nibuildspec_template = 'docker_nibuild_spec.yaml';
                        const docker_nibuildArtifactName = `${repositoryName}_native_docker_image`;
                        logUtils.logInfo(`[deploy] Creating docker native executable build spec for ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                        const docker_nibuildTemplate = expandTemplate(resourcesPath, docker_nibuildspec_template, {
                            project_build_command: project_build_native_executable_command,
                            project_artifact_location: project_native_executable_artifact_location,
                            deploy_artifact_name: docker_nibuildArtifactName,
                            image_name: nativeContainerRepository.displayName.toLowerCase()
                        }, folder);
                        if (!docker_nibuildTemplate) {
                            resolve(`Failed to configure docker native executable build spec for ${repositoryName}`);
                            return;
                        }
                        const docker_ni_file = 'Dockerfile.native';
                        const docker_niFile = expandTemplate(resourcesPath, docker_ni_file, {}, folder);
                        if (!docker_niFile) {
                            resolve(`Failed to configure docker native file for ${repositoryName}`);
                            return;
                        }

                        const docker_nibuildImage = `${provider.getRegion().regionCode}.ocir.io/${namesapce}/${nativeContainerRepository.displayName}:\${DOCKER_TAG}`;
                        if (folderData.docker_nibuildArtifact) {
                            progress.report({
                                message: `Using already created docker native executable artifact for ${repositoryName}...`
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
                            logUtils.logInfo(`[deploy] Using already created docker native executable artifact for ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                        } else {
                            // --- Create docker native image artifact
                            progress.report({
                                increment,
                                message: `Creating docker native executable artifact for ${repositoryName}...`
                            });
                            const docker_nibuildArtifactDescription = `Docker native executable artifact for devops project ${projectName} & repository ${repositoryName}`;
                            try {
                                logUtils.logInfo(`[deploy] Creating docker native executable artifact for ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                folderData.docker_nibuildArtifact = (await ociUtils.createProjectDockerArtifact(provider, projectOCID, docker_nibuildImage, docker_nibuildArtifactName, docker_nibuildArtifactDescription, {
                                    'gcn_tooling_deployID': deployData.tag
                                })).id;
                            } catch (err) {
                                resolve(dialogs.getErrorMessage(`Failed to create docker native executable artifact for ${repositoryName}`, err));
                                folderData.docker_nibuildArtifact = false;
                                dump(deployData);
                                return;
                            }
                            dump(deployData);
                        }

                        const docker_nibuildPipelineName = 'Build Docker Native Executable';
                        if (folderData.docker_nibuildPipeline) {
                            progress.report({
                                message: `Using already created build pipeline for docker native executables of ${repositoryName}...`
                            });
                            try {
                                const pipeline = await ociUtils.getBuildPipeline(provider, folderData.docker_nibuildPipeline);
                                if (docker_nibuildPipelineName !== pipeline.displayName) {
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
                            logUtils.logInfo(`[deploy] Using already created build pipeline for docker native executables of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                        } else {
                            // --- Create docker native image pipeline
                            progress.report({
                                increment,
                                message: `Creating build pipeline for docker native executable of ${repositoryName}...`
                            });
                            const docker_nibuildPipelineDescription = `Build pipeline to build docker native executable for devops project ${projectName} & repository ${repositoryName}`;
                            try {
                                logUtils.logInfo(`[deploy] Creating build pipeline for docker native executable of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                folderData.docker_nibuildPipeline = (await ociUtils.createBuildPipeline(provider, projectOCID, docker_nibuildPipelineName, docker_nibuildPipelineDescription, {
                                    'gcn_tooling_deployID': deployData.tag,
                                    'gcn_tooling_docker_image': 'oci'
                                })).id;
                            } catch (err) {
                                resolve(dialogs.getErrorMessage(`Failed to create docker native executable build pipeline for ${repositoryName}`, err));
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
                            logUtils.logInfo(`[deploy] Using already created build stage of build pipeline for docker native executables of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                        } else {
                            try {
                                logUtils.logInfo(`[deploy] Creating build stage of build pipeline for docker native executable of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                folderData.docker_nibuildPipelineBuildStage = (await ociUtils.createBuildPipelineBuildStage(provider, folderData.docker_nibuildPipeline, codeRepository.id, repositoryName, codeRepository.httpUrl, `.gcn/${docker_nibuildspec_template}`, {
                                    'gcn_tooling_deployID': deployData.tag
                                })).id;
                            } catch (err) {
                                resolve(dialogs.getErrorMessage(`Failed to create docker native executable pipeline build stage for ${repositoryName}`, err));
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
                            logUtils.logInfo(`[deploy] Using already created artifacts stage of build pipeline for docker native executables of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                        } else {
                            try {
                                logUtils.logInfo(`[deploy] Creating artifacts stage of build pipeline for docker native executable of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                folderData.docker_nibuildPipelineArtifactsStage = (await ociUtils.createBuildPipelineArtifactsStage(provider, folderData.docker_nibuildPipeline, folderData.docker_nibuildPipelineBuildStage, folderData.docker_nibuildArtifact, docker_nibuildArtifactName, {
                                    'gcn_tooling_deployID': deployData.tag
                                })).id;
                            } catch (err) {
                                resolve(dialogs.getErrorMessage(`Failed to create docker native executable pipeline artifacts stage for ${repositoryName}`, err));
                                folderData.docker_nibuildPipelineArtifactsStage = false;
                                dump(deployData);
                                return;
                            }
                            dump(deployData);
                        }
                        buildPipelines.push({ 'ocid': folderData.docker_nibuildPipeline, 'displayName': docker_nibuildPipelineName });

                        // --- Create OKE native deployment configuration spec
                        progress.report({
                            increment,
                            message: `Creating OKE native deployment configuration spec for ${repositoryName}...`
                        });
                        const oke_deploy_native_config_template = 'oke_deploy_config.yaml';
                        const oke_deployNativeConfigInlineContent = expandTemplate(resourcesPath, oke_deploy_native_config_template, {
                            image_name: docker_nibuildImage,
                            app_name: repositoryName.toLowerCase()
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
                                folderData.oke_deployNativeConfigArtifact = (await ociUtils.createOkeDeployConfigurationArtifact(provider, projectOCID, oke_deployNativeConfigInlineContent, oke_deployNativeConfigArtifactName, oke_deployNativeConfigArtifactDescription, {
                                    'gcn_tooling_deployID': deployData.tag
                                })).id;
                            } catch (err) {
                                resolve(dialogs.getErrorMessage(`Failed to create OKE native deployment configuration artifact for ${repositoryName}`, err));
                                folderData.oke_deployNativeConfigArtifact = false;
                                dump(deployData);
                                return;
                            }
                            dump(deployData);
                        }

                        if (deployData.okeClusterEnvironment) {

                            const oke_deployNativePipelineName = 'Deploy Docker Native Executable to OKE';
                            if (folderData.oke_deployNativePipeline) {
                                progress.report({
                                    message: `Using already created deployment to OKE pipeline for docker native executables of ${repositoryName}...`
                                });
                                try {
                                    const pipeline = await ociUtils.getDeployPipeline(provider, folderData.oke_deployNativePipeline);
                                    if (oke_deployNativePipelineName !== pipeline.displayName) {
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
                                logUtils.logInfo(`[deploy] Using already created deployment to OKE pipeline for docker native executables of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                            } else {
                                // --- Create OKE native deployment pipeline
                                progress.report({
                                    increment,
                                    message: `Creating deployment to OKE pipeline for docker native executables of ${repositoryName}...`
                                });
                                const oke_deployNativePipelineDescription = `Deployment pipeline to deploy docker native executable for devops project ${projectName} & repository ${repositoryName} to OKE`;
                                try {
                                    logUtils.logInfo(`[deploy] Creating deployment to OKE pipeline for docker native executables of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                    folderData.oke_deployNativePipeline = (await ociUtils.createDeployPipeline(provider, projectOCID, oke_deployNativePipelineName, oke_deployNativePipelineDescription, [{
                                        name: 'DOCKER_TAG',
                                        defaultValue: 'latest'
                                    }], {
                                        'gcn_tooling_deployID': deployData.tag,
                                        'gcn_tooling_buildPipelineOCID': folderData.docker_nibuildPipeline,
                                        'gcn_tooling_okeDeploymentName': repositoryName.toLowerCase()
                                    })).id;
                                } catch (err) {
                                    resolve(dialogs.getErrorMessage(`Failed to create docker native executables deployment to OKE pipeline for ${repositoryName}`, err));
                                    folderData.oke_deployNativePipeline = false;
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
                                logUtils.logInfo(`[deploy] Using already created deploy to OKE stage of deployment to OKE pipeline for docker native executables of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                            } else {
                                try {
                                    logUtils.logInfo(`[deploy] Creating deploy to OKE stage of deployment to OKE pipeline for docker native executables of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                    folderData.deployNativeToOkeStage = (await ociUtils.createDeployToOkeStage(provider, folderData.oke_deployNativePipeline, deployData.okeClusterEnvironment, folderData.oke_deployNativeConfigArtifact, {
                                        'gcn_tooling_deployID': deployData.tag
                                    })).id;
                                } catch (err) {
                                    resolve(dialogs.getErrorMessage(`Failed to create docker native executables deployment to OKE stage for ${repositoryName}`, err));
                                    folderData.deployNativeToOkeStage = false;
                                    dump(deployData);
                                    return;
                                }
                                dump(deployData);
                            }
                            deployPipelines.push({ 'ocid': folderData.oke_deployNativePipeline, 'displayName': oke_deployNativePipelineName });
                        }
                    }

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
                            jvmContainerRepository = await ociUtils.createContainerRepository(provider, deployData.compartment.ocid, containerRepositoryName);
                            folderData.jvmContainerRepository = jvmContainerRepository.id;
                        } catch (err) {
                            resolve(dialogs.getErrorMessage(`Failed to create jvm container repository ${containerRepositoryName}`, err));
                            folderData.jvmContainerRepository = false;
                            dump(deployData);
                            return;
                        }
                        dump(deployData);
                    }

                    if (project_devbuild_artifact_location && project_devbuild_command) {

                        // --- Generate docker jvm image build spec
                        progress.report({
                            increment,
                            message: `Creating docker jvm image build build spec for source code repository ${repositoryName}...`
                        });
                        const docker_jvmbuildspec_template = 'docker_jvmbuild_spec.yaml';
                        const docker_jvmbuildArtifactName = `${repositoryName}_jvm_docker_image`;
                        logUtils.logInfo(`[deploy] Creating docker jvm image build spec for ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                        const docker_jvmbuildTemplate = expandTemplate(resourcesPath, docker_jvmbuildspec_template, {
                            project_build_command: project_devbuild_command,
                            project_artifact_location: project_devbuild_artifact_location,
                            deploy_artifact_name: docker_jvmbuildArtifactName,
                            image_name: jvmContainerRepository.displayName.toLowerCase()
                        }, folder);
                        if (!docker_jvmbuildTemplate) {
                            resolve(`Failed to configure docker jvm image build spec for ${repositoryName}`);
                            return;
                        }
                        const docker_jvm_file = 'Dockerfile.jvm';
                        const docker_jvmFile = expandTemplate(resourcesPath, docker_jvm_file, {}, folder);
                        if (!docker_jvmFile) {
                            resolve(`Failed to configure docker jvm image file for ${repositoryName}`);
                            return;
                        }

                        const docker_jvmbuildImage = `${provider.getRegion().regionCode}.ocir.io/${namesapce}/${jvmContainerRepository.displayName}:\${DOCKER_TAG}`;
                        if (folderData.docker_jvmbuildArtifact) {
                            progress.report({
                                message: `Using already created docker jvm image artifact for ${repositoryName}...`
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
                            logUtils.logInfo(`[deploy] Using already created docker jvm image artifact for ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                        } else {
                            // --- Create docker jvm image artifact
                            progress.report({
                                increment,
                                message: `Creating docker jvm image artifact for ${repositoryName}...`
                            });
                            const docker_jvmbuildArtifactDescription = `Docker jvm image artifact for devops project ${projectName} & repository ${repositoryName}`;
                            try {
                                logUtils.logInfo(`[deploy] Creating docker jvm image artifact for ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                folderData.docker_jvmbuildArtifact = (await ociUtils.createProjectDockerArtifact(provider, projectOCID, docker_jvmbuildImage, docker_jvmbuildArtifactName, docker_jvmbuildArtifactDescription, {
                                    'gcn_tooling_deployID': deployData.tag
                                })).id;
                            } catch (err) {
                                resolve(dialogs.getErrorMessage(`Failed to create docker jvm image artifact for ${repositoryName}`, err));
                                folderData.docker_jvmbuildArtifact = false;
                                dump(deployData);
                                return;
                            }
                            dump(deployData);
                        }

                        const docker_jvmbuildPipelineName = 'Build Docker JVM Image';
                        if (folderData.docker_jvmbuildPipeline) {
                            progress.report({
                                message: `Using already created build pipeline for docker jvm image of ${repositoryName}...`
                            });
                            try {
                                const pipeline = await ociUtils.getBuildPipeline(provider, folderData.docker_jvmbuildPipeline);
                                if (docker_jvmbuildPipelineName !== pipeline.displayName) {
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
                            logUtils.logInfo(`[deploy] Using already created build pipeline for docker jvm image of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                        } else {
                            // --- Create docker jvm image pipeline
                            progress.report({
                                increment,
                                message: `Creating build pipeline for docker jvm image of ${repositoryName}...`
                            });
                            const docker_jvmbuildPipelineDescription = `Build pipeline to build docker jvm image for devops project ${projectName} & repository ${repositoryName}`;
                            try {
                                logUtils.logInfo(`[deploy] Creating build pipeline for docker jvm image of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                folderData.docker_jvmbuildPipeline = (await ociUtils.createBuildPipeline(provider, projectOCID, docker_jvmbuildPipelineName, docker_jvmbuildPipelineDescription, {
                                    'gcn_tooling_deployID': deployData.tag,
                                    'gcn_tooling_docker_image': 'oci'
                                })).id;
                            } catch (err) {
                                resolve(dialogs.getErrorMessage(`Failed to create docker jvm image build pipeline for ${repositoryName}`, err));
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
                            logUtils.logInfo(`[deploy] Using already created build stage of build pipeline for docker jvm image of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                        } else {
                            try {
                                logUtils.logInfo(`[deploy] Creating build stage of build pipeline for docker jvm image of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                folderData.docker_jvmbuildPipelineBuildStage = (await ociUtils.createBuildPipelineBuildStage(provider, folderData.docker_jvmbuildPipeline, codeRepository.id, repositoryName, codeRepository.httpUrl, `.gcn/${docker_jvmbuildspec_template}`, {
                                    'gcn_tooling_deployID': deployData.tag
                                })).id;
                            } catch (err) {
                                resolve(dialogs.getErrorMessage(`Failed to create docker jvm image pipeline build stage for ${repositoryName}`, err));
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
                            logUtils.logInfo(`[deploy] Using already created artifacts stage of build pipeline for docker jvm image of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                        } else {
                            try {
                                logUtils.logInfo(`[deploy] Creating artifacts stage of build pipeline for docker jvm image of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                folderData.docker_jvmbuildPipelineArtifactsStage = (await ociUtils.createBuildPipelineArtifactsStage(provider, folderData.docker_jvmbuildPipeline, folderData.docker_jvmbuildPipelineBuildStage, folderData.docker_jvmbuildArtifact, docker_jvmbuildArtifactName, {
                                    'gcn_tooling_deployID': deployData.tag
                                })).id;
                            } catch (err) {
                                resolve(dialogs.getErrorMessage(`Failed to create docker jvm image pipeline artifacts stage for ${repositoryName}`, err));
                                folderData.docker_jvmbuildPipelineArtifactsStage = false;
                                dump(deployData);
                                return;
                            }
                            dump(deployData);
                        }

                        // --- Create OKE jvm deployment configuration spec
                        progress.report({
                            increment,
                            message: `Creating OKE jvm deployment configuration development spec for ${repositoryName}...`
                        });
                        const oke_deploy_jvm_config_template = 'oke_deploy_config.yaml';
                        const oke_deployJvmConfigInlineContent = expandTemplate(resourcesPath, oke_deploy_jvm_config_template, {
                            image_name: docker_jvmbuildImage,
                            app_name: repositoryName.toLowerCase()
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
                                folderData.oke_deployJvmConfigArtifact = (await ociUtils.createOkeDeployConfigurationArtifact(provider, projectOCID, oke_deployJvmConfigInlineContent, oke_deployJvmConfigArtifactName, oke_deployJvmConfigArtifactDescription, {
                                    'gcn_tooling_deployID': deployData.tag
                                })).id;
                            } catch (err) {
                                resolve(dialogs.getErrorMessage(`Failed to create OKE jvm deployment configuration artifact for ${repositoryName}`, err));
                                folderData.oke_deployJvmConfigArtifact = false;
                                dump(deployData);
                                return;
                            }
                            dump(deployData);
                        }

                        if (deployData.okeClusterEnvironment) {

                            const oke_deployJvmPipelineName = 'Deploy Docker JVM Image to OKE';
                            if (folderData.oke_deployJvmPipeline) {
                                progress.report({
                                    message: `Using already created deployment to OKE pipeline for docker jvm image of ${repositoryName}...`
                                });
                                try {
                                    const pipeline = await ociUtils.getDeployPipeline(provider, folderData.oke_deployJvmPipeline);
                                    if (oke_deployJvmPipelineName !== pipeline.displayName) {
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
                                logUtils.logInfo(`[deploy] Using already created deployment to OKE pipeline for docker jvm image of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                            } else {
                                // --- Create OKE jvm deployment pipeline
                                progress.report({
                                    increment,
                                    message: `Creating deployment to OKE pipeline for docker jvm image of ${repositoryName}...`
                                });
                                const oke_deployJvmPipelineDescription = `Deployment pipeline to deploy docker jvm image for devops project ${projectName} & repository ${repositoryName} to OKE`;
                                try {
                                    logUtils.logInfo(`[deploy] Creating deployment to OKE pipeline for docker jvm image of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                    folderData.oke_deployJvmPipeline = (await ociUtils.createDeployPipeline(provider, projectOCID, oke_deployJvmPipelineName, oke_deployJvmPipelineDescription, [{
                                        name: 'DOCKER_TAG',
                                        defaultValue: 'latest'
                                    }], {
                                        'gcn_tooling_deployID': deployData.tag,
                                        'gcn_tooling_buildPipelineOCID': folderData.docker_jvmbuildPipeline,
                                        'gcn_tooling_okeDeploymentName': repositoryName.toLowerCase()
                                    })).id;
                                } catch (err) {
                                    resolve(dialogs.getErrorMessage(`Failed to create docker jvm image deployment to OKE pipeline for ${repositoryName}`, err));
                                    folderData.oke_deployJvmPipeline = false;
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
                                logUtils.logInfo(`[deploy] Using already created deploy to OKE stage of deployment to OKE pipeline for docker jvm image of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                            } else {
                                try {
                                    logUtils.logInfo(`[deploy] Creating deploy to OKE stage of deployment to OKE pipeline for docker jvm image of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                    folderData.deployJvmToOkeStage = (await ociUtils.createDeployToOkeStage(provider, folderData.oke_deployJvmPipeline, deployData.okeClusterEnvironment, folderData.oke_deployJvmConfigArtifact, {
                                        'gcn_tooling_deployID': deployData.tag
                                    })).id;
                                } catch (err) {
                                    resolve(dialogs.getErrorMessage(`Failed to create docker jvm image deployment to OKE stage for ${repositoryName}`, err));
                                    folderData.deployJvmToOkeStage = false;
                                    dump(deployData);
                                    return;
                                }
                                dump(deployData);
                            }
                        }
                    }
                }

                // --- Store cloud services configuration (.vscode/gcn.json)
                progress.report({
                    increment,
                    message: `Configuring project services for ${repositoryName}...`
                });
                const data: any = {
                    version: '1.0'
                };
                // GR-41403 - save the default profile for upload to OCI
                data[authentication.getDataName()] = authentication.getData(true);
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
                    }
                }
                logUtils.logInfo(`[deploy] Saving project services configuration for ${deployData.compartment.name}/${projectName}/${repositoryName} into ${repositoryDir}`);
                const saved = saveConfig(repositoryDir, data);
                if (!saved) {
                    resolve(`Failed to save project services configuration for ${repositoryName}.`);
                    return;
                }

                const storage = folderStorage.getDefaultLocation();

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
                const pushErr = await gitUtils.populateNewRepository(codeRepository.sshUrl, repositoryDir, storage);
                if (pushErr) {
                    resolve(`Failed to push source code repository ${repositoryName}: ${pushErr}`);
                    return;
                }
                // GR-41403 - save the real profile for local usage
                data[authentication.getDataName()] = authentication.getData();
                saveConfig(repositoryDir, data);

                try {
                    logUtils.logInfo(`[deploy] Remove incomplete tag for source code repository ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                    await ociUtils.updateCodeRepository(provider, folderData.codeRepository, undefined, undefined, undefined, {
                        'gcn_tooling_deployID': deployData.tag
                    });
                } catch (err) {
                    resolve(dialogs.getErrorMessage(`Failed to remove incomplete tag for source code repository ${repositoryName}`, err));
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
            return 'DevOps project name cannot be empty.'
        }
        if (name.indexOf(' ') !== -1) {
            return 'DevOps project name may not contain spaces.'
        }
        if (name.startsWith('-') || name.endsWith('-')) {
            return 'DevOps project name cannot start or end with \'-\'.'
        }
        if (name.indexOf('--') != -1) {
            return 'DevOps project name cannot contain \'--\'.'
        }
        if (!isNaN(name.charAt(0) as any)) {
            return 'DevOps project name cannot start with a number'
        }
        if (!/.*(?:^[a-zA-Z_](-?[a-zA-Z_0-9])*$).*/g.test(name)) {
            return 'DevOps project name must match ".*(?:^[a-zA-Z_](-?[a-zA-Z_0-9])*$).*"'
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

function expandTemplate(templatesStorage: string, template: string, args: { [key:string] : string }, folder?: vscode.WorkspaceFolder, name?: string): string | undefined {
    const templatespec = path.join(templatesStorage, template);
    let templateString = fs.readFileSync(templatespec).toString();

    templateString = mustache.render(templateString, args)

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
