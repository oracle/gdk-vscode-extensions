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
import * as dialogs from '../dialogs';
import * as folderStorage from '../folderStorage';
import * as projectUtils from '../projectUtils';
import * as ociUtils from './ociUtils';
import * as ociAuthentication from './ociAuthentication';
import * as ociContext from './ociContext';
import * as ociDialogs from './ociDialogs';


export type SaveConfig = (folder: string, config: any) => boolean;

export async function deployFolders(folders: vscode.WorkspaceFolder[], resourcesPath: string, saveConfig: SaveConfig): Promise<undefined> {
    const authentication = ociAuthentication.createDefault();
    const configurationProblem = authentication.getConfigurationProblem();
    if (configurationProblem) {
        vscode.window.showErrorMessage(configurationProblem);
        return undefined;
    }
    const provider = authentication.getProvider();

    const compartment = await ociDialogs.selectCompartment(authentication);
    if (!compartment) {
        return undefined;
    }

    const selectedName = await selectProjectName(folders.length === 1 ? folders[0].name : undefined);
    if (!selectedName) {
        return undefined;
    }
    let projectName = selectedName;

    const okeCluster = await selectOkeCluster(authentication, compartment.ocid, provider.getRegion().regionId);
    if (!okeCluster) {
        return undefined;
    }

    const error: string | undefined = await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Creating devops project',
        cancellable: false
    }, (progress, _token) => {
        return new Promise(async resolve => {
            const increment = 100 / (folders.length * 13 + 10);

            // -- Create notification topic
            progress.report({
                message: 'Setting up notifications...'
            });
            const notificationTopicDescription = `Shared notification topic for devops projects in compartment ${compartment.name}`;
            const notificationTopic = await ociUtils.getOrCreateNotificationTopic(provider, compartment.ocid, notificationTopicDescription);
            if (!notificationTopic) {
                resolve('Failed to prepare notification topic.');
                return;
            }

            // --- Create devops project
            progress.report({
                increment,
                message: 'Creating devops project...'
            });
            
            let createdProject: string | undefined;
            const projectDescription = 'Graal Cloud Native project deployed from the VS Code';
            while (createdProject === undefined) {
                try {
                    createdProject = (await ociUtils.createDevOpsProject(provider, projectName, compartment.ocid, notificationTopic, projectDescription)).project.id;
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
                        resolve('Failed to create devops project.');
                        return;
                    }
                }
            }
            const project = createdProject;

            // --- Create project log
            progress.report({
                increment,
                message: 'Setting up logging...'
            });
            const logGroupDescription = `Shared log group for devops projects in compartment ${compartment.name}`;
            const logGroup = await ociUtils.getDefaultLogGroup(provider, compartment.ocid, true, logGroupDescription);
            if (!logGroup) {
                resolve('Failed to resolve log group.');
                return;
            }
            const logResp = await ociUtils.createProjectLog(provider, compartment.ocid, logGroup, project, projectName);
            if (!logResp) {
                resolve('Failed to create project log.');
                return;
            }

            // --- Create build pipelines dynamic group
            progress.report({
                increment,
                message: 'Setting up dynamic group for build pipelines...'
            });
            const buildPipelinesGroup = await ociUtils.getDefaultBuildPipelinesGroup(provider, compartment.ocid, true).catch(err => {
                vscode.window.showErrorMessage('Failed to resolve group for build pipelines: ' + err.message);
            });

            // --- Create deployment pipelines dynamic group
            progress.report({
                increment,
                message: 'Setting up dynamic group for deployment pipelines...'
            });
            const deployPipelinesGroup = await ociUtils.getDefaultDeployPipelinesGroup(provider, compartment.ocid, true).catch(err => {
                vscode.window.showErrorMessage('Failed to resolve group for deployment pipelines: ' + err.message);
            });

            // --- Create code repositories dynamic group
            progress.report({
                increment,
                message: 'Setting up dynamic group for code repositories...'
            });
            const codeRepositoriesGroup = await ociUtils.getDefaultCodeRepositoriesGroup(provider, compartment.ocid, true).catch(err => {
                vscode.window.showErrorMessage('Failed to resolve group for code repositories: ' + err.message);
            });

            if (buildPipelinesGroup && deployPipelinesGroup && codeRepositoriesGroup) {
                // --- Setting up policy for accessing resources in compartment
                progress.report({
                    increment,
                    message: 'Setting up policy for accessing resources in compartment...'
                });
                const compartmentAccessPolicy = await ociUtils.getCompartmentAccessPolicy(provider, compartment.ocid, buildPipelinesGroup.name, deployPipelinesGroup.name, codeRepositoriesGroup.name, true);
                if (!compartmentAccessPolicy) {
                    resolve('Failed to resolve policy for accessing resources in compartment.');
                    return;
                }
            }

            // --- Create artifact repository
            progress.report({
                increment,
                message: `Creating artifact repository...`
            });
            const artifactsRepository = (await ociUtils.createArtifactsRepository(provider, compartment.ocid, projectName, {
                "gcn_tooling_projectOCID" : project
            }))?.repository.id;
            if (!artifactsRepository) {
                resolve('Failed to create artifact repository.');
                return;
            }

            // --- Create cluster environment
            progress.report({
                increment,
                message: `Creating OKE cluster environment...`
            });
            const okeClusterEnvironment = (await ociUtils.createOkeDeployEnvironment(provider, project, projectName, okeCluster))?.deployEnvironment.id;
            if (!okeClusterEnvironment) {
                resolve('Failed to create OKE cluster environment.');
                return;
            }

            // --- Create a default knowledge base; tie it to a project + mark so it can be recognized later
            // displayName must match ".*(?:^[a-zA-Z_](-?[a-zA-Z_0-9])*$).*"
            progress.report({
                increment,
                message: `Creating ADM knowledge base for ${projectName}...`
            });
            const knowledgeBaseDescription = `Vulnerability audits for devops project ${projectName}`;
            const knowledgeBaseOCID = await ociUtils.createKnowledgeBase(provider, compartment.ocid, projectName, {
                'gcn_tooling_projectOCID': project,
                'gcn_tooling_description': knowledgeBaseDescription,
                'gcn_tooling_usage': 'gcn-adm-audit'
            });

            for (const folder of folders) {
                const repositoryDir = folder.uri.fsPath;
                const repositoryName = folder.name; // TODO: repositoryName should be unique within the devops project

                // --- Create code repository
                progress.report({
                    increment,
                    message: `Creating source code repository ${repositoryName}...`
                });
                const description = `Source code repository ${folder.name}`;
                const codeRepository = (await ociUtils.createCodeRepository(provider, project, repositoryName, 'master', description))?.repository;
                if (!codeRepository) {
                    resolve(`Failed to create source code repository ${repositoryName}.`);
                    return;
                }
                if (!codeRepository.sshUrl || !codeRepository.httpUrl) {
                    resolve(`Failed to resolve URL of source code repository ${repositoryName}.`);
                    return;
                }

                // --- Create container repository
                progress.report({
                    increment,
                    message: `Creating container repository...`
                });
                const containerRepositoryName = folders.length > 1 ? `${projectName}-${repositoryName}` : projectName;
                const containerRepository = (await ociUtils.createContainerRepository(provider, compartment.ocid, projectName, repositoryName, containerRepositoryName))?.containerRepository;
                if (!containerRepository) {
                    resolve(`Failed to create container repository ${containerRepositoryName}.`);
                    return;
                }

                const devbuildspec_template = 'devbuild_spec.yaml';

                // --- Create fat JAR artifact
                progress.report({
                    increment,
                    message: `Creating fat JAR artifact for ${repositoryName}...`
                });
                const devbuildArtifactPath = `${repositoryName}-dev.jar`;
                const devbuildArtifactName = `${repositoryName}_dev_fatjar`;
                const devbuildArtifactDescription = `Fat JAR artifact for devops project ${projectName} & repository ${repositoryName}`;
                const devbuildArtifact = (await ociUtils.createProjectDevArtifact(provider, artifactsRepository, project, devbuildArtifactPath, devbuildArtifactName, devbuildArtifactDescription))?.deployArtifact.id;
                if (!devbuildArtifact) {
                    resolve(`Failed to create fat JAR artifact for ${repositoryName}.`);
                    return;
                }

                // --- Create fat JAR pipeline
                progress.report({
                    increment,
                    message: `Creating build pipeline for fat JARs of ${repositoryName}...`
                });
                const devbuildPipelineName = 'Build Fat JAR';
                const devbuildPipelineDescription = `Build pipeline to build fat JAR for devops project ${projectName} & repository ${repositoryName}`;
                const devbuildPipeline = (await ociUtils.createBuildPipeline(provider, project, devbuildPipelineName, devbuildPipelineDescription))?.buildPipeline.id;
                if (!devbuildPipeline) {
                    resolve(`Failed to create fat JAR pipeline for ${repositoryName}.`);
                    return;
                }
                const devbuildPipelineBuildStage = (await ociUtils.createBuildPipelineBuildStage(provider, devbuildPipeline, codeRepository.id, repositoryName, codeRepository.httpUrl, `.gcn/${devbuildspec_template}`))?.buildPipelineStage.id;
                if (!devbuildPipelineBuildStage) {
                    resolve(`Failed to create fat JAR pipeline build stage for ${repositoryName}.`);
                    return;
                }
                const devbuildPipelineArtifactsStage = (await ociUtils.createBuildPipelineArtifactsStage(provider, devbuildPipeline, devbuildPipelineBuildStage, devbuildArtifact, devbuildArtifactName))?.buildPipelineStage.id;
                if (!devbuildPipelineArtifactsStage) {
                    resolve(`Failed to create fat JAR pipeline artifacts stage for ${repositoryName}.`);
                    return;
                }

                const nibuildspec_template = 'nibuild_spec.yaml';

                // --- Create native image artifact
                progress.report({
                    increment,
                    message: `Creating native executable artifact for ${repositoryName}...`
                });
                const nibuildArtifactPath = `${repositoryName}-dev`;
                const nibuildArtifactName = `${repositoryName}_dev_executable`;
                const nibuildArtifactDescription = `Native executable artifact for devops project ${projectName} & repository ${repositoryName}`;
                const nibuildArtifact = (await ociUtils.createProjectDevArtifact(provider, artifactsRepository, project, nibuildArtifactPath, nibuildArtifactName, nibuildArtifactDescription))?.deployArtifact.id;
                if (!nibuildArtifact) {
                    resolve(`Failed to create native executable artifact for ${repositoryName}.`);
                    return;
                }

                // --- Create native image pipeline
                progress.report({
                    increment,
                    message: `Creating build pipeline for native executables of ${repositoryName}...`
                });
                const nibuildPipelineName = 'Build Native Image';
                const nibuildPipelineDescription = `Build pipeline to build native image executable for devops project ${projectName} & repository ${repositoryName}`;
                const nibuildPipeline = (await ociUtils.createBuildPipeline(provider, project, nibuildPipelineName, nibuildPipelineDescription))?.buildPipeline.id;
                if (!nibuildPipeline) {
                    resolve(`Failed to create native executables pipeline for ${repositoryName}.`);
                    return;
                }
                const nibuildPipelineBuildStage = (await ociUtils.createBuildPipelineBuildStage(provider, nibuildPipeline, codeRepository.id, repositoryName, codeRepository.httpUrl, `.gcn/${nibuildspec_template}`))?.buildPipelineStage.id;
                if (!nibuildPipelineBuildStage) {
                    resolve(`Failed to create native executables pipeline build stage for ${repositoryName}.`);
                    return;
                }
                const nibuildPipelineArtifactsStage = (await ociUtils.createBuildPipelineArtifactsStage(provider, nibuildPipeline, nibuildPipelineBuildStage, nibuildArtifact, nibuildArtifactName))?.buildPipelineStage.id;
                if (!nibuildPipelineArtifactsStage) {
                    resolve(`Failed to create native executables pipeline artifacts stage for ${repositoryName}.`);
                    return;
                }

                const docker_nibuildspec_template = 'docker_nibuild_spec.yaml';

                // --- Create docker native image artifact
                progress.report({
                    increment,
                    message: `Creating docker native executable artifact for ${repositoryName}...`
                });
                let tenancy: string | undefined;
                try {
                    tenancy = (await ociUtils.getTenancy(provider)).name;
                } catch (err) {}
                if (!tenancy) {
                    resolve(`Failed to create docker native executables pipeline for ${repositoryName} - cannot resolve tenancy name.`);
                    return;
                }
                const docker_nibuildImage = `${provider.getRegion().regionCode}.ocir.io/${tenancy}/${containerRepository.displayName}:\${DOCKER_TAG}`;
                const docker_nibuildArtifactName = `${repositoryName}_dev_docker_image`;
                const docker_nibuildArtifactDescription = `Docker native executable artifact for devops project ${projectName} & repository ${repositoryName}`;
                const docker_nibuildArtifact = (await ociUtils.createProjectDockerArtifact(provider, project, docker_nibuildImage, docker_nibuildArtifactName, docker_nibuildArtifactDescription))?.deployArtifact.id;
                if (!docker_nibuildArtifact) {
                    resolve(`Failed to create docker native executable artifact for ${repositoryName}.`);
                    return;
                }

                // --- Create docker native image pipeline
                progress.report({
                    increment,
                    message: `Creating build pipeline for docker native executables of ${repositoryName}...`
                });
                const docker_nibuildPipelineName = 'Build Docker Native Image';
                const docker_nibuildPipelineDescription = `Build pipeline to build docker native executable for devops project ${projectName} & repository ${repositoryName}`;
                const docker_nibuildPipeline = (await ociUtils.createBuildPipeline(provider, project, docker_nibuildPipelineName, docker_nibuildPipelineDescription))?.buildPipeline.id;
                if (!docker_nibuildPipeline) {
                    resolve(`Failed to create docker native executables build pipeline for ${repositoryName}.`);
                    return;
                }
                const docker_nibuildPipelineBuildStage = (await ociUtils.createBuildPipelineBuildStage(provider, docker_nibuildPipeline, codeRepository.id, repositoryName, codeRepository.httpUrl, `.gcn/${docker_nibuildspec_template}`))?.buildPipelineStage.id;
                if (!docker_nibuildPipelineBuildStage) {
                    resolve(`Failed to create docker native executables pipeline build stage for ${repositoryName}.`);
                    return;
                }
                const docker_nibuildPipelineArtifactsStage = (await ociUtils.createBuildPipelineArtifactsStage(provider, docker_nibuildPipeline, docker_nibuildPipelineBuildStage, docker_nibuildArtifact, docker_nibuildArtifactName))?.buildPipelineStage.id;
                if (!docker_nibuildPipelineArtifactsStage) {
                    resolve(`Failed to create docker native executables pipeline artifacts stage for ${repositoryName}.`);
                    return;
                }

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
                const oke_deployConfigArtifact = (await ociUtils.createOkeDeployConfigurationArtifact(provider, project, oke_deployConfigInlineContent, oke_deployConfigArtifactName, oke_deployConfigArtifactDescription))?.deployArtifact.id;
                if (!oke_deployConfigArtifact) {
                    resolve(`Failed to create OKE deployment configuration artifact for ${repositoryName}.`);
                    return;
                }

                // --- Create OKE deployment pipeline
                progress.report({
                    increment,
                    message: `Creating deployment to OKE pipeline for docker native executables of ${repositoryName}...`
                });
                const oke_deployPipelineName = 'Deploy Docker Native Image to OKE';
                const oke_deployPipelineDescription = `Deployment pipeline to deploy docker native executable for devops project ${projectName} & repository ${repositoryName} to OKE`;
                const oke_deployPipeline = (await ociUtils.createDeployPipeline(provider, project, oke_deployPipelineName, oke_deployPipelineDescription, [{
                    name: 'DOCKER_TAG',
                    defaultValue: 'latest'
                }], {
                    'gcn_tooling_buildPipelineOCID': docker_nibuildPipeline,
                    'gcn_tooling_okeDeploymentName': repositoryName.toLowerCase()
                }))?.deployPipeline.id;
                if (!oke_deployPipeline) {
                    resolve(`Failed to create docker native executables deployment to OKE pipeline for ${repositoryName}.`);
                    return;
                }
                const oke_deployPipelineStage = (await ociUtils.createDeployToOkeStage(provider, oke_deployPipeline, okeClusterEnvironment, oke_deployConfigArtifact))?.deployStage.id;
                if (!oke_deployPipelineStage) {
                    resolve(`Failed to create docker native executables deployment to OKE stage for ${repositoryName}.`);
                    return;
                }

                // --- Generate build specs
                progress.report({
                    increment,
                    message: `Creating build specs for source code repository ${repositoryName}...`
                });
                const project_devbuild_command = projectUtils.getProjectBuildCommand(folder);
                if (!project_devbuild_command) {
                    return `Failed to resolve project devbuild command for folder ${folder.uri.fsPath}`;
                }
                const project_devbuild_artifact_location = await projectUtils.getProjectBuildArtifactLocation(folder);
                if (!project_devbuild_artifact_location) {
                    return `Failed to resolve project devbuild artifact for folder ${folder.uri.fsPath}`;
                }
                const devbuildTemplate = expandTemplate(resourcesPath, devbuildspec_template, {
                    project_build_command: project_devbuild_command,
                    project_artifact_location: project_devbuild_artifact_location,
                    deploy_artifact_name: devbuildArtifactName
                }, folder);
                if (!devbuildTemplate) {
                    resolve(`Failed to configure devbuild build spec for ${repositoryName}`);
                    return;
                }
                const project_build_native_executable_command = projectUtils.getProjectBuildNativeExecutableCommand(folder);
                if (!project_build_native_executable_command) {
                    return `Failed to resolve project build native executable command for folder ${folder.uri.fsPath}`;
                }
                const project_native_executable_artifact_location = await projectUtils.getProjectNativeExecutableArtifactLocation(folder);
                if (!project_native_executable_artifact_location) {
                    return `Failed to resolve project native executable artifact for folder ${folder.uri.fsPath}`;
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

                // --- Store cloud services configuration (.vscode/gcn.json)
                progress.report({
                    increment,
                    message: `Configuring project services for ${repositoryName}...`
                });
                const data: any = {
                    version: '1.0'
                };
                data[authentication.getDataName()] = authentication.getData();
                const oci = new ociContext.Context(authentication, compartment.ocid, project, codeRepository.id);
                data[oci.getDataName()] = oci.getData();
                data.services = {
                    // TODO: Might use populated instance of buildServices.Service as dataSupport.DataProducer
                    buildPipelines: {
                        items: [
                            {
                                'ocid': devbuildPipeline,
                                'displayName': devbuildPipelineName
                            },
                            {
                                'ocid': nibuildPipeline,
                                'displayName': nibuildPipelineName
                            },
                            {
                                'ocid': docker_nibuildPipeline,
                                'displayName': docker_nibuildPipelineName
                            }
                        ]
                    },
                    // TODO: Might use populated instance of deploymentServices.Service as dataSupport.DataProducer
                    deploymentPipelines: {
                        items: [
                            {
                                'ocid': oke_deployPipeline,
                                'displayName': oke_deployPipelineName
                            }
                        ]
                    },
                    // TODO: Might use populated instance of knowledgeBaseServices.Service as dataSupport.DataProducer
                    knowledgeBases: {
                        settings: {
                            folderAuditsKnowledgeBase: knowledgeBaseOCID
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
                const pushErr = await gitUtils.populateNewRepository(codeRepository.sshUrl, repositoryDir, storage);
                if (pushErr) {
                    resolve(`Failed to push ${repositoryName}: ${pushErr}`);
                    return;
                }

            }

            resolve(undefined);
            return;
        });
    });

    if (error) {
        vscode.window.showErrorMessage(error);
        return undefined;
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

async function selectOkeCluster(authentication: ociAuthentication.Authentication, compartmentID: string, region: string): Promise<string | undefined> {
    const choices: dialogs.QuickPickObject[] | undefined = await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Reading available OKE clusters...',
        cancellable: false
    }, (_progress, _token) => {
        return new Promise(async resolve => {
            ociUtils.listClusters(authentication.getProvider(), compartmentID).then(clusters => {
                if (!clusters) {
                    resolve(undefined);
                } else {
                    const choices: dialogs.QuickPickObject[] = [];
                    for (const cluster of clusters.items) {
                        if (cluster.name && cluster.id && cluster.lifecycleState === 'ACTIVE') {
                            choices.push(new dialogs.QuickPickObject(cluster.name, undefined, undefined, cluster.id));
                        }
                    }
                    resolve(choices);
                }
            });
        });
    });

    if (!choices) {
        vscode.window.showErrorMessage('Failed to read OKE clusters.');
        return undefined;
    }

    if (choices.length === 0) {
        const createOption = 'Quick Create Cluster';
        if (createOption === await vscode.window.showWarningMessage('No OKE cluster available.', createOption)) {
            dialogs.openInBrowser(`https://cloud.oracle.com/containers/clusters/quick?region=${region}`);
        }
        return undefined;
    }

    if (choices.length === 1) {
        return choices[0].object;
    }

    const choice = await vscode.window.showQuickPick(choices, {
        placeHolder: 'Select OKE Cluster'
    });

    return choice ? choice.object : undefined;
}

function expandTemplate(templatesStorage: string, template: string, args: { [key:string] : string }, folder?: vscode.WorkspaceFolder): string | undefined {
    const templatespec = path.join(templatesStorage, template);
    let templateString = fs.readFileSync(templatespec).toString();

    templateString = mustache.render(templateString, args)

    if (folder) {
        const dest = path.join(folder.uri.fsPath, '.gcn');
        if (!fs.existsSync(dest)) {
            fs.mkdirSync(dest);
        }
        const templatedest = path.join(dest, template);
        fs.writeFileSync(templatedest, templateString);
    }
    return templateString;
}
