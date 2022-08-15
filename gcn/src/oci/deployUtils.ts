/*
 * Copyright (c) 2022, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as gitUtils from '../gitUtils'
import * as dialogs from '../dialogs';
import * as projectUtils from '../projectUtils';
import * as importUtils from './importUtils';
import * as ociUtils from './ociUtils';
import * as ociAuthentication from './ociAuthentication';
import * as ociContext from './ociContext';


export type SaveConfig = (folder: string, config: any) => boolean;

export async function deployFolders(resourcesPath: string, saveConfig: SaveConfig): Promise<undefined> {
    const authentication = ociAuthentication.createDefault();
    const configurationProblem = authentication.getConfigurationProblem();
    if (configurationProblem) {
        vscode.window.showErrorMessage(configurationProblem);
        return undefined;
    }
    const provider = authentication.getProvider();

    const compartment = await importUtils.selectCompartment(authentication);
    if (!compartment) {
        return undefined;
    }

    const folders = await selectFolders();
    if (!folders || folders.length === 0) {
        return undefined;
    }

    // TODO: project name must be unique in the compartment!
    //       (read existing project names in advance & check)
    let projectName: string;
    if (folders.length === 1) {
        projectName = folders[0].name;
    } else {
        const selectedName = await selectProjectName();
        if (!selectedName) {
            return;
        }
        projectName = selectedName;
    }

    const error: string | undefined = await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Creating devops project ${projectName}`,
        cancellable: false
    }, (progress, _token) => {
        return new Promise(async resolve => {
            // -- Create notification topic
            progress.report({
                increment: 5,
                message: 'Setting up notifications...'
            });
            const notificationTopic = await ociUtils.getNotificationTopic(provider, compartment, true);
            if (!notificationTopic) {
                resolve('Failed to prepare notification topic.');
                return;
            }

            // --- Create devops project
            progress.report({
                increment: 5,
                message: 'Creating devops project...'
            });
            const project = (await ociUtils.createDevOpsProject(provider, projectName, compartment, notificationTopic))?.project.id;
            if (!project) {
                resolve('Failed to create devops project.');
                return;
            }

            // --- Create project log
            progress.report({
                increment: 5,
                message: 'Setting up logging...'
            });
            const logGroup = await ociUtils.getDefaultLogGroup(provider, compartment, true);
            if (!logGroup) {
                resolve('Failed to resolve log group.');
                return;
            }
            const logResp = await ociUtils.createProjectLog(provider, compartment, logGroup, project, projectName);
            if (!logResp) {
                resolve('Failed to create project log.');
                return;
            }

            // --- Create build pipelines dynamic group
            progress.report({
                increment: 5,
                message: 'Setting up dynamic group for build pipelines...'
            });
            const buildPipelinesGroup = await ociUtils.getDefaultBuildPipelinesGroup(provider, compartment, true).catch(err => {
                vscode.window.showErrorMessage('Failed to resolve group for build pipelines: ' + err.message);
            });

            // --- Create build pipelines dynamic group
            progress.report({
                increment: 5,
                message: 'Setting up dynamic group for code repositories...'
            });
            const codeRepositoriesGroup = await ociUtils.getDefaultCodeRepositoriesGroup(provider, compartment, true).catch(err => {
                vscode.window.showErrorMessage('Failed to resolve group for code repositories: ' + err.message);
            });

            if (buildPipelinesGroup && codeRepositoriesGroup) {
                // --- Setting up policy for accessing resources in compartment
                progress.report({
                    increment: 5,
                    message: 'Setting up policy for accessing resources in compartment...'
                });
                const compartmentAccessPolicy = await ociUtils.getCompartmentAccessPolicy(provider, compartment, buildPipelinesGroup.name, codeRepositoriesGroup.name, true);
                if (!compartmentAccessPolicy) {
                    resolve('Failed to resolve policy for accessing resources in compartment.');
                    return;
                }
            }

            // --- Create artifact repository
            progress.report({
                increment: 5,
                message: `Creating artifact repository...`
            });
            const artifactsRepository = (await ociUtils.createArtifactsRepository(provider, compartment, projectName, {
                "gcn_tooling_projectOCID" : project
            }))?.repository.id;
            if (!artifactsRepository) {
                resolve('Failed to create artifact repository.');
                return;
            }

            // --- Create container repository
            progress.report({
                increment: 5,
                message: `Creating container repository...`
            });
            const containerRepository = (await ociUtils.createContainerRepository(provider, compartment, projectName))?.containerRepository;
            if (!containerRepository) {
                resolve('Failed to create container repository.');
                return;
            }
            for (const folder of folders) {
                const repositoryDir = folder.uri.fsPath;
                const repositoryName = folder.name;

                // --- Create code repository
                progress.report({
                    increment: 5,
                    message: `Creating source code repository ${repositoryName}...`
                });
                const codeRepository = (await ociUtils.createCodeRepository(provider, project, repositoryName, 'master'))?.repository;
                if (!codeRepository) {
                    resolve(`Failed to create source code repository ${repositoryName}.`);
                    return;
                }
                if (!codeRepository.sshUrl || !codeRepository.httpUrl) {
                    resolve(`Failed to resolve URL of source code repository ${repositoryName}.`);
                    return;
                }

                const devbuildspec_template = 'devbuild_spec.yaml';

                // --- Create devbuild artifact
                progress.report({
                    increment: 5,
                    message: `Creating devbuild artifacts for ${repositoryName}...`
                });
                const devbuildArtifactPath = `${projectName}-dev.jar`;
                const devbuildArtifactName = `${projectName}_dev_fatjar`;
                const devbuildArtifactDescription = `Devbuild artifact for project ${projectName} & repository ${repositoryName}`;
                const devbuildArtifact = (await ociUtils.createProjectDevArtifact(provider, artifactsRepository, project, devbuildArtifactPath, devbuildArtifactName, devbuildArtifactDescription))?.deployArtifact.id;
                if (!devbuildArtifact) {
                    resolve(`Failed to create devbuild artifacts for ${repositoryName}.`);
                    return;
                }

                // --- Create devbuild pipeline
                progress.report({
                    increment: 5,
                    message: `Creating build pipeline for devbuilds of ${repositoryName}...`
                });
                const devbuildPipeline = (await ociUtils.createBuildPipeline(provider, project, 'DevbuildPipeline'))?.buildPipeline.id;
                if (!devbuildPipeline) {
                    resolve(`Failed to create devbuild pipeline for ${repositoryName}.`);
                    return;
                }
                const devbuildPipelineBuildStage = (await ociUtils.createBuildPipelineBuildStage(provider, devbuildPipeline, codeRepository.id, repositoryName, codeRepository.httpUrl, `.gcn/${devbuildspec_template}`))?.buildPipelineStage.id;
                if (!devbuildPipelineBuildStage) {
                    resolve(`Failed to create devbuild pipeline build stage for ${repositoryName}.`);
                    return;
                }
                const devbuildPipelineArtifactsStage = (await ociUtils.createBuildPipelineArtifactsStage(provider, devbuildPipeline, devbuildPipelineBuildStage, devbuildArtifact, devbuildArtifactName))?.buildPipelineStage.id;
                if (!devbuildPipelineArtifactsStage) {
                    resolve(`Failed to create devbuild pipeline artifacts stage for ${repositoryName}.`);
                    return;
                }

                const nibuildspec_template = 'nibuild_spec.yaml';

                // --- Create native image artifact
                progress.report({
                    increment: 5,
                    message: `Creating native executable artifacts for ${repositoryName}...`
                });
                const nibuildArtifactPath = `${projectName}-dev`;
                const nibuildArtifactName = `${projectName}_dev_executable`;
                const nibuildArtifactDescription = `Native executable artifact for project ${projectName} & repository ${repositoryName}`;
                const nibuildArtifact = (await ociUtils.createProjectDevArtifact(provider, artifactsRepository, project, nibuildArtifactPath, nibuildArtifactName, nibuildArtifactDescription))?.deployArtifact.id;
                if (!nibuildArtifact) {
                    resolve(`Failed to create native executable artifacts for ${repositoryName}.`);
                    return;
                }

                // --- Create native image pipeline
                progress.report({
                    increment: 5,
                    message: `Creating build pipeline for native executables of ${repositoryName}...`
                });
                const nibuildPipeline = (await ociUtils.createBuildPipeline(provider, project, 'NativeImagePipeline'))?.buildPipeline.id;
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
                    increment: 5,
                    message: `Creating docker native executable artifacts for ${repositoryName}...`
                });
                const tenancy = (await ociUtils.getTenancy(provider))?.tenancy.name;
                const docker_nibuildImage = `${provider.getRegion().regionCode}.ocir.io/${tenancy}/${containerRepository.displayName}:dev`;
                const docker_nibuildArtifactName = `${projectName}_dev_docker_image`;
                const docker_nibuildArtifactDescription = `Docker native executable artifact for project ${projectName} & repository ${repositoryName}`;
                const docker_nibuildArtifact = (await ociUtils.createProjectDockerArtifact(provider, project, docker_nibuildImage, docker_nibuildArtifactName, docker_nibuildArtifactDescription))?.deployArtifact.id;
                if (!docker_nibuildArtifact) {
                    resolve(`Failed to create docker native executable artifacts for ${repositoryName}.`);
                    return;
                }

                // --- Create docker native image pipeline
                progress.report({
                    increment: 5,
                    message: `Creating build pipeline for docker native executables of ${repositoryName}...`
                });
                const docker_nibuildPipeline = (await ociUtils.createBuildPipeline(provider, project, 'DockerNativeImagePipeline'))?.buildPipeline.id;
                if (!docker_nibuildPipeline) {
                    resolve(`Failed to create docker native executables pipeline for ${repositoryName}.`);
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

                // --- Generate build specs
                progress.report({
                    increment: 5,
                    message: `Creating build specs for source code repository ${repositoryName}...`
                });
                const project_devbuild_command = projectUtils.getProjectBuildCommand(folder);
                if (!project_devbuild_command) {
                    return `Failed to resolve project devbuild command for folder ${folder.uri.fsPath}`;
                }
                const project_devbuild_artifact_location = projectUtils.getProjectBuildArtifactLocation(folder);
                if (!project_devbuild_artifact_location) {
                    return `Failed to resolve project devbuild artifact for folder ${folder.uri.fsPath}`;
                }
                const devbuildTemplateError = expandTemplate(devbuildspec_template, folder, project_devbuild_command, project_devbuild_artifact_location, devbuildArtifactName, resourcesPath);
                if (devbuildTemplateError) {
                    resolve(`Failed to configure devbuild build spec for ${repositoryName}: ${devbuildTemplateError}`);
                    return;
                }
                const project_build_native_executable_command = projectUtils.getProjectBuildNativeExecutableCommand(folder);
                if (!project_build_native_executable_command) {
                    return `Failed to resolve project build native executable command for folder ${folder.uri.fsPath}`;
                }
                const project_native_executable_artifact_location = projectUtils.getProjectNativeExecutableArtifactLocation(folder);
                if (!project_native_executable_artifact_location) {
                    return `Failed to resolve project native executable artifact for folder ${folder.uri.fsPath}`;
                }
                const nibuildTemplateError = expandTemplate(nibuildspec_template, folder, project_build_native_executable_command, project_native_executable_artifact_location, nibuildArtifactName, resourcesPath);
                if (nibuildTemplateError) {
                    resolve(`Failed to configure native executable build spec for ${repositoryName}: ${nibuildTemplateError}`);
                    return;
                }
                const docker_nibuildTemplateError = expandTemplate(docker_nibuildspec_template, folder, project_build_native_executable_command, project_native_executable_artifact_location, docker_nibuildArtifactName, resourcesPath);
                if (nibuildTemplateError) {
                    resolve(`Failed to configure docker native executable build spec for ${repositoryName}: ${docker_nibuildTemplateError}`);
                    return;
                }
                const docker_ni_file = 'Dockerfile.native';
                const docker_niFileError = expandTemplate(docker_ni_file, folder, '', '', '', resourcesPath);
                if (docker_niFileError) {
                    resolve(`Failed to configure docker naive file for ${repositoryName}: ${docker_niFileError}`);
                    return;
                }

                // PENDING: must delegate to a service plugin to initialize the project.

                // --- Create a default knowledgebase; tie it to a project + mark so it can be recognized later
                // displayName must match ".*(?:^[a-zA-Z_](-?[a-zA-Z_0-9])*$).*"
                progress.report({
                    increment: 5,
                    message: `Creating ADM knowledge base for ${projectName}...`
                });
                const knowledgeBaseOCID = await ociUtils.createKnowledgeBase(provider, compartment, `Audits-for-${projectName}`, {
                    "gcn_tooling_projectOCID" : project,
                    "gcn_tooling_usage" : "gcn-adm-audit"
                });

                // --- Store cloud services configuration (.vscode/gcn.json)
                progress.report({
                    increment: 5,
                    message: `Configuring project services for ${repositoryName}...`
                });
                const data: any = {
                    version: '1.0'
                };
                data[authentication.getDataName()] = authentication.getData();
                const oci = new ociContext.Context(authentication, compartment, project, codeRepository.id);
                data[oci.getDataName()] = oci.getData();
                data.services = {
                    // TODO: Might use populated instance of buildServices.Service as dataSupport.DataProducer
                    buildPipelines: {
                        items: [
                            {
                                'ocid': devbuildPipeline,
                                'displayName': 'Devbuild (fat JAR)'
                            },
                            {
                                'ocid': nibuildPipeline,
                                'displayName': 'Build Native Image'
                            },
                            {
                                'ocid': docker_nibuildPipeline,
                                'displayName': 'Build Docker Native Image'
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

                // --- Populate code repository
                progress.report({
                    increment: 5,
                    message: `Populating source code repository ${repositoryName}...`
                });
                const pushErr = await gitUtils.populateNewRepository(codeRepository.sshUrl, repositoryDir); // TODO: codeRepository.httpUrl ?
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

async function selectFolders(): Promise<vscode.WorkspaceFolder[] | undefined> {
    const choices: dialogs.QuickPickObject[] = [];
    const folders = vscode.workspace.workspaceFolders;
    if (folders) {
        for (const workspaceFolder of folders) {
            const choice = new dialogs.QuickPickObject(workspaceFolder.name, undefined, undefined, workspaceFolder);
            choices.push(choice);
        }
    }
    if (choices.length === 0) {
        vscode.window.showErrorMessage('No folders to deploy.');
        return undefined;
    }

    if (choices.length === 1) {
        return [ choices[0].object ];
    }

    const choice = await vscode.window.showQuickPick(choices, {
        placeHolder: 'Select Folders to Deploy',
        canPickMany: true
    });

    if (choice && choice.length > 0) {
        const folders: vscode.WorkspaceFolder[] = [];
        for (const folder of choice) {
            folders.push(folder.object);
        }
        return folders;
    }

    return undefined;
}

async function selectProjectName(): Promise<string | undefined> {
    let projectName = await vscode.window.showInputBox({
        placeHolder: 'Define DevOps Project Name'
        // validateInput: input => (input && Number.parseInt(input) >= 0) ? undefined : 'PID must be positive integer',
    });
    if (projectName) {
        projectName = projectName.replace(/\s+/g, '');
    }
    return projectName
}

function expandTemplate(template: string, folder: vscode.WorkspaceFolder, projectBuildCommand: string, projectArtifactLocation: string, deployArtifactName: string, templatesStorage: string): string | undefined {
    const templatespec = path.join(templatesStorage, template);
    let templateString = fs.readFileSync(templatespec).toString();

    templateString = templateString.replace(/\${{project_build_command}}/g, projectBuildCommand);
    templateString = templateString.replace(/\${{project_artifact_location}}/g, projectArtifactLocation);
    templateString = templateString.replace(/\${{deploy_artifact_name}}/g, deployArtifactName);

    const dest = path.join(folder.uri.fsPath, '.gcn');
    if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest);
    }
    const templatedest = path.join(dest, template);
    fs.writeFileSync(templatedest, templateString);

    return undefined;
}
