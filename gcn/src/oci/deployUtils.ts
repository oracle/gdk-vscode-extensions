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
import * as ociUtils from './ociUtils';
import * as ociAuthentication from './ociAuthentication';
import * as ociContext from './ociContext';
import * as ociDialogs from './ociDialogs';
import * as sshUtils from './sshUtils';
import * as okeUtils from './okeUtils';


export type SaveConfig = (folder: string, config: any) => boolean;

export async function deployFolders(folders: model.DeployFolder[], resourcesPath: string, saveConfig: SaveConfig): Promise<undefined> {
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

    const selectedName = await selectProjectName(folders.length === 1 ? folders[0].folder.name : undefined);
    if (!selectedName) {
        return undefined;
    }
    let projectName = selectedName;

    const error: string | undefined = await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Creating devops project',
        cancellable: false
    }, (progress, _token) => {
        return new Promise(async resolve => {
            let totalSteps = folders.reduce((total, current) => {
                total += 3; // code repository, cloud services config, populating code repository
                if (current.projectInfo.projectType === 'GCN') {
                    total += 7; // Jar artifact, build spec and pipeline, NI artifact, build spec and pipeline, OKE deploy config
                    if (deployData.okeCluster) {
                        total += 1; // deploy to OKE pipeline
                    }
                    total += 4 * projectUtils.getCloudSpecificSubProjectNames(current).length; // Docker image, build spec, and pipeline, container repository per cloud specific subproject
                } else if (current.projectInfo.projectType === 'Micronaut') {
                    total += 11; // Jar artifact, build spec and pipeline, NI artifact, build spec and pipeline, Docker image, build spec and pipeline, OKE deploy config, container repository
                    if (deployData.okeCluster) {
                        total += 1; // deploy to OKE pipeline
                    }
                }
                return total;
            }, 0);
            totalSteps += 10; // notification topic, devops project, project log, dynamic groups and policies, artifact repository, OKE cluster environment, knowledge base
            const increment = 100 / totalSteps;

            // -- Create notification topic
            progress.report({
                message: 'Setting up notifications...'
            });
            const notificationTopicDescription = `Shared notification topic for devops projects in compartment ${deployData.compartment.name}`;
            try {
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
            
            const projectDescription = folders.length === 1 ? `${folders[0].projectInfo.projectType} project deployed from the VS Code`: 'Project deployed from the VS Code';
            while (deployData.project === undefined) {
                try {
                    deployData.project = (await ociUtils.createDevOpsProject(provider, projectName, deployData.compartment.ocid, deployData.notificationTopic, projectDescription)).id;
                } catch (err) {
                    const message: string | undefined = (err as any).message;
                    if (message && message.indexOf('project name already exists') !== -1) {
                        vscode.window.showWarningMessage(`Project name '${projectName}' already exists in the tenancy.`);
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
            const buildPipelinesGroup = await ociUtils.getDefaultBuildPipelinesGroup(provider, deployData.compartment.ocid, true).catch(err => {
                dialogs.showErrorMessage('Failed to resolve group for build pipelines', err);
            });

            // --- Create deployment pipelines dynamic group
            progress.report({
                increment,
                message: 'Setting up dynamic group for deployment pipelines...'
            });
            const deployPipelinesGroup = await ociUtils.getDefaultDeployPipelinesGroup(provider, deployData.compartment.ocid, true).catch(err => {
                dialogs.showErrorMessage('Failed to resolve group for deployment pipelines', err);
            });

            // --- Create code repositories dynamic group
            progress.report({
                increment,
                message: 'Setting up dynamic group for code repositories...'
            });
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

            for (const deployFolder of folders) {
                const folder = deployFolder.folder;
                const repositoryDir = folder.uri.fsPath;
                const repositoryName = folder.name; // TODO: repositoryName should be unique within the devops project
                const buildPipelines = [];
                const deployPipelines = [];

                // --- Create code repository
                progress.report({
                    increment,
                    message: `Creating source code repository ${repositoryName}...`
                });
                const description = `Source code repository ${folder.name}`;
                let codeRepository;
                try {
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
                    const r = /ssh:\/\/([^/]+)\//.exec(codeRepository.sshUrl);
                    if (r && r.length == 2) {
                        const hostname = r[1];
                        const autoAccept = sshUtils.isAutoAcceptHostFingerprint();
                        let success = autoAccept ? 1 : await sshUtils.addCloudKnownHosts(hostname, true);
                        if (success == -1) {
                            const disableHosts = await vscode.window.showWarningMessage(
                                "Do you want to disable SSH known_hosts checking for OCI infrastructure ?\n" +
                                "This is less secure than adding host keys to known_hosts. The change will affect only connections to SCM OCI services.",
                                "Yes", "No");
                            if ("Yes" === disableHosts) {
                                if (await sshUtils.addAutoAcceptHostFingerprintForCloud()) {
                                    success = 0;
                                }
                            }
                        }
                        if (success == -1) {
                            vscode.window.showWarningMessage("SSH utilities required for host key management are not available. Some Git operations may fail. See https://code.visualstudio.com/docs/remote/troubleshooting#_installing-a-supported-ssh-client for the recommended software.");
                        }
                    }
                }

                // --- Create fat JAR artifact
                progress.report({
                    increment,
                    message: `Creating fat JAR artifact for ${repositoryName}...`
                });
                const devbuildArtifactPath = `${repositoryName}-dev.jar`;
                const devbuildArtifactName = `${repositoryName}_dev_fatjar`;
                const devbuildArtifactDescription = `Fat JAR artifact for devops project ${projectName} & repository ${repositoryName}`;
                let devbuildArtifact;
                try {
                    devbuildArtifact = (await ociUtils.createProjectDevArtifact(provider, deployData.artifactsRepository, deployData.project, devbuildArtifactPath, devbuildArtifactName, devbuildArtifactDescription)).id;
                } catch (err) {
                    resolve(dialogs.getErrorMessage(`Failed to create fat JAR artifact for ${repositoryName}`, err));
                    return;
                }

                const devbuildspec_template = 'devbuild_spec.yaml';

                // --- Generate fat JAR build spec
                progress.report({
                    increment,
                    message: `Creating fat JAR build spec for source code repository ${repositoryName}...`
                });
                const project_devbuild_command = projectUtils.getProjectBuildCommand(deployFolder);
                if (!project_devbuild_command) {
                    return `Failed to resolve fat JAR build command for folder ${folder.uri.fsPath}`;
                }
                const project_devbuild_artifact_location = await projectUtils.getProjectBuildArtifactLocation(deployFolder);
                if (!project_devbuild_artifact_location) {
                    return `Failed to resolve fat JAR artifact for folder ${folder.uri.fsPath}`;
                }
                const devbuildTemplate = expandTemplate(resourcesPath, devbuildspec_template, {
                    project_build_command: project_devbuild_command,
                    project_artifact_location: project_devbuild_artifact_location,
                    deploy_artifact_name: devbuildArtifactName
                }, folder);
                if (!devbuildTemplate) {
                    resolve(`Failed to configure fat JAR build spec for ${repositoryName}`);
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
                    devbuildPipeline = (await ociUtils.createBuildPipeline(provider, deployData.project, devbuildPipelineName, devbuildPipelineDescription)).id;
                } catch (err) {
                    resolve(dialogs.getErrorMessage(`Failed to create fat JAR pipeline for ${repositoryName}`, err));
                    return;
                }
                let devbuildPipelineBuildStage;
                try {
                    devbuildPipelineBuildStage = (await ociUtils.createBuildPipelineBuildStage(provider, devbuildPipeline, codeRepository.id, repositoryName, codeRepository.httpUrl, `.gcn/${devbuildspec_template}`)).id;
                } catch (err) {
                    resolve(dialogs.getErrorMessage(`Failed to create fat JAR pipeline build stage for ${repositoryName}`, err));
                    return;
                }
                try {
                    await ociUtils.createBuildPipelineArtifactsStage(provider, devbuildPipeline, devbuildPipelineBuildStage, devbuildArtifact, devbuildArtifactName);
                } catch (err) {
                    resolve(dialogs.getErrorMessage(`Failed to create fat JAR pipeline artifacts stage for ${repositoryName}`, err));
                    return;
                }
                buildPipelines.push({ 'ocid': devbuildPipeline, 'displayName': devbuildPipelineName });

                // --- Create native image artifact
                progress.report({
                    increment,
                    message: `Creating native executable artifact for ${repositoryName}...`
                });
                const nibuildArtifactPath = `${repositoryName}-dev`;
                const nibuildArtifactName = `${repositoryName}_dev_executable`;
                const nibuildArtifactDescription = `Native executable artifact for devops project ${projectName} & repository ${repositoryName}`;
                let nibuildArtifact;
                try {
                    nibuildArtifact = (await ociUtils.createProjectDevArtifact(provider, deployData.artifactsRepository, deployData.project, nibuildArtifactPath, nibuildArtifactName, nibuildArtifactDescription)).id;
                } catch (err) {
                    resolve(dialogs.getErrorMessage(`Failed to create native executable artifact for ${repositoryName}`, err));
                    return;
                }

                const nibuildspec_template = 'nibuild_spec.yaml';

                // --- Generate native image build spec
                progress.report({
                    increment,
                    message: `Creating native executable build spec for source code repository ${repositoryName}...`
                });
                const project_build_native_executable_command = projectUtils.getProjectBuildNativeExecutableCommand(deployFolder);
                if (!project_build_native_executable_command) {
                    return `Failed to resolve native executable build command for folder ${folder.uri.fsPath}`;
                }
                const project_native_executable_artifact_location = await projectUtils.getProjectNativeExecutableArtifactLocation(deployFolder);
                if (!project_native_executable_artifact_location) {
                    return `Failed to resolve native executable artifact for folder ${folder.uri.fsPath}`;
                }
                const nibuildTemplate = expandTemplate(resourcesPath, nibuildspec_template, {
                    project_build_command: project_build_native_executable_command,
                    project_artifact_location: project_native_executable_artifact_location,
                    deploy_artifact_name: nibuildArtifactName
                }, folder);
                if (!nibuildTemplate) {
                    resolve(`Failed to configure native executable build spec for ${repositoryName}`);
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
                    nibuildPipeline = (await ociUtils.createBuildPipeline(provider, deployData.project, nibuildPipelineName, nibuildPipelineDescription)).id;
                } catch (err) {
                    resolve(dialogs.getErrorMessage(`Failed to create native executables pipeline for ${repositoryName}`, err));
                    return;
                }
                let nibuildPipelineBuildStage;
                try {
                    nibuildPipelineBuildStage = (await ociUtils.createBuildPipelineBuildStage(provider, nibuildPipeline, codeRepository.id, repositoryName, codeRepository.httpUrl, `.gcn/${nibuildspec_template}`)).id;
                } catch (err) {
                    resolve(dialogs.getErrorMessage(`Failed to create native executables pipeline build stage for ${repositoryName}`, err));
                    return;
                }
                try {
                    await ociUtils.createBuildPipelineArtifactsStage(provider, nibuildPipeline, nibuildPipelineBuildStage, nibuildArtifact, nibuildArtifactName);
                } catch (err) {
                    resolve(dialogs.getErrorMessage(`Failed to create native executables pipeline artifacts stage for ${repositoryName}`, err));
                    return;
                }
                buildPipelines.push({ 'ocid': nibuildPipeline, 'displayName': nibuildPipelineName });

                let tenancy: string | undefined;
                try {
                    tenancy = (await ociUtils.getTenancy(provider)).name;
                } catch (err) {}
                if (!tenancy) {
                    resolve(`Failed to create docker native executables pipeline for ${repositoryName} - cannot resolve tenancy name.`);
                    return;
                }

                if (deployFolder.projectInfo.projectType === 'Micronaut') {
                    // --- Create container repository
                    progress.report({
                        increment,
                        message: `Creating container repository for ${repositoryName}...`
                    });
                    const containerRepositoryName = folders.length > 1 ? `${projectName}-${repositoryName}` : projectName;
                    let containerRepository;
                    try {
                        containerRepository = await ociUtils.createContainerRepository(provider, deployData.compartment.ocid, containerRepositoryName);
                    } catch (err) {
                        resolve(dialogs.getErrorMessage(`Failed to create container repository ${containerRepositoryName}`, err));
                        return;
                    }

                    // --- Create docker native image artifact
                    progress.report({
                        increment,
                        message: `Creating docker native executable artifact for ${repositoryName}...`
                    });
                    const docker_nibuildImage = `${provider.getRegion().regionCode}.ocir.io/${tenancy}/${containerRepository.displayName}:\${DOCKER_TAG}`;
                    const docker_nibuildArtifactName = `${repositoryName}_dev_docker_image`;
                    const docker_nibuildArtifactDescription = `Docker native executable artifact for devops project ${projectName} & repository ${repositoryName}`;
                    let docker_nibuildArtifact;
                    try {
                        docker_nibuildArtifact = (await ociUtils.createProjectDockerArtifact(provider, deployData.project, docker_nibuildImage, docker_nibuildArtifactName, docker_nibuildArtifactDescription)).id;
                    } catch (err) {
                        resolve(dialogs.getErrorMessage(`Failed to create docker native executable artifact for ${repositoryName}`, err));
                        return;
                    }

                    const docker_nibuildspec_template = 'docker_nibuild_spec.yaml';

                    // --- Generate native image build spec
                    progress.report({
                        increment,
                        message: `Creating docker native executable build spec for source code repository ${repositoryName}...`
                    });
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

                    // --- Create docker native image pipeline
                    progress.report({
                        increment,
                        message: `Creating build pipeline for docker native executable of ${repositoryName}...`
                    });
                    const docker_nibuildPipelineName = 'Build Docker Native Image';
                    const docker_nibuildPipelineDescription = `Build pipeline to build docker native executable for devops project ${projectName} & repository ${repositoryName}`;
                    let docker_nibuildPipeline;
                    try {
                        docker_nibuildPipeline = (await ociUtils.createBuildPipeline(provider, deployData.project, docker_nibuildPipelineName, docker_nibuildPipelineDescription, {
                            'gcn_tooling_docker_image': 'oci'
                        })).id;
                    } catch (err) {
                        resolve(dialogs.getErrorMessage(`Failed to create docker native executable build pipeline for ${repositoryName}`, err));
                        return;
                    }
                    let docker_nibuildPipelineBuildStage;
                    try {
                        docker_nibuildPipelineBuildStage = (await ociUtils.createBuildPipelineBuildStage(provider, docker_nibuildPipeline, codeRepository.id, repositoryName, codeRepository.httpUrl, `.gcn/${docker_nibuildspec_template}`)).id;
                    } catch (err) {
                        resolve(dialogs.getErrorMessage(`Failed to create docker native executable pipeline build stage for ${repositoryName}`, err));
                        return;
                    }
                    try {
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
                            await ociUtils.createDeployToOkeStage(provider, oke_deployPipeline, deployData.okeClusterEnvironment, oke_deployConfigArtifact);
                        } catch (err) {
                            resolve(dialogs.getErrorMessage(`Failed to create docker native executables deployment to OKE stage for ${repositoryName}`, err));
                            return;
                        }
                        deployPipelines.push({ 'ocid': oke_deployPipeline, 'displayName': oke_deployPipelineName });
                    }
                } else if (deployFolder.projectInfo.projectType === 'GCN') {
                    for (const subName of projectUtils.getCloudSpecificSubProjectNames(deployFolder)) {
                        if (subName !== 'app') {
                            // --- Create container repository
                            progress.report({
                                increment,
                                message: `Creating container repository for ${repositoryName}...`
                            });
                            const containerRepositoryName = folders.length > 1 ? `${projectName}-${repositoryName}-${subName}` : `${projectName}-${subName}`;
                            let containerRepository;
                            try {
                                containerRepository = await ociUtils.createContainerRepository(provider, deployData.compartment.ocid, containerRepositoryName);
                            } catch (err) {
                                resolve(dialogs.getErrorMessage(`Failed to create container repository ${containerRepositoryName}`, err));
                                return;
                            }

                            // --- Create docker native image artifact
                            progress.report({
                                increment,
                                message: `Creating ${subName} docker native executable artifact for ${repositoryName}...`
                            });
                            const docker_nibuildImage = `${provider.getRegion().regionCode}.ocir.io/${tenancy}/${containerRepository.displayName}:\${DOCKER_TAG}`;
                            const docker_nibuildArtifactName = `${repositoryName}_dev_${subName}_docker_image`;
                            const docker_nibuildArtifactDescription = `Docker native executable artifact for ${subName.toUpperCase()} & devops project ${projectName} & repository ${repositoryName}`;
                            let docker_nibuildArtifact;
                            try {
                                docker_nibuildArtifact = (await ociUtils.createProjectDockerArtifact(provider, deployData.project, docker_nibuildImage, docker_nibuildArtifactName, docker_nibuildArtifactDescription)).id;
                            } catch (err) {
                                resolve(dialogs.getErrorMessage(`Failed to create ${subName} docker native executable artifact for ${repositoryName}`, err));
                                return;
                            }

                            const docker_nibuildspec_template = 'docker_nibuild_spec.yaml';

                            // --- Generate docker native image build spec
                            progress.report({
                                increment,
                                message: `Creating ${subName} docker native executable build spec for source code repository ${repositoryName}...`
                            });
                            const project_build_native_executable_command = projectUtils.getProjectBuildNativeExecutableCommand(deployFolder, subName);
                            if (!project_build_native_executable_command) {
                                return `Failed to resolve native executable build command for folder ${folder.uri.fsPath}`;
                            }
                            const project_native_executable_artifact_location = await projectUtils.getProjectNativeExecutableArtifactLocation(deployFolder, subName);
                            if (!project_native_executable_artifact_location) {
                                return `Failed to resolve native executable artifact for folder ${folder.uri.fsPath}`;
                            }
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

                            // --- Create docker native image pipeline
                            progress.report({
                                increment,
                                message: `Creating build pipeline for ${subName} docker native executable of ${repositoryName}...`
                            });
                            const docker_nibuildPipelineName = `Build ${subName.toUpperCase()} Docker Native Image`;
                            const docker_nibuildPipelineDescription = `Build pipeline to build docker native executable for ${subName.toUpperCase()} & devops project ${projectName} & repository ${repositoryName}`;
                            let docker_nibuildPipeline;
                            try {
                                docker_nibuildPipeline = (await ociUtils.createBuildPipeline(provider, deployData.project, docker_nibuildPipelineName, docker_nibuildPipelineDescription, {
                                    'gcn_tooling_docker_image': subName.toLowerCase()
                                })).id;
                            } catch (err) {
                                resolve(dialogs.getErrorMessage(`Failed to create ${subName} docker native executable build pipeline for ${repositoryName}`, err));
                                return;
                            }
                            let docker_nibuildPipelineBuildStage;
                            try {
                                docker_nibuildPipelineBuildStage = (await ociUtils.createBuildPipelineBuildStage(provider, docker_nibuildPipeline, codeRepository.id, repositoryName, codeRepository.httpUrl, `.gcn/${subName}_${docker_nibuildspec_template}`)).id;
                            } catch (err) {
                                resolve(dialogs.getErrorMessage(`Failed to create ${subName} docker native executable pipeline build stage for ${repositoryName}`, err));
                                return;
                            }
                            try {
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

                    // Add /bin folders created by EDT to .gitignore
                    gitUtils.addGitIgnoreEntry(folder.uri.fsPath, '**/bin');
                }

                const docker_ni_file = 'Dockerfile.native';
                const docker_niFile = expandTemplate(resourcesPath, docker_ni_file, {}, folder);
                if (!docker_niFile) {
                    resolve(`Failed to configure docker native file for ${repositoryName}`);
                    return;
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
                await ociUtils.completion(2000, async () => (await ociUtils.getCodeRepository(provider, repositoryId)).lifecycleState, true);
                const pushErr = await gitUtils.populateNewRepository(codeRepository.sshUrl, repositoryDir, storage);
                if (pushErr) {
                    resolve(`Failed to push ${repositoryName}: ${pushErr}`);
                    return;
                }

            }

            if (!deployData.knowledgeBaseOCID) {
                if (!knowledgeCompleted) {
                    progress.report({
                        increment,
                        message: `Still waiting for ADM knowledge for ${projectName} to be created...`
                    });
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
