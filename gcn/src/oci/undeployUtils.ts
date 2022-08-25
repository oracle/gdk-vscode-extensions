/*
 * Copyright (c) 2022, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as identity from 'oci-identity';
import * as devops from 'oci-devops';
import * as gcnServices from '../gcnServices';
import * as dialogs from '../dialogs';
import * as ociUtils from './ociUtils';
import * as ociServices from './ociServices';


export async function undeployFolders() {
    const folders: gcnServices.FolderData[] = gcnServices.getFolderData();
    const selected: gcnServices.FolderData[] | undefined = await selectFolders(folders);
    if (selected && selected.length > 0) {
        for (const folder of selected) {
            await undeployFolder(folder);
        }
        await gcnServices.build();
    }
}

export async function undeployFolder(folder: gcnServices.FolderData) {
    const services = ociServices.findByFolderData(folder);
    if (services.length === 0) {
        return;
    }

    const oci = services[0].getContext();
    const problem = oci.getConfigurationProblem();
    if (problem) {
        vscode.window.showErrorMessage(`Cannot undeploy folder ${folder.folder.name}: ${problem}`);
        return;
    }

    const authProvider = oci.getProvider();
    const devopsId = oci.getDevOpsProject();
    const compartmentId = oci.getCompartment();

    const data : [devops.models.Project, identity.models.Compartment | undefined] = await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Validating OCI data for folder ${folder.folder.name}`
    }, async (_progress, _token) => {
        const p = await ociUtils.getDevopsProject(authProvider, devopsId);
        const c = (await ociUtils.getCompartment(authProvider, compartmentId))?.compartment;
        return [p, c];
    });
    if (!data[0]) {
        vscode.window.showErrorMessage(`Cannot undeploy folder ${folder.folder.name}: Failed to resolve DevOps Project ${devopsId}`);
        return;
    }
    if (!data[1]) {
        vscode.window.showErrorMessage(`Cannot undeploy folder ${folder.folder.name}: Failed to resolve Compartment ${compartmentId}`);
        return;
    }

    const folderPath = folder.folder.uri.fsPath;

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
        
        const gitPath = path.join(folderPath, '.git');
        if (fs.existsSync(gitPath)) {
            _progress.report({ message: `Deleting local GIT repository at ${gitPath}`})
            fs.rmdirSync(gitPath, { recursive : true});
        }

        // console.log(`Process pipelines`);
        _progress.report({message : "Listing Build Pipelines"});

        const buildPipelines : devops.models.BuildPipelineSummary[] = (await ociUtils.listBuildPipelines(authProvider, devopsId))?.buildPipelineCollection?.items || [];
        for (let pipe of buildPipelines) {
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

        // console.log(`Process pipelines`);
        _progress.report({message : "Listing Build Pipelines"});

        const deployPipelines : devops.models.DeployPipelineSummary[] = (await ociUtils.listDeployPipelines(authProvider, devopsId))?.deployPipelineCollection?.items || [];
        for (let pipe of deployPipelines) {
            _progress.report({message : `Processing pipeline ${pipe.displayName}`});

            // console.log(`Inspecting pipeline ${pipe.displayName} = ${pipe.id}`)
            const stages : Array<devops.models.DeployStageSummary> = (await ociUtils.listDeployStages(authProvider, pipe.id))?.deployStageCollection.items || [];
            const orderedStages : devops.models.DeployStageSummary[] = [];
            const id2Stage : Map<string, devops.models.DeployStageSummary> = new Map();

            // push leaf stages first.
            const revDeps : Map<string, number> = new Map();
            stages.forEach(s => {
                id2Stage.set(s.id, s);
                if (!revDeps.has(s.id)) {
                    revDeps.set(s.id, 0);
                }
                // console.log(`Stage ${s.displayName} has predecessors: ${s.deployStagePredecessorCollection?.items.map(pred => pred.id).join(', ')}`)
                for (let p of s.deployStagePredecessorCollection?.items || []) {
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
                        for (let p of s.deployStagePredecessorCollection?.items || []) {
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
                await ociUtils.deleteDeployStage(authProvider, stage.id, true);
            }
            _progress.report({message : `Deleting pipeline ${pipe.displayName}`});
            // console.log(`Delete pipeline ${pipe.displayName}`);

            // in theory, pipelines are independent, but it seems the delete operation overlaps on the project OCID, so they must be deleted
            // sequentially.
            await ociUtils.deleteDeployPipeline(authProvider, pipe.id, true)
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
            _progress.report({ message: `Deleting artifact ${a.displayName}`});
            // console.log(`Delete artifact ${a.displayName}`);
            // seems that deleteArtifact also transaction-conflicts on the project.
            await ociUtils.deleteProjectDeployArtifact(authProvider, a.id, true);
        };
        _progress.report({ message: 'Searching artifact repositories'});
        const artifactsRepositories = (await ociUtils.listArtifactRepositories(authProvider, compartmentId))?.repositoryCollection.items;
        if (artifactsRepositories) {
            for (const repo of artifactsRepositories) {
                if ((repo.freeformTags?.['gcn_tooling_projectOCID'] == devopsId)) {
                    _progress.report({message : `Deleting artifact repository ${repo.displayName}`});
                    await ociUtils.deleteArtifactsRepository(authProvider, compartmentId, repo.id);
                }
            }
        }
        _progress.report({ message: 'Searching container repositories'});
        const containerRepositories = (await ociUtils.listContainerRepositories(authProvider, compartmentId))?.containerRepositoryCollection.items;
        if (containerRepositories) {
            for (const repo of containerRepositories) {
                if ((repo.displayName === `${data[0].name.toLowerCase()}_container_repository`)) {
                    _progress.report({message : `Deleting container repository ${repo.displayName}`});
                    await ociUtils.deleteContainerRepository(authProvider, repo.id);
                }
            }
        }
        _progress.report({ message: 'Searching OKE cluster environments'});
        const okeClusterEnvironments = (await ociUtils.listDeployEnvironments(authProvider, devopsId))?.deployEnvironmentCollection.items || [];
        for (const env of okeClusterEnvironments) {
            _progress.report({message : `Deleting OKE cluster environment ${env.displayName}`});
            await ociUtils.deleteDeployEnvironment(authProvider, env.id);
        }
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
        const gcnPath = path.join(folderPath, '.vscode', 'gcn.json');
        _progress.report({message : `Deleting GCN registration ${gcnPath}`});
        fs.unlinkSync(gcnPath); 
        const gcnFolderPath = path.join(folderPath, '.gcn');
        if (fs.existsSync(gcnFolderPath)) {
            _progress.report({message : 'Deleting local OCI resources'});
            fs.rmdirSync(gcnFolderPath, { recursive : true});
        }

        return p;
    });
    return result;
}

async function selectFolders(folders: gcnServices.FolderData[]): Promise<gcnServices.FolderData[] | undefined> {
    if (folders.length === 0) {
        vscode.window.showErrorMessage('No folders to undeploy.');
        return undefined;
    }

    const choices: dialogs.QuickPickObject[] = [];
    for (const folder of folders) {
        const choice = new dialogs.QuickPickObject(folder.folder.name, undefined, undefined, folder);
        (choice as vscode.QuickPickItem).picked = true;
        choices.push(choice);
    }

    const selected = await vscode.window.showQuickPick(choices, {
        placeHolder: 'Confirm Folders to Undeploy',
        canPickMany: true
    });

    if (selected) {
        const ret: gcnServices.FolderData[] = [];
        for (const folder of selected) {
            ret.push(folder.object);
        }
        return ret;
    }

    return undefined;
}
