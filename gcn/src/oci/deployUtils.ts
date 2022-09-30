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
import * as projectUtils from '../projectUtils';
import * as dialogs from '../dialogs';
import * as logUtils from '../logUtils';
import * as ociUtils from './ociUtils';
import * as ociAuthentication from './ociAuthentication';
import * as ociContext from './ociContext';
import * as ociDialogs from './ociDialogs';
import * as sshUtils from './sshUtils';
import * as okeUtils from './okeUtils';


export type SaveConfig = (folder: string, config: any) => boolean;

export async function deployFolders(folders: vscode.WorkspaceFolder[], resourcesPath: string, saveConfig: SaveConfig): Promise<undefined> {
    logUtils.logInfo('[deploy] Invoked create new devops project');
    
    const authentication = await ociAuthentication.resolve();
    if (!authentication) {
        return undefined;
    }
    const configurationProblem = authentication.getConfigurationProblem();
    if (configurationProblem) {
        dialogs.showErrorMessage(configurationProblem);
        return undefined;
    }
    const provider = authentication.getProvider();
    const deployData: any = {};

    deployData.compartment = await ociDialogs.selectCompartment(provider);
    if (!deployData.compartment) {
        return undefined;
    }

    deployData.okeCluster = await okeUtils.selectOkeCluster(provider, deployData.compartment.ocid, provider.getRegion().regionId, true, deployData.compartment.name, true);
    if (deployData.okeCluster === undefined) {
        return undefined;
    }

    const selectedName = await selectProjectName(folders.length === 1 ? folders[0].name : undefined);
    if (!selectedName) {
        return undefined;
    }
    let projectName = selectedName;

    logUtils.logInfo(`[deploy] Configured to create devops project '${projectName}' with ${folders.length} code repository(s) in compartment '${deployData.compartment.name}', OKE cluster ${deployData.okeCluster ? 'selected' : 'not selected'}`);

    const error: string | undefined = await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Creating devops project',
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
                const projectFolder = await projectUtils.getProjectFolder(folder);
                projectFolders.push(projectFolder);
                totalSteps += 3; // code repository, cloud services config, populating code repository
                if (projectFolder.projectType === 'GCN') {
                    totalSteps += 7; // Jar artifact, build spec and pipeline, NI artifact, build spec and pipeline, OKE deploy config
                    if (deployData.okeCluster) {
                        totalSteps += 1; // deploy to OKE pipeline
                    }
                    totalSteps += 4 * projectUtils.getCloudSpecificSubProjectNames(projectFolder).length; // Docker image, build spec, and pipeline, container repository per cloud specific subproject
                } else if (projectFolder.projectType === 'Micronaut' || projectFolder.projectType === 'SpringBoot') {
                    totalSteps += 11; // Jar artifact, build spec and pipeline, NI artifact, build spec and pipeline, Docker image, build spec and pipeline, OKE deploy config, container repository
                    if (deployData.okeCluster) {
                        totalSteps += 1; // deploy to OKE pipeline
                    }
                } else {
                    const baLocation = await projectUtils.getProjectBuildArtifactLocation(projectFolder);
                    const buildCommand = baLocation ? await projectUtils.getProjectBuildCommand(projectFolder) : undefined;
                    if (buildCommand) {
                        totalSteps += 3; // Jar artifact, build spec and pipeline
                        buildCommands.set(projectFolder, buildCommand);
                    }
                    const niLocation = await projectUtils.getProjectNativeExecutableArtifactLocation(projectFolder);
                    const niBuildCommand = niLocation ? await projectUtils.getProjectBuildNativeExecutableCommand(projectFolder) : undefined;
                    if (niBuildCommand) {
                        totalSteps += 8; // NI artifact, build spec and pipeline, Docker image, build spec and pipeline, OKE deploy config, container repository
                        niBuildCommands.set(projectFolder, niBuildCommand);
                    }
                    if (!buildCommand && !niBuildCommand) {
                        resolve(`Cannot deploy unsupported project without build or native image build command specified: ${folder.name}`);
                        return;
                    }
                }
            }
            totalSteps += 10; // notification topic, devops project, project log, dynamic groups and policies, artifact repository, OKE cluster environment, knowledge base
            const increment = 100 / totalSteps;

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
            const projectDescription = projectFolders.length === 1 ? `${projectFolders[0].projectType} project deployed from the VS Code`: 'Project deployed from the VS Code';
            while (deployData.project === undefined) {
                try {
                    logUtils.logInfo(`[deploy] Creating devops project ${deployData.compartment.name}/${projectName}`);
                    deployData.project = (await ociUtils.createDevOpsProject(provider, projectName, deployData.compartment.ocid, deployData.notificationTopic, projectDescription)).id;
                } catch (err) {
                    const message: string | undefined = (err as any).message;
                    if (message && message.indexOf('project name already exists') !== -1) {
                        vscode.window.showWarningMessage(`Project name '${projectName}' already exists in the tenancy.`);
                        logUtils.logInfo(`[deploy] Project name '${projectName}' already exists in the tenancy`);
                        const newName = await selectProjectName(projectName);
                        if (!newName) {
                            resolve(undefined);
                            return;
                        }
                        projectName = newName;
                    } else {
                        resolve(dialogs.getErrorMessage('Failed to create devops project', err));
                        return;
                    }
                }
            }

            // --- Create project log
            progress.report({
                increment,
                message: 'Setting up logging...'
            });
            const logGroupDescription = `Shared log group for devops projects in compartment ${deployData.compartment.name}`;
            let logGroup: string | undefined;
            try {
                logUtils.logInfo(`[deploy] Setting up logging for ${deployData.compartment.name}/${projectName}`);
                logGroup = await ociUtils.getDefaultLogGroup(provider, deployData.compartment.ocid, true, logGroupDescription);
            } catch (err) {
                resolve(dialogs.getErrorMessage('Failed to resolve log group', err));
                return;
            }
            if (!logGroup) {
                resolve('Failed to resolve log group.');
                return;
            }
            try {
                logUtils.logInfo(`[deploy] Creating project log for ${deployData.compartment.name}/${projectName}`);
                await ociUtils.createProjectLog(provider, deployData.compartment.ocid, logGroup, deployData.project, projectName);
            } catch (err) {
                resolve(dialogs.getErrorMessage('Failed to create project log', err));
                return;
            }

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

            // --- Create artifact repository
            progress.report({
                increment,
                message: `Creating artifact repository...`
            });
            try {
                logUtils.logInfo(`[deploy] Creating artifact repository for ${deployData.compartment.name}/${projectName}`);
                deployData.artifactsRepository = (await ociUtils.createArtifactsRepository(provider, deployData.compartment.ocid, projectName, {
                    "gcn_tooling_projectOCID" : deployData.project
                })).id;
            } catch (err) {
                resolve(dialogs.getErrorMessage('Failed to create artifact repository', err));
                return;
            }

            if (deployData.okeCluster) {
                // --- Create cluster environment
                progress.report({
                    increment,
                    message: `Creating OKE cluster environment...`
                });
                try {
                    logUtils.logInfo(`[deploy] Creating OKE cluster environment for ${deployData.compartment.name}/${projectName}`);
                    deployData.okeClusterEnvironment = (await ociUtils.createOkeDeployEnvironment(provider, deployData.project, projectName, deployData.okeCluster)).id;
                } catch (err) {
                    resolve(dialogs.getErrorMessage('Failed to create OKE cluster environment', err));
                    return;
                }
            }

            // --- Create a default knowledge base; tie it to a project + mark so it can be recognized later
            // displayName must match ".*(?:^[a-zA-Z_](-?[a-zA-Z_0-9])*$).*"
            progress.report({
                increment,
                message: `Creating ADM knowledge base for ${projectName}...`
            });
            const knowledgeBaseDescription = `Vulnerability audits for devops project ${projectName}`;
            
            let knowledgeCompleted : boolean = false;
            let knowledgePromise;
            try {
                logUtils.logInfo(`[deploy] Creating ADM knowledge base for ${deployData.compartment.name}/${projectName}`);
                const workRequestId = await ociUtils.createKnowledgeBase(provider, deployData.compartment?.ocid || "", projectName, {
                    'gcn_tooling_projectOCID': deployData.project,
                    'gcn_tooling_description': knowledgeBaseDescription,
                    'gcn_tooling_usage': 'gcn-adm-audit'
                });
                knowledgePromise = ociUtils.admWaitForResourceCompletionStatus(provider, `Knowledge base for project ${projectName}`, workRequestId).
                    then(ocid => {
                        deployData.knowledgeBaseOCID = ocid;
                    }).finally(() => knowledgeCompleted = true);
            } catch (err) {
                resolve(dialogs.getErrorMessage('Failed to create knowledge base', err));
                return;
           }

            for (const folder of projectFolders) {
                const repositoryDir = folder.uri.fsPath;
                const repositoryName = folder.name; // TODO: repositoryName should be unique within the devops project
                const buildPipelines = [];
                const deployPipelines = [];

                logUtils.logInfo(`[deploy] Deploying folder ${repositoryDir}`);

                // --- Create code repository
                progress.report({
                    increment,
                    message: `Creating source code repository ${repositoryName}...`
                });
                const description = `Source code repository ${folder.name}`;
                let codeRepository;
                try {
                    logUtils.logInfo(`[deploy] Creating source code repository ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                    codeRepository = await ociUtils.createCodeRepository(provider, deployData.project, repositoryName, 'master', description, false);
                } catch (err) {
                    resolve(dialogs.getErrorMessage(`Failed to create source code repository ${repositoryName}`, err));
                    return;
                }
                if (!codeRepository.sshUrl || !codeRepository.httpUrl) {
                    resolve(`Failed to resolve URL of source code repository ${repositoryName}.`);
                    return;
                }

                if (codeRepository.sshUrl) {
                    await sshUtils.checkSshConfigured(codeRepository.sshUrl);
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

                    // --- Create fat JAR artifact
                    progress.report({
                        increment,
                        message: `Creating fat JAR artifact for ${repositoryName}...`
                    });
                    const devbuildArtifactPath = `${repositoryName}-dev.jar`;
                    const devbuildArtifactDescription = `Fat JAR artifact for devops project ${projectName} & repository ${repositoryName}`;
                    let devbuildArtifact;
                    try {
                        logUtils.logInfo(`[deploy] Creating fat JAR artifact for ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                        devbuildArtifact = (await ociUtils.createProjectDevArtifact(provider, deployData.artifactsRepository, deployData.project, devbuildArtifactPath, devbuildArtifactName, devbuildArtifactDescription)).id;
                    } catch (err) {
                        resolve(dialogs.getErrorMessage(`Failed to create fat JAR artifact for ${repositoryName}`, err));
                        return;
                    }

                    // --- Create fat JAR pipeline
                    progress.report({
                        increment,
                        message: `Creating build pipeline for fat JARs of ${repositoryName}...`
                    });
                    const devbuildPipelineName = 'Build Fat JAR';
                    const devbuildPipelineDescription = `Build pipeline to build fat JAR for devops project ${projectName} & repository ${repositoryName}`;
                    let devbuildPipeline;
                    try {
                        logUtils.logInfo(`[deploy] Creating build pipeline for fat JARs of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                        devbuildPipeline = (await ociUtils.createBuildPipeline(provider, deployData.project, devbuildPipelineName, devbuildPipelineDescription)).id;
                    } catch (err) {
                        resolve(dialogs.getErrorMessage(`Failed to create fat JAR pipeline for ${repositoryName}`, err));
                        return;
                    }
                    let devbuildPipelineBuildStage;
                    try {
                        logUtils.logInfo(`[deploy] Creating build stage of build pipeline for fat JARs of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                        devbuildPipelineBuildStage = (await ociUtils.createBuildPipelineBuildStage(provider, devbuildPipeline, codeRepository.id, repositoryName, codeRepository.httpUrl, `.gcn/${devbuildspec_template}`)).id;
                    } catch (err) {
                        resolve(dialogs.getErrorMessage(`Failed to create fat JAR pipeline build stage for ${repositoryName}`, err));
                        return;
                    }
                    try {
                        logUtils.logInfo(`[deploy] Creating artifacts stage of build pipeline for fat JARs of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                        await ociUtils.createBuildPipelineArtifactsStage(provider, devbuildPipeline, devbuildPipelineBuildStage, devbuildArtifact, devbuildArtifactName);
                    } catch (err) {
                        resolve(dialogs.getErrorMessage(`Failed to create fat JAR pipeline artifacts stage for ${repositoryName}`, err));
                        return;
                    }
                    buildPipelines.push({ 'ocid': devbuildPipeline, 'displayName': devbuildPipelineName });
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

                    // --- Create native image artifact
                    progress.report({
                        increment,
                        message: `Creating native executable artifact for ${repositoryName}...`
                    });
                    const nibuildArtifactPath = `${repositoryName}-dev`;
                    const nibuildArtifactDescription = `Native executable artifact for devops project ${projectName} & repository ${repositoryName}`;
                    let nibuildArtifact;
                    try {
                        logUtils.logInfo(`[deploy] Creating native executable artifact for ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                        nibuildArtifact = (await ociUtils.createProjectDevArtifact(provider, deployData.artifactsRepository, deployData.project, nibuildArtifactPath, nibuildArtifactName, nibuildArtifactDescription)).id;
                    } catch (err) {
                        resolve(dialogs.getErrorMessage(`Failed to create native executable artifact for ${repositoryName}`, err));
                        return;
                    }

                    // --- Create native image pipeline
                    progress.report({
                        increment,
                        message: `Creating build pipeline for native executables of ${repositoryName}...`
                    });
                    const nibuildPipelineName = 'Build Native Image';
                    const nibuildPipelineDescription = `Build pipeline to build native image executable for devops project ${projectName} & repository ${repositoryName}`;
                    let nibuildPipeline;
                    try {
                        logUtils.logInfo(`[deploy] Creating build pipeline for native executables of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                        nibuildPipeline = (await ociUtils.createBuildPipeline(provider, deployData.project, nibuildPipelineName, nibuildPipelineDescription)).id;
                    } catch (err) {
                        resolve(dialogs.getErrorMessage(`Failed to create native executables pipeline for ${repositoryName}`, err));
                        return;
                    }
                    let nibuildPipelineBuildStage;
                    try {
                        logUtils.logInfo(`[deploy] Creating build stage of build pipeline for native executables o ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                        nibuildPipelineBuildStage = (await ociUtils.createBuildPipelineBuildStage(provider, nibuildPipeline, codeRepository.id, repositoryName, codeRepository.httpUrl, `.gcn/${nibuildspec_template}`)).id;
                    } catch (err) {
                        resolve(dialogs.getErrorMessage(`Failed to create native executables pipeline build stage for ${repositoryName}`, err));
                        return;
                    }
                    try {
                        logUtils.logInfo(`[deploy] Creating artifacts stage of build pipeline for native executables of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                        await ociUtils.createBuildPipelineArtifactsStage(provider, nibuildPipeline, nibuildPipelineBuildStage, nibuildArtifact, nibuildArtifactName);
                    } catch (err) {
                        resolve(dialogs.getErrorMessage(`Failed to create native executables pipeline artifacts stage for ${repositoryName}`, err));
                        return;
                    }
                    buildPipelines.push({ 'ocid': nibuildPipeline, 'displayName': nibuildPipelineName });
                }

                let tenancy: string | undefined;
                try {
                    logUtils.logInfo(`[deploy] Resolving tenancy name`);
                    tenancy = (await ociUtils.getTenancy(provider)).name;
                } catch (err) {}
                if (!tenancy) {
                    resolve(`Failed to create docker native executables pipeline for ${repositoryName} - cannot resolve tenancy name.`);
                    return;
                }

                if (folder.projectType === 'GCN') {
                    logUtils.logInfo(`[deploy] Recognized GCN project in ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                    for (const subName of projectUtils.getCloudSpecificSubProjectNames(folder)) {
                        if (subName !== 'app') {
                            logUtils.logInfo(`[deploy] Setting up GCN ${subName} project resources for ${deployData.compartment.name}/${projectName}/${repositoryName}`);

                            // --- Create container repository
                            progress.report({
                                increment,
                                message: `Creating container repository for ${repositoryName}...`
                            });
                            const containerRepositoryName = folders.length > 1 ? `${projectName}-${repositoryName}-${subName}` : `${projectName}-${subName}`;
                            let containerRepository;
                            try {
                                logUtils.logInfo(`[deploy] Creating container repository for ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                containerRepository = await ociUtils.createContainerRepository(provider, deployData.compartment.ocid, containerRepositoryName);
                            } catch (err) {
                                resolve(dialogs.getErrorMessage(`Failed to create container repository ${containerRepositoryName}`, err));
                                return;
                            }

                            // --- Generate docker native image build spec
                            progress.report({
                                increment,
                                message: `Creating ${subName} docker native executable build spec for source code repository ${repositoryName}...`
                            });
                            const docker_nibuildspec_template = 'docker_nibuild_spec.yaml';
                            const docker_nibuildArtifactName = `${repositoryName}_dev_${subName}_docker_image`;
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
                                    image_name: containerRepository.displayName.toLowerCase()
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

                                // --- Create docker native image artifact
                                progress.report({
                                    increment,
                                    message: `Creating ${subName} docker native executable artifact for ${repositoryName}...`
                                });
                                const docker_nibuildImage = `${provider.getRegion().regionCode}.ocir.io/${tenancy}/${containerRepository.displayName}:\${DOCKER_TAG}`;
                                const docker_nibuildArtifactDescription = `Docker native executable artifact for ${subName.toUpperCase()} & devops project ${projectName} & repository ${repositoryName}`;
                                let docker_nibuildArtifact;
                                try {
                                    logUtils.logInfo(`[deploy] Creating ${subName} docker native executable artifact for ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                    docker_nibuildArtifact = (await ociUtils.createProjectDockerArtifact(provider, deployData.project, docker_nibuildImage, docker_nibuildArtifactName, docker_nibuildArtifactDescription)).id;
                                } catch (err) {
                                    resolve(dialogs.getErrorMessage(`Failed to create ${subName} docker native executable artifact for ${repositoryName}`, err));
                                    return;
                                }

                                // --- Create docker native image pipeline
                                progress.report({
                                    increment,
                                    message: `Creating build pipeline for ${subName} docker native executable of ${repositoryName}...`
                                });
                                const docker_nibuildPipelineName = `Build ${subName.toUpperCase()} Docker Native Image`;
                                const docker_nibuildPipelineDescription = `Build pipeline to build docker native executable for ${subName.toUpperCase()} & devops project ${projectName} & repository ${repositoryName}`;
                                let docker_nibuildPipeline;
                                try {
                                    logUtils.logInfo(`[deploy] Creating build pipeline for ${subName} docker native executable of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                    docker_nibuildPipeline = (await ociUtils.createBuildPipeline(provider, deployData.project, docker_nibuildPipelineName, docker_nibuildPipelineDescription, {
                                        'gcn_tooling_docker_image': subName.toLowerCase()
                                    })).id;
                                } catch (err) {
                                    resolve(dialogs.getErrorMessage(`Failed to create ${subName} docker native executable build pipeline for ${repositoryName}`, err));
                                    return;
                                }
                                let docker_nibuildPipelineBuildStage;
                                try {
                                    logUtils.logInfo(`[deploy] Creating build stage of build pipeline for ${subName} docker native executable of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                    docker_nibuildPipelineBuildStage = (await ociUtils.createBuildPipelineBuildStage(provider, docker_nibuildPipeline, codeRepository.id, repositoryName, codeRepository.httpUrl, `.gcn/${subName}_${docker_nibuildspec_template}`)).id;
                                } catch (err) {
                                    resolve(dialogs.getErrorMessage(`Failed to create ${subName} docker native executable pipeline build stage for ${repositoryName}`, err));
                                    return;
                                }
                                try {
                                    logUtils.logInfo(`[deploy] Creating artifacts stage of build pipeline for ${subName} docker native executable of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                    await ociUtils.createBuildPipelineArtifactsStage(provider, docker_nibuildPipeline, docker_nibuildPipelineBuildStage, docker_nibuildArtifact, docker_nibuildArtifactName);
                                } catch (err) {
                                    resolve(dialogs.getErrorMessage(`Failed to create ${subName} docker native executable pipeline artifacts stage for ${repositoryName}`, err));
                                    return;
                                }

                                if (subName === 'oci') {
                                    buildPipelines.push({ 'ocid': docker_nibuildPipeline, 'displayName': docker_nibuildPipelineName });

                                    // --- Create OKE deployment configuration artifact
                                    progress.report({
                                        increment,
                                        message: `Creating OKE deployment configuration artifact for ${repositoryName}...`
                                    });
                                    const oke_deploy_config_template = 'oke_deploy_config.yaml';
                                    const oke_deployConfigInlineContent = expandTemplate(resourcesPath, oke_deploy_config_template, {
                                        image_name: docker_nibuildImage,
                                        app_name: repositoryName.toLowerCase()
                                    });
                                    if (!oke_deployConfigInlineContent) {
                                        resolve(`Failed to configure OKE deployment configuration for ${repositoryName}`);
                                        return;
                                    }
                                    const oke_deployConfigArtifactName = `${repositoryName}_oke_deploy_configuration`;
                                    const oke_deployConfigArtifactDescription = `OKE deployment configuration artifact for devops project ${projectName} & repository ${repositoryName}`;
                                    let oke_deployConfigArtifact;
                                    try {
                                        logUtils.logInfo(`[deploy] Creating OKE deployment configuration artifact for ${subName} of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                        oke_deployConfigArtifact = (await ociUtils.createOkeDeployConfigurationArtifact(provider, deployData.project, oke_deployConfigInlineContent, oke_deployConfigArtifactName, oke_deployConfigArtifactDescription)).id;
                                    } catch (err) {
                                        resolve(dialogs.getErrorMessage(`Failed to create OKE deployment configuration artifact for ${repositoryName}`, err));
                                        return;
                                    }

                                    if (deployData.okeClusterEnvironment) {

                                        // --- Create OKE deployment pipeline
                                        progress.report({
                                            increment,
                                            message: `Creating deployment to OKE pipeline for ${subName} docker native executables of ${repositoryName}...`
                                        });
                                        const oke_deployPipelineName = 'Deploy OCI Docker Native Image to OKE';
                                        const oke_deployPipelineDescription = `Deployment pipeline to deploy docker native executable for OCI & devops project ${projectName} & repository ${repositoryName} to OKE`;
                                        let oke_deployPipeline;
                                        try {
                                            logUtils.logInfo(`[deploy] Creating deployment to OKE pipeline for ${subName} docker native executables of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                            oke_deployPipeline = (await ociUtils.createDeployPipeline(provider, deployData.project, oke_deployPipelineName, oke_deployPipelineDescription, [{
                                                name: 'DOCKER_TAG',
                                                defaultValue: 'latest'
                                            }], {
                                                'gcn_tooling_buildPipelineOCID': docker_nibuildPipeline,
                                                'gcn_tooling_okeDeploymentName': repositoryName.toLowerCase()
                                            })).id;
                                        } catch (err) {
                                            resolve(dialogs.getErrorMessage(`Failed to create ${subName} docker native executables deployment to OKE pipeline for ${repositoryName}`, err));
                                            return;
                                        }
                                        try {
                                            logUtils.logInfo(`[deploy] Creating deploy to OKE stage of deployment to OKE pipeline for ${subName} docker native executables of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                            await ociUtils.createDeployToOkeStage(provider, oke_deployPipeline, deployData.okeClusterEnvironment, oke_deployConfigArtifact);
                                        } catch (err) {
                                            resolve(dialogs.getErrorMessage(`Failed to create ${subName} docker native executables deployment to OKE stage for ${repositoryName}`, err));
                                            return;
                                        }
                                        deployPipelines.push({ 'ocid': oke_deployPipeline, 'displayName': oke_deployPipelineName });
                                    }
                                }
                            }
                        }
                    }

                    // Add /bin folders created by EDT to .gitignore
                    gitUtils.addGitIgnoreEntry(folder.uri.fsPath, '**/bin');

                } else { // Micronaut, SpringBoot, other Java projects
                    logUtils.logInfo(`[deploy] ${folder.projectType !== 'Unknown' ? folder.projectType : 'Recognized '}${folder.projectType} project in ${deployData.compartment.name}/${projectName}/${repositoryName}`);

                    // --- Create container repository
                    progress.report({
                        increment,
                        message: `Creating container repository for ${repositoryName}...`
                    });
                    const containerRepositoryName = folders.length > 1 ? `${projectName}-${repositoryName}` : projectName;
                    let containerRepository;
                    try {
                        logUtils.logInfo(`[deploy] Creating container repository for ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                        containerRepository = await ociUtils.createContainerRepository(provider, deployData.compartment.ocid, containerRepositoryName);
                    } catch (err) {
                        resolve(dialogs.getErrorMessage(`Failed to create container repository ${containerRepositoryName}`, err));
                        return;
                    }

                    if (project_native_executable_artifact_location && project_build_native_executable_command) {

                        // --- Generate docker native image build spec
                        progress.report({
                            increment,
                            message: `Creating docker native executable build spec for source code repository ${repositoryName}...`
                        });
                        const docker_nibuildspec_template = 'docker_nibuild_spec.yaml';
                        const docker_nibuildArtifactName = `${repositoryName}_dev_docker_image`;
                        logUtils.logInfo(`[deploy] Creating docker native executable build spec for ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                        const docker_nibuildTemplate = expandTemplate(resourcesPath, docker_nibuildspec_template, {
                            project_build_command: project_build_native_executable_command,
                            project_artifact_location: project_native_executable_artifact_location,
                            deploy_artifact_name: docker_nibuildArtifactName,
                            image_name: containerRepository.displayName.toLowerCase()
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

                        // --- Create docker native image artifact
                        progress.report({
                            increment,
                            message: `Creating docker native executable artifact for ${repositoryName}...`
                        });
                        const docker_nibuildImage = `${provider.getRegion().regionCode}.ocir.io/${tenancy}/${containerRepository.displayName}:\${DOCKER_TAG}`;
                        const docker_nibuildArtifactDescription = `Docker native executable artifact for devops project ${projectName} & repository ${repositoryName}`;
                        let docker_nibuildArtifact;
                        try {
                            logUtils.logInfo(`[deploy] Creating docker native executable artifact for ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                            docker_nibuildArtifact = (await ociUtils.createProjectDockerArtifact(provider, deployData.project, docker_nibuildImage, docker_nibuildArtifactName, docker_nibuildArtifactDescription)).id;
                        } catch (err) {
                            resolve(dialogs.getErrorMessage(`Failed to create docker native executable artifact for ${repositoryName}`, err));
                            return;
                        }

                        // --- Create docker native image pipeline
                        progress.report({
                            increment,
                            message: `Creating build pipeline for docker native executable of ${repositoryName}...`
                        });
                        const docker_nibuildPipelineName = 'Build Docker Native Image';
                        const docker_nibuildPipelineDescription = `Build pipeline to build docker native executable for devops project ${projectName} & repository ${repositoryName}`;
                        let docker_nibuildPipeline;
                        try {
                            logUtils.logInfo(`[deploy] Creating build pipeline for docker native executable of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                            docker_nibuildPipeline = (await ociUtils.createBuildPipeline(provider, deployData.project, docker_nibuildPipelineName, docker_nibuildPipelineDescription, {
                                'gcn_tooling_docker_image': 'oci'
                            })).id;
                        } catch (err) {
                            resolve(dialogs.getErrorMessage(`Failed to create docker native executable build pipeline for ${repositoryName}`, err));
                            return;
                        }
                        let docker_nibuildPipelineBuildStage;
                        try {
                            logUtils.logInfo(`[deploy] Creating build stage of build pipeline for docker native executable of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                            docker_nibuildPipelineBuildStage = (await ociUtils.createBuildPipelineBuildStage(provider, docker_nibuildPipeline, codeRepository.id, repositoryName, codeRepository.httpUrl, `.gcn/${docker_nibuildspec_template}`)).id;
                        } catch (err) {
                            resolve(dialogs.getErrorMessage(`Failed to create docker native executable pipeline build stage for ${repositoryName}`, err));
                            return;
                        }
                        try {
                            logUtils.logInfo(`[deploy] Creating artifacts stage of build pipeline for docker native executable of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                            await ociUtils.createBuildPipelineArtifactsStage(provider, docker_nibuildPipeline, docker_nibuildPipelineBuildStage, docker_nibuildArtifact, docker_nibuildArtifactName);
                        } catch (err) {
                            resolve(dialogs.getErrorMessage(`Failed to create docker native executable pipeline artifacts stage for ${repositoryName}`, err));
                            return;
                        }
                        buildPipelines.push({ 'ocid': docker_nibuildPipeline, 'displayName': docker_nibuildPipelineName });

                        // --- Create OKE deployment configuration artifact
                        progress.report({
                            increment,
                            message: `Creating OKE deployment configuration artifact for ${repositoryName}...`
                        });
                        const oke_deploy_config_template = 'oke_deploy_config.yaml';
                        const oke_deployConfigInlineContent = expandTemplate(resourcesPath, oke_deploy_config_template, {
                            image_name: docker_nibuildImage,
                            app_name: repositoryName.toLowerCase()
                        });
                        if (!oke_deployConfigInlineContent) {
                            resolve(`Failed to configure OKE deployment configuration for ${repositoryName}`);
                            return;
                        }
                        const oke_deployConfigArtifactName = `${repositoryName}_oke_deploy_configuration`;
                        const oke_deployConfigArtifactDescription = `OKE deployment configuration artifact for devops project ${projectName} & repository ${repositoryName}`;
                        let oke_deployConfigArtifact;
                        try {
                            logUtils.logInfo(`[deploy] Creating OKE deployment configuration artifact for ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                            oke_deployConfigArtifact = (await ociUtils.createOkeDeployConfigurationArtifact(provider, deployData.project, oke_deployConfigInlineContent, oke_deployConfigArtifactName, oke_deployConfigArtifactDescription)).id;
                        } catch (err) {
                            resolve(dialogs.getErrorMessage(`Failed to create OKE deployment configuration artifact for ${repositoryName}`, err));
                            return;
                        }

                        if (deployData.okeClusterEnvironment) {

                            // --- Create OKE deployment pipeline
                            progress.report({
                                increment,
                                message: `Creating deployment to OKE pipeline for docker native executables of ${repositoryName}...`
                            });
                            const oke_deployPipelineName = 'Deploy Docker Native Image to OKE';
                            const oke_deployPipelineDescription = `Deployment pipeline to deploy docker native executable for devops project ${projectName} & repository ${repositoryName} to OKE`;
                            let oke_deployPipeline;
                            try {
                                logUtils.logInfo(`[deploy] Creating deployment to OKE pipeline for docker native executables of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                oke_deployPipeline = (await ociUtils.createDeployPipeline(provider, deployData.project, oke_deployPipelineName, oke_deployPipelineDescription, [{
                                    name: 'DOCKER_TAG',
                                    defaultValue: 'latest'
                                }], {
                                    'gcn_tooling_buildPipelineOCID': docker_nibuildPipeline,
                                    'gcn_tooling_okeDeploymentName': repositoryName.toLowerCase()
                                })).id;
                            } catch (err) {
                                resolve(dialogs.getErrorMessage(`Failed to create docker native executables deployment to OKE pipeline for ${repositoryName}`, err));
                                return;
                            }
                            try {
                                logUtils.logInfo(`[deploy] Creating deploy to OKE stage of deployment to OKE pipeline for docker native executables of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                await ociUtils.createDeployToOkeStage(provider, oke_deployPipeline, deployData.okeClusterEnvironment, oke_deployConfigArtifact);
                            } catch (err) {
                                resolve(dialogs.getErrorMessage(`Failed to create docker native executables deployment to OKE stage for ${repositoryName}`, err));
                                return;
                            }
                            deployPipelines.push({ 'ocid': oke_deployPipeline, 'displayName': oke_deployPipelineName });
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
                const oci = new ociContext.Context(authentication, deployData.compartment.ocid, deployData.project, codeRepository.id);
                data[oci.getDataName()] = oci.getData();
                data.services = {
                    // TODO: Might use populated instance of buildServices.Service as dataSupport.DataProducer
                    buildPipelines: {
                        items: buildPipelines
                    },
                    // TODO: Might use populated instance of deploymentServices.Service as dataSupport.DataProducer
                    deploymentPipelines: {
                        items: deployPipelines
                    },
                    // TODO: Might use populated instance of knowledgeBaseServices.Service as dataSupport.DataProducer
                    knowledgeBases: {
                        settings: {
                            folderAuditsKnowledgeBase: deployData.knowledgeBaseOCID
                        }
                    },
                };
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
                const repositoryId = codeRepository.id;
                logUtils.logInfo(`[deploy] Waiting for source code repository ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                await ociUtils.completion(2000, async () => (await ociUtils.getCodeRepository(provider, repositoryId)).lifecycleState, true);
                logUtils.logInfo(`[deploy] Populating source code repository ${deployData.compartment.name}/${projectName}/${repositoryName} from ${repositoryDir}`);
                const pushErr = await gitUtils.populateNewRepository(codeRepository.sshUrl, repositoryDir, storage);
                if (pushErr) {
                    resolve(`Failed to push source code repository ${repositoryName}: ${pushErr}`);
                    return;
                }
                // GR-41403 - save the real profile for local usage
                data[authentication.getDataName()] = authentication.getData();
                saveConfig(repositoryDir, data);
            }

            if (!deployData.knowledgeBaseOCID) {
                if (!knowledgeCompleted) {
                    progress.report({
                        increment,
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
    } else {
        logUtils.logInfo(`[deploy] New devops project successfully created`);
    }

    return undefined;
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
        // TODO: check that the name is "ASCII letter, digit, '_' (underscore) or '-' (hyphen) characters"
        return undefined;
    }
    let projectName = await vscode.window.showInputBox({
        title: 'Provide Unique DevOps Project Name',
        value: suggestedName,
        validateInput: input => validateProjectName(input),
    });
    if (projectName) {
        projectName = projectName.replace(/\s+/g, '');
    }
    return projectName;
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
