/*
 * Copyright (c) 2022, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as common from 'oci-common';
import * as gitUtils from '../gitUtils'
import * as projectUtils from '../projectUtils';
import * as importUtils from './importUtils';
import * as ociUtils from './ociUtils';
import * as ociContext from './ociContext';
import { devops } from 'oci-sdk';
import * as identity from 'oci-identity';

export type SaveConfig = (folder: string, config: any) => boolean;

export async function deployFolders(resourcesPath: string, saveConfig: SaveConfig): Promise<undefined> {
    let resolvedProvider: common.ConfigFileAuthenticationDetailsProvider | undefined;
    // TODO: implement support for additional authentication methods (custom file/profile, credentials, etc.)
    // TODO: should be implemented in ociContext.ts or authenticationUtils.ts
    try {
        resolvedProvider = new common.ConfigFileAuthenticationDetailsProvider();
    } catch (err) {
        vscode.window.showErrorMessage('Cannot access OCI using the default profile in .oci/config file, or config file not available.');
    }
    if (!resolvedProvider) {
        return undefined;
    }
    const provider = resolvedProvider;

    const compartment = await importUtils.selectCompartment(provider);
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
                message: 'Setting up notifications...'
            });
            const notificationTopic = await ociUtils.getNotificationTopic(provider, compartment, true);
            if (!notificationTopic) {
                resolve('Failed to prepare notification topic.');
                return;
            }

            // --- Create devops project
            progress.report({
                message: 'Creating devops project...'
            });
            const project = (await ociUtils.createDevOpsProject(provider, projectName, compartment, notificationTopic))?.project.id;
            if (!project) {
                resolve('Failed to create devops project.');
                return;
            }

            // --- Create project log
            progress.report({
                message: 'Setting up logging...'
            });
            const logGroup = await ociUtils.getDefaultLogGroup(provider, compartment, true);
            if (!logGroup) {
                resolve('Failed to resolve default log group.');
                return;
            }
            const logResp = await ociUtils.createProjectLog(provider, compartment, logGroup, project, projectName);
            if (!logResp) {
                resolve('Failed to create project log.');
                return;
            }

            // --- Create artifact registry
            progress.report({
                message: `Creating artifact registry...`
            });
            const artifactsRegistry = (await ociUtils.createArtifactsRegistry(provider, compartment, projectName))?.repository.id;
            if (!artifactsRegistry) {
                resolve('Failed to create artifact registry.');
                return;
            }

            for (const folder of folders) {
                const repositoryDir = folder.uri.fsPath;
                const repositoryName = folder.name;

                // --- Create code repository
                progress.report({
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

                // --- Generate build specs
                progress.report({
                    message: `Creating build specs for source code repository ${repositoryName}...`
                });
                const devbuildspec_template = 'devbuild_spec.yaml';
                const devbuildTemplateError = expandTemplate(devbuildspec_template, folder, resourcesPath);
                if (devbuildTemplateError) {
                    resolve(`Failed to configure devbuild build spec for ${repositoryName}: ${devbuildTemplateError}`);
                    return;
                }
                const nibuildspec_template = 'nibuild_spec.yaml';
                const nibuildTemplateError = expandTemplate(nibuildspec_template, folder, resourcesPath);
                if (nibuildTemplateError) {
                    resolve(`Failed to configure native executable build spec for ${repositoryName}: ${devbuildTemplateError}`);
                    return;
                }

                // --- Create devbuild artifact
                progress.report({
                    message: `Creating devbuild artifacts for ${repositoryName}...`
                });
                const devbuildArtifactPath = `${projectName}-dev.jar`;
                const devbuildArtifactName = `${projectName}_dev_fatjar`;
                const devbuildArtifactDescription = `Devbuild artifact for project ${projectName} & repository ${repositoryName}`;
                const devbuildArtifact = (await ociUtils.createProjectDevArtifact(provider, artifactsRegistry, project, devbuildArtifactPath, devbuildArtifactName, devbuildArtifactDescription))?.deployArtifact.id;
                if (!devbuildArtifact) {
                    resolve(`Failed to create devbuild artifacts for ${repositoryName}.`);
                    return;
                }

                // --- Create devbuild pipeline
                progress.report({
                    message: `Creating build pipeline for devbuilds of ${repositoryName}...`
                });
                const devbuildPipeline = (await ociUtils.createBuildPipeline(provider, project, 'DevbuildPipeline'))?.buildPipeline.id;
                if (!devbuildPipeline) {
                    resolve(`Failed to create devbuild pipeline for ${repositoryName}.`);
                    return;
                }
                const devbuildPipelineBuildStage = (await ociUtils.createBuildPipelineBuildStage(provider, devbuildPipeline, codeRepository.id, repositoryName, codeRepository.httpUrl, devbuildspec_template))?.buildPipelineStage.id;
                if (!devbuildPipelineBuildStage) {
                    resolve(`Failed to create devbuild pipeline build stage for ${repositoryName}.`);
                    return;
                }
                const devbuildPipelineArtifactsStage = (await ociUtils.createBuildPipelineArtifactsStage(provider, devbuildPipeline, devbuildPipelineBuildStage, devbuildArtifact, devbuildArtifactName))?.buildPipelineStage.id;
                if (!devbuildPipelineArtifactsStage) {
                    resolve(`Failed to create devbuild pipeline artifacts stage for ${repositoryName}.`);
                    return;
                }

                // --- Create native image artifact
                progress.report({
                    message: `Creating native executable artifacts for ${repositoryName}...`
                });
                const nibuildArtifactPath = `${projectName}-dev`;
                const nibuildArtifactName = `${projectName}_dev_executable`;
                const nibuildArtifactDescription = `Native executable artifact for project ${projectName} & repository ${repositoryName}`;
                const nibuildArtifact = (await ociUtils.createProjectDevArtifact(provider, artifactsRegistry, project, nibuildArtifactPath, nibuildArtifactName, nibuildArtifactDescription))?.deployArtifact.id;
                if (!nibuildArtifact) {
                    resolve(`Failed to create native executable artifacts for ${repositoryName}.`);
                    return;
                }

                // --- Create native image pipeline
                progress.report({
                    message: `Creating build pipeline for native executables of ${repositoryName}...`
                });
                const nibuildPipeline = (await ociUtils.createBuildPipeline(provider, project, 'NativeImagePipeline'))?.buildPipeline.id;
                if (!nibuildPipeline) {
                    resolve(`Failed to create native executables pipeline for ${repositoryName}.`);
                    return;
                }
                const nibuildPipelineBuildStage = (await ociUtils.createBuildPipelineBuildStage(provider, nibuildPipeline, codeRepository.id, repositoryName, codeRepository.httpUrl, nibuildspec_template))?.buildPipelineStage.id;
                if (!nibuildPipelineBuildStage) {
                    resolve(`Failed to create native executables pipeline build stage for ${repositoryName}.`);
                    return;
                }
                const nibuildPipelineArtifactsStage = (await ociUtils.createBuildPipelineArtifactsStage(provider, nibuildPipeline, nibuildPipelineBuildStage, nibuildArtifact, nibuildArtifactName))?.buildPipelineStage.id;
                if (!nibuildPipelineArtifactsStage) {
                    resolve(`Failed to create native executables pipeline artifacts stage for ${repositoryName}.`);
                    return;
                }

                // PENDING: must delegate to a service plugin to initialize the project.

                // --- Create a default knowledgebase; tie it to a project + mark so it can be recognized later
                // displayName must match ".*(?:^[a-zA-Z_](-?[a-zA-Z_0-9])*$).*"
                progress.report({
                    message: `Creating ADM knowledge base for ${projectName}...`
                });
                const knowledgeBaseOCID = await ociUtils.createKnowledgeBase(provider, compartment, `Audits-for-${projectName}`, {
                    "gcn_tooling_projectOCID" : project,
                    "gcn_tooling_usage" : "gcn-adm-audit"
                });

                // --- Store cloud services configuration (.vscode/gcn.json)
                progress.report({
                    message: `Configuring project services for ${repositoryName}...`
                });
                const data: any = {
                    version: '1.0'
                };
                const oci = new ociContext.Context(provider, compartment, project, codeRepository.id);
                oci.store(data);
                data.services = {
                    buildPipelines: {
                        inline: [
                            {
                                'ocid': devbuildPipeline,
                                'displayName': 'Devbuild (fat JAR)'
                            },
                            {
                                'ocid': nibuildPipeline,
                                'displayName': 'Build Native Image'
                            }
                        ]
                    },
                    knowledgeBases: {
                        settings: {
                            sourceKnowledgeBase: knowledgeBaseOCID
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
    const choices: importUtils.QuickPickObject[] = [];
    const folders = vscode.workspace.workspaceFolders;
    if (folders) {
        for (const workspaceFolder of folders) {
            const choice = new importUtils.QuickPickObject(workspaceFolder.name, undefined, undefined, workspaceFolder);
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
        projectName = projectName.replace(' ', '');
    }
    return projectName
}

function expandTemplate(template: string, folder: vscode.WorkspaceFolder, templatesStorage: string): string | undefined {
    const templatespec = path.join(templatesStorage, template);
    let templateString = fs.readFileSync(templatespec).toString();

    const project_devbuild_artifact = projectUtils.getProjectDevbuildArtifact(folder);
    if (!project_devbuild_artifact) {
        return `Failed to resolve project devbuild artifact for folder ${folder.uri.fsPath}`;
    }
    const project_native_executable_artifact = projectUtils.getProjectNativeExecutableArtifact(folder);
    if (!project_native_executable_artifact) {
        return `Failed to resolve project native executable artifact for folder ${folder.uri.fsPath}`;
    }

    templateString = templateString.replace('${{project_devbuild_artifact}}', project_devbuild_artifact);
    templateString = templateString.replace('${{project_native_executable_artifact}}', project_native_executable_artifact);

    const templatedest = path.join(folder.uri.fsPath, template);
    fs.writeFileSync(templatedest, templateString);

    return undefined;
}

export async function undeployFolder(resource : vscode.Uri) {
    if ("file" !== resource.scheme) {
        return;
    }
    // PENDING: no real API to get model / list of the attached cloud resource, try regexps
    const gcnPath = path.join(resource.fsPath, ".vscode", "gcn.json");
    if (!fs.existsSync(gcnPath)) {
        return;
    }
    const contents = fs.readFileSync(gcnPath).toString();
    const devops = new RegExp('"devopsProject"\\s*:\\s*{\\s*"ocid"\\s*:\\s*"([^"]+)"\\s*}', 'm');
    const compartment = new RegExp('"compartment"\\s*:\\s*{\\s*"ocid"\\s*:\\s*"([^"]+)"\\s*}', 'm');
    const arr = devops.exec(contents);
    if (!arr) {
        vscode.window.showErrorMessage(`Could not find a devops project for ${resource.path}`);
        return;
    }

    const devopsId =arr[1];
    const compartmentId = compartment.exec(contents)?.[1];

    let authProvider: common.ConfigFileAuthenticationDetailsProvider;

    try {
        authProvider = new common.ConfigFileAuthenticationDetailsProvider();
    } catch (err) {
        vscode.window.showErrorMessage('Cannot access OCI using the default profile in .oci/config file, or config file not available.');
        return;
    }

    const data : [devops.models.Project, identity.models.Compartment | undefined] = await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Validating OCI data`,
        cancellable : true
    }, async (_progress, _token) => {
        const p = await ociUtils.getDevopsProject(authProvider, devopsId);
        const c = compartmentId ? (await ociUtils.getCompartment(authProvider, compartmentId))?.compartment : undefined;
        return [p, c];
    });
    if (!data[0] || !data[1] || !compartmentId) {
        return;
    }

    const ack = await vscode.window.showWarningMessage("Undeploy from OCI", 
        { 
            modal : true, 
            detail: `Undeploy project ${resource.fsPath} from OCI compartment ${data[1].name} ?`
        }, "Yes", "No");
    if ("Yes" !== ack) {
        return;
    }

    const result: string | devops.responses.DeleteProjectResponse = await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Undeploying ${data[0].name} from OCI `,
        cancellable: false
    }, async (_progress, _token) => {

        _progress.report({message : "Listing project repositories"});
        const repoPromises : Promise<any>[] | undefined = (await ociUtils.listCodeRepositories(authProvider, devopsId))?.repositoryCollection.items.map( repo => {
            _progress.report({ message: `Deleting code repository: ${repo.name}`})
            return ociUtils.deleteCodeRepository(authProvider, repo.id);
        });
        if (repoPromises) {
            await Promise.all(repoPromises);
        }
        
        const gitPath = path.join(resource.fsPath, '.git');
        if (fs.existsSync(gitPath)) {
            _progress.report({ message: `Deleting local GIT repository at ${gitPath}`})
            fs.rmdirSync(gitPath, { recursive : true});
        }

        // console.log(`Process pipelines`);
        _progress.report({message : "Listing Build Pipelines"});

        const pipeLines : devops.models.BuildPipelineSummary[] = (await ociUtils.listBuildPipelines(authProvider, devopsId))?.buildPipelineCollection?.items || [];
        for (let pipe of pipeLines) {
            _progress.report({message : `Processing pipeline ${pipe.displayName}`});

            // console.log(`Inspecting pipeline ${pipe.displayName} = ${pipe.id}`)
            const stages : Array<devops.models.BuildPipelineStageSummary> = (await ociUtils.listBuildPipelineStages(authProvider, pipe.id))?.buildPipelineStageCollection.items || [];
            const orderedStages : devops.models.BuildPipelineStageSummary[] = [];
            const id2Stage : Map<string, devops.models.BuildPipelineStageSummary> = new Map();

            // push leaf stages first.
            const revDeps : Map<string, number> = new Map();
            stages.forEach(s => {
                id2Stage.set(s.id, s);
                if (!revDeps.has(s.id)) {
                    revDeps.set(s.id, 0);
                }
                //console.log(`Stage ${s.displayName} has predecessors: ${s.buildPipelineStagePredecessorCollection?.items.map(pred => pred.id).join(', ')}`)
                for (let p of s.buildPipelineStagePredecessorCollection?.items || []) {
                    if (p.id === s.id || p.id === pipe.id) {
                        // ??? Who invented reference-to-owner in predecessors ??
                        continue;
                    }
                    let n = (revDeps.get(p.id) || 0);
                    revDeps.set(p.id, n + 1);
                }
            });

            while (revDeps.size > 0) {
                let found : boolean = false;
                for (let k of revDeps.keys()) {
                    if (revDeps.get(k) == 0) {
                        found = true;
                        const s = id2Stage.get(k);
                        revDeps.delete(k);
                        if (!s) continue;
    
                        orderedStages.push(s);
                        //console.log(`Add stage ${s.displayName} = ${s.id}`)
                        for (let p of s.buildPipelineStagePredecessorCollection?.items || []) {
                            if (p.id === s.id || p.id === pipe.id) {
                                continue;
                            }
                            let n = (revDeps.get(p.id) || 1);
                            revDeps.set(p.id, n - 1);
                        }
                    }
                }
                if (!found) {
                    throw "Inconsistent pipeline structure!";
                }
            }

            // console.log(`Deleting ${orderedStages.length} stages before deleting ${pipe.displayName}`);
            for (let stage of orderedStages) {
                _progress.report({message : `Deleting stage ${stage.displayName}`});
                // console.log(`Delete stage ${stage.displayName} = ${stage.id} of ${pipe.displayName}`);
                await ociUtils.deleteBuildPipelineStage(authProvider, stage.id, true);
            }
            _progress.report({message : `Deleting pipeline ${pipe.displayName}`});
            // console.log(`Delete pipeline ${pipe.displayName}`);
            
            // in theory, pipelines are independent, but it seems the delete operation overlaps on the project OCID, so they must be deleted
            // sequentially.
            await ociUtils.deleteBuildPipeline(authProvider, pipe.id, true)
        };

        // console.log(`Process logs`);
        _progress.report({message : "Listing project logs"});
        const logPromises : Promise<any>[] | undefined = (await ociUtils.listLogsByProject(authProvider, compartmentId, devopsId))?.map(l => {
            _progress.report({message : `Deleting log ${l.displayName}`});
            // console.log(`Delete log ${l.displayName}`);
            return ociUtils.deleteLog(authProvider, l.id, l.logGroupId, true);
        });
        if (logPromises) {
            // console.log(`Waiting for ${logPromises.length} logs before advancing`);
            await Promise.all(logPromises);
        }
        
        // console.log(`Process artifacts`);
        _progress.report({message : "Listing deploy artifacts"});
        let artifacts = (await ociUtils.listProjectDeployArtifacts(authProvider, devopsId))?.deployArtifactCollection.items || [];
        for (let a of artifacts) {
            _progress.report({ message: `Deleting artfiact ${a.displayName}`});
            // console.log(`Delete artifact ${a.displayName}`);
            // seems that deleteArtifact also transaction-conflicts on the project.
            await ociUtils.deleteProjectDeployArtifact(authProvider, a.id, true);
        };

        // PENDING: knowledgebase search + deletion should be done by the Services Plugin; need API to invoke it on the OCI configuration.
        _progress.report({ message: 'Searching knowledge bases'});
        let knowledgeBases = (await ociUtils.listKnowledgeBases(authProvider, compartmentId))?.knowledgeBaseCollection.items || [];
        for (let kb of knowledgeBases) {
            if ((kb.freeformTags?.['gcn_tooling_usage'] === "gcn-adm-audit") &&
                (kb.freeformTags?.['gcn_tooling_projectOCID'] == devopsId)) {
                    _progress.report({message : `Deleting knowledge base ${kb.displayName}`});
                    await ociUtils.deleteKnowledgeBase(authProvider, kb.id, true);
            }
        }
        _progress.report({message : `Deleting project ${data[0].name}`});
        let p = ociUtils.deleteDevOpsProject(authProvider, devopsId);
        _progress.report({message : `Deleting GCN regsitration ${gcnPath}`});
        fs.unlinkSync(gcnPath); 

        return p;
    });
    return result;
}
