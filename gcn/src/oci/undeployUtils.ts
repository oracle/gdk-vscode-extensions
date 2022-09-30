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
import * as servicesView from '../servicesView';
import * as dialogs from '../dialogs';
import * as projectUtils from '../projectUtils';
import * as logUtils from '../logUtils';
import * as ociUtils from './ociUtils';
import * as ociServices from './ociServices';


export async function undeployFolders() {
    logUtils.logInfo('[undeploy] Invoked undeploy folders');
    await servicesView.showWelcomeView('gcn.undeployInProgress');
    try {
        const selected = await dialogs.selectFolders('Select Folders to Undeploy', true, false);
        if (!selected) {
            if (selected === null) {
                vscode.window.showErrorMessage('No folders to undeploy.');
            }
            return;
        }
        logUtils.logInfo(`[undeploy] Configured to undeploy ${selected.length} folder(s)`);
        for (const folder of selected) {
            try {
                logUtils.logInfo(`[undeploy] Undeploying folder ${folder.folder.uri.fsPath}`);
                await undeployFolder(folder);
                logUtils.logInfo(`[undeploy] Folder ${folder.folder.uri.fsPath} successfully undeployed`);
            } catch (err) {
                dialogs.showErrorMessage(`Failed to undeploy folder ${folder.folder.name}`, err);
            }
        }
    } finally {
        await servicesView.hideWelcomeView('gcn.undeployInProgress');
    }
    await gcnServices.build();
}

export async function undeployFolder(folder: gcnServices.FolderData) {
    const services = ociServices.findByFolderData(folder);
    if (services.length === 0) {
        logUtils.logInfo(`[undeploy] No services to undeploy for ${folder.folder.name}`);
        return;
    }

    const oci = services[0].getContext();
    const problem = oci.getConfigurationProblem();
    if (problem) {
        dialogs.showErrorMessage(`Cannot undeploy folder ${folder.folder.name}: ${problem}`);
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
        const c = await ociUtils.getCompartment(authProvider, compartmentId);
        return [p, c];
    });
    if (!data[0]) {
        dialogs.showErrorMessage(`Cannot undeploy folder ${folder.folder.name}: Failed to resolve DevOps Project ${devopsId}`);
        return;
    }
    if (!data[1]) {
        dialogs.showErrorMessage(`Cannot undeploy folder ${folder.folder.name}: Failed to resolve Compartment ${compartmentId}`);
        return;
    }

    const folderPath = folder.folder.uri.fsPath;

    const compartmentLogname = data[1].name;
    const projectLogname = `${compartmentLogname}/${data[0].name}`;
    logUtils.logInfo(`[undeploy] Folder ${folderPath} will be undeployed from ${projectLogname}`);

    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Undeploying ${data[0].name} from OCI `,
        cancellable: false
    }, async (_progress, _token) => {
        _progress.report({message : "Listing project repositories"});
        const repoNames: string[] = [];
        logUtils.logInfo(`[undeploy] Listing all source code repositories in ${projectLogname}`);
        const repoPromises : Promise<any>[] | undefined = (await ociUtils.listCodeRepositories(authProvider, devopsId)).map(repo => {
            if (repo.name) {
                repoNames.push(repo.name);
            }
            _progress.report({ message: `Deleting code repository: ${repo.name}`})
            logUtils.logInfo(`[undeploy] Deleting code repository ${repo.name} in ${projectLogname}`);
            return ociUtils.deleteCodeRepository(authProvider, repo.id);
        });
        if (repoPromises) {
            logUtils.logInfo(`[undeploy] Wating to complete deletion of all code repositories in ${projectLogname}`);
            await Promise.all(repoPromises);
            logUtils.logInfo(`[undeploy] All code repositories in ${projectLogname} deleted`);
        }
        
        const gitPath = path.join(folderPath, '.git');
        if (fs.existsSync(gitPath)) {
            _progress.report({ message: `Deleting local GIT repository at ${gitPath}`})
            logUtils.logInfo(`[undeploy] Deleting local GIT repository at ${gitPath}`);
            fs.rmdirSync(gitPath, { recursive : true});
        }

        _progress.report({message : "Listing Build Pipelines"});
        logUtils.logInfo(`[undeploy] Listing all build pipelines in ${projectLogname}`);

        const buildPipelines: devops.models.BuildPipelineSummary[] = await ociUtils.listBuildPipelines(authProvider, devopsId);
        for (let pipe of buildPipelines) {
            _progress.report({message : `Processing pipeline ${pipe.displayName}`});
            logUtils.logInfo(`[undeploy] Processing build pipeline ${pipe.displayName} in ${projectLogname}`);

            logUtils.logInfo(`[undeploy] Listing stages of build pipeline ${pipe.displayName} in ${projectLogname}`);
            const stages: Array<devops.models.BuildPipelineStageSummary> = await ociUtils.listBuildPipelineStages(authProvider, pipe.id);
            const orderedStages: devops.models.BuildPipelineStageSummary[] = [];
            const id2Stage: Map<string, devops.models.BuildPipelineStageSummary> = new Map();

            // push leaf stages first.
            const revDeps: Map<string, number> = new Map();
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
                logUtils.logInfo(`[undeploy] Deleting stage ${stage.displayName} of build pipeline ${pipe.displayName} in ${projectLogname}`);
                await ociUtils.deleteBuildPipelineStage(authProvider, stage.id, true);
            }
            _progress.report({message : `Deleting pipeline ${pipe.displayName}`});

            // in theory, pipelines are independent, but it seems the delete operation overlaps on the project OCID, so they must be deleted
            // sequentially.
            logUtils.logInfo(`[undeploy] Deleting build pipeline ${pipe.displayName} in ${projectLogname}`);
            await ociUtils.deleteBuildPipeline(authProvider, pipe.id, true)
        };

        _progress.report({message : "Listing Deploy Pipelines"});
        logUtils.logInfo(`[undeploy] Listing all deployment pipelines in ${projectLogname}`);

        const deployPipelines: devops.models.DeployPipelineSummary[] = await ociUtils.listDeployPipelines(authProvider, devopsId);
        for (let pipe of deployPipelines) {
            _progress.report({message : `Processing pipeline ${pipe.displayName}`});

            logUtils.logInfo(`[undeploy] Listing stages of deployment pipeline ${pipe.displayName} in ${projectLogname}`);
            const stages: devops.models.DeployStageSummary[] = await ociUtils.listDeployStages(authProvider, pipe.id);
            const orderedStages: devops.models.DeployStageSummary[] = [];
            const id2Stage: Map<string, devops.models.DeployStageSummary> = new Map();

            // push leaf stages first.
            const revDeps: Map<string, number> = new Map();
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
                logUtils.logInfo(`[undeploy] Deleting stage ${stage.displayName} of deployment pipeline ${pipe.displayName} in ${projectLogname}`);
                await ociUtils.deleteDeployStage(authProvider, stage.id, true);
            }
            _progress.report({message : `Deleting pipeline ${pipe.displayName}`});

            // in theory, pipelines are independent, but it seems the delete operation overlaps on the project OCID, so they must be deleted
            // sequentially.
            logUtils.logInfo(`[undeploy] Deleting deployment pipeline ${pipe.displayName} in ${projectLogname}`);
            await ociUtils.deleteDeployPipeline(authProvider, pipe.id, true)
        };

        _progress.report({message : "Listing project logs"});
        logUtils.logInfo(`[undeploy] Listing all logs in ${projectLogname}`);
        const logPromises : Promise<any>[] | undefined = (await ociUtils.listLogsByProject(authProvider, compartmentId, devopsId))?.map(l => {
            _progress.report({message : `Deleting log ${l.displayName}`});
            logUtils.logInfo(`[undeploy] Deleting log ${l.displayName} in ${projectLogname}`);
            return ociUtils.deleteLog(authProvider, l.id, l.logGroupId, true);
        });
        if (logPromises) {
            logUtils.logInfo(`[undeploy] Wating to complete deletion of all logs in ${projectLogname}`);
            await Promise.all(logPromises);
            logUtils.logInfo(`[undeploy] All logs in ${projectLogname} deleted`);
        }
        
        _progress.report({message : "Listing deploy artifacts"});
        logUtils.logInfo(`[undeploy] Listing all deploy artifacts in ${projectLogname}`);
        let artifacts = await ociUtils.listDeployArtifacts(authProvider, devopsId);
        for (let a of artifacts) {
            _progress.report({ message: `Deleting artifact ${a.displayName}`});
            logUtils.logInfo(`[undeploy] Deleting artifact ${a.displayName} in ${projectLogname}`);
            // seems that deleteArtifact also transaction-conflicts on the project.
            await ociUtils.deleteDeployArtifact(authProvider, a.id, true);
        };
        _progress.report({ message: 'Searching artifact repositories'});
        logUtils.logInfo(`[undeploy] Listing all artifact repositories in ${compartmentLogname}`);
        const artifactsRepositories = await ociUtils.listArtifactRepositories(authProvider, compartmentId);
        if (artifactsRepositories) {
            for (const repo of artifactsRepositories) {
                if ((repo.freeformTags?.['gcn_tooling_projectOCID'] == devopsId)) {
                    _progress.report({message : `Deleting artifact repository ${repo.displayName}`});
                    logUtils.logInfo(`[undeploy] Deleting artifact repository ${repo.displayName} in ${compartmentLogname}`);
                    await ociUtils.deleteArtifactsRepository(authProvider, compartmentId, repo.id);
                }
            }
        }
        _progress.report({ message: 'Searching container repositories'});
        logUtils.logInfo(`[undeploy] Listing all container repositories in ${compartmentLogname}`);
        const containerRepositories = await ociUtils.listContainerRepositories(authProvider, compartmentId);
        if (containerRepositories) {
            const containerRepositoryNames: string[] = [];
            const projectFolder = await projectUtils.getProjectFolder(folder.folder);
            const cloudSubNames = projectUtils.getCloudSpecificSubProjectNames(projectFolder);
            if (repoNames.length > 1) {
                for (const name of repoNames) {
                    if (cloudSubNames.length) {
                        for (const subName of cloudSubNames) {
                            containerRepositoryNames.push(`${data[0].name}-${name}-${subName}`.toLowerCase());
                        }
                    } else {
                        containerRepositoryNames.push(`${data[0].name}-${name}`.toLowerCase());
                    }
                }
            } else {
                if (cloudSubNames.length) {
                    for (const subName of cloudSubNames) {
                        containerRepositoryNames.push(`${data[0].name}-${subName}`.toLowerCase());
                    }
                } else {
                    containerRepositoryNames.push(data[0].name.toLowerCase());
                }
            }
            for (const repo of containerRepositories) {
                if (containerRepositoryNames.includes(repo.displayName)) {
                    _progress.report({message : `Deleting container repository ${repo.displayName}`});
                    logUtils.logInfo(`[undeploy] Deleting container repository ${repo.displayName} in ${compartmentLogname}`);
                    await ociUtils.deleteContainerRepository(authProvider, repo.id);
                }
            }
        }
        _progress.report({ message: 'Searching OKE cluster environments'});
        logUtils.logInfo(`[undeploy] Listing all OKE cluster environments in ${projectLogname}`);
        const okeClusterEnvironments = await ociUtils.listDeployEnvironments(authProvider, devopsId);
        for (const env of okeClusterEnvironments) {
            _progress.report({message : `Deleting OKE cluster environment ${env.displayName}`});
            logUtils.logInfo(`[undeploy] Deleting OKE cluster environment ${env.displayName} in ${projectLogname}`);
            await ociUtils.deleteDeployEnvironment(authProvider, env.id);
        }
        // PENDING: knowledgebase search + deletion should be done by the Services Plugin; need API to invoke it on the OCI configuration.
        _progress.report({ message: 'Searching knowledge bases'});
        logUtils.logInfo(`[undeploy] Listing all knowledge bases in ${compartmentLogname}`);
        let knowledgeBases = await ociUtils.listKnowledgeBases(authProvider, compartmentId);
        for (let kb of knowledgeBases) {
            if ((kb.freeformTags?.['gcn_tooling_usage'] === "gcn-adm-audit") &&
                (kb.freeformTags?.['gcn_tooling_projectOCID'] == devopsId)) {
                    _progress.report({message : `Deleting knowledge base ${kb.displayName}`});
                    logUtils.logInfo(`[undeploy] Deleting knowledge base ${kb.displayName} in ${compartmentLogname}`);
                    await ociUtils.deleteKnowledgeBase(authProvider, kb.id, true);
            }
        }
        _progress.report({message : `Deleting project ${data[0].name}`});
        logUtils.logInfo(`[undeploy] Deleting devops project ${projectLogname}`);
        let p = ociUtils.deleteDevOpsProject(authProvider, devopsId);
        logUtils.logInfo(`[undeploy] Devops project ${projectLogname} deleted`);
        const gcnPath = path.join(folderPath, '.vscode', 'gcn.json');
        _progress.report({message : `Deleting GCN registration ${gcnPath}`});
        logUtils.logInfo(`[undeploy] Deleting GCN registration ${gcnPath}`);
        fs.unlinkSync(gcnPath); 
        const gcnFolderPath = path.join(folderPath, '.gcn');
        if (fs.existsSync(gcnFolderPath)) {
            _progress.report({message : 'Deleting local OCI resources'});
            logUtils.logInfo(`[undeploy] Deleting local OCI resources in ${gcnFolderPath}`);
            fs.rmdirSync(gcnFolderPath, { recursive : true});
        }

        return p;
    });
}
