
import * as devops from 'oci-devops';
import * as common from 'oci-common';
import * as core from "oci-core";
import * as adm from 'oci-adm';
import * as identity from 'oci-identity';

import * as ociUtils from './ociUtils.js';
import { artifacts, logging } from 'oci-sdk';
import { setGlobalDispatcher, EnvHttpProxyAgent } from 'undici';

const compartmentName = process.argv[2];
const projectNameRegexp = process.argv[3];
const regexp = new RegExp(projectNameRegexp, 'i');
console.log(`Asked to delete ${projectNameRegexp ? '' : 'all '}projects from compartment ${compartmentName} ${projectNameRegexp ? `matching ${projectNameRegexp}` : ''}`);


// use the default provider
const provider = new common.ConfigFileAuthenticationDetailsProvider();
const devopsClient = new devops.DevopsClient({ authenticationDetailsProvider : provider }, {
    circuitBreaker: new common.CircuitBreaker({ timeout: 20000 })
});
const idClient = new identity.IdentityClient({ authenticationDetailsProvider : provider }, {
    circuitBreaker: new common.CircuitBreaker({ timeout: 20000 })
});

let compartmentId : string;
let tenancyId : string;

let projects : devops.models.ProjectSummary[] = [];

interface Stage {
    id : string;
    displayName? : string;
}

function reverseOrderStages<T extends Stage>(ownerID : string, predecessors : (s : T) => Stage[] | undefined, stages: T[]) : T[] {

    const orderedStages: T[] = [];
    const id2Stage: Map<string, T> = new Map();

    // push leaf stages first.
    const revDeps: Map<string, number> = new Map();
    stages.sort()
    stages.forEach(s => {
        id2Stage.set(s.id, s);
        if (!revDeps.has(s.id)) {
            revDeps.set(s.id, 0);
        }
        for (let p of predecessors(s) || []) {
            if (p.id === s.id || p.id === ownerID) {
                // ??? Who invented reference-to-owner in predecessors ??
                continue;
            }
            let n = (revDeps.get(p.id) || 0);
            revDeps.set(p.id, n + 1);
        }
    });

    let rank = 0;
    while (revDeps.size > 0) {
        let found : boolean = false;
        for (let k of revDeps.keys()) {
            let r = revDeps.get(k);
            if (r === undefined) {
                r = revDeps.size;
            }
            if (r <= rank) {
                found = true;
                const s = id2Stage.get(k);
                revDeps.delete(k);
                if (!s) continue;

                orderedStages.push(s);
                console.log(`- Add stage ${s.displayName || 'unnamed'} = ${s.id}`)
            }
        }
        if (!found) {
            throw "Inconsistent pipeline structure!";
        }
        rank++;
    }
    return orderedStages;
}

async function deleteDeployPipelineContents(pipeName : string, pipeId : string) : Promise<string>{
    const stages: devops.models.DeployStageSummary[] = await ociUtils.listDeployStages(provider, pipeId);
    const orderedStages = reverseOrderStages(pipeId, (s) => s.deployStagePredecessorCollection?.items, stages);
    console.log(`Delete contents of deploy pipeline ${pipeName}(${pipeId}): ${orderedStages.map(s => s.id).join(', ')}`);
    for (let stage of orderedStages) {
        console.log(`Deleting deploy stage ${stage.displayName}(${stage.id})`);
        try {
            await ociUtils.deleteDeployStage(provider, stage.id, true);
        } catch (e : any) {
            console.log(`Error deleting deploy stage ${stage.displayName}(${stage.id}): ${e?.message }`);
        }
    }
    console.log(`Deploy pipeline ${pipeName}(${pipeId}) cleared.`);
    return pipeId;
}

async function deleteBuildPipelineContents(pipeName : string, pipeId : string) : Promise<string>{
    const stages: devops.models.BuildPipelineStageSummary[] = await ociUtils.listBuildPipelineStages(provider, pipeId);
    const orderedStages = reverseOrderStages(pipeId, (s) => s.buildPipelineStagePredecessorCollection?.items, stages);
    console.log(`Delete contents of build pipeline ${pipeName}(${pipeId}: ${orderedStages.map(s => s.id).join(', ')}`);
    for (let stage of orderedStages) {
        console.log(`Deleting build stage ${stage.displayName}(${stage.id})`);
        try {
            await ociUtils.deleteBuildPipelineStage(provider, stage.id, true);
        } catch (e : any) {
            console.log(`Error deleting build stage ${stage.displayName}(${stage.id}): ${e?.message }`);
        }
    }
    console.log(`Build pipeline ${pipeName}(${pipeId}) cleared.`);
    return pipeId;
}

/**
 * Undeploy the specified project.
 * @param pId 
 */
async function undeployProjects(project : devops.models.ProjectSummary) {
    const pId = project.id;
    let summary = await devopsClient.getProject({ projectId : pId});
    console.log(`Starting to undeploy: ${summary.project.name} (${summary.project.id})`);
    let deployPipelines: devops.models.DeployPipelineSummary[];
    let buildPipelines: devops.models.BuildPipelineSummary[];
    const delayed : Promise<string>[] = [];

    const projectDeployID = (project.freeformTags||{})['devops_tooling_deployID'];
    
    const l1 = ociUtils.listBuildPipelines(provider, pId).then((pipes) => {
        buildPipelines = pipes;
        for (let pipe of pipes) {
            console.log(`Listing stages of build pipeline ${pipe.displayName}`);
            delayed.push(deleteBuildPipelineContents(pipe.displayName || '(unnamed)', pipe.id));
        }
    });
    const l2 = ociUtils.listDeployPipelines(provider, pId).then((pipes) => {
        deployPipelines = pipes;
        for (let pipe of pipes) {
            console.log(`Listing stages of deploy pipeline ${pipe.displayName}`);
            delayed.push(deleteDeployPipelineContents(pipe.displayName || '(unnamed)', pipe.id));
        }
    });
    
    // first wait on all pipelines list, then wait for all stages to be deleted.
    // Finally, delete all the pipelines one-by-one
    await Promise.all([l1, l2]).then((_) => {
        console.log(`Waiting on ${delayed.length} pipelines to be deleted...`)
        return Promise.all(delayed);
    }).then(async (_) => {
        for (let bp of buildPipelines) {
            console.log(`Deleting build pipeline ${bp.displayName}`);
            await ociUtils.deleteBuildPipeline(provider, bp.id, true);
        }
        for (let dp of deployPipelines) {
            console.log(`Deleting deploy pipeline ${dp.displayName}`);
            await ociUtils.deleteDeployPipeline(provider, dp.id, true);
        }
        console.log(`Pipelines cleared`);
    });

    let delayedPromises : Promise<void>[] = [];

    console.log(`Deleting deploy artifacts`);
    for (let da of (await ociUtils.listDeployArtifacts(provider, pId))) {
        console.log(`Deleting Artifact: ${da.displayName}(${da.id})`);
        await ociUtils.deleteDeployArtifact(provider, da.id, true);
    }

    console.log(`Deleting container repositories`);
    
    let taggedImages : artifacts.models.ContainerRepositorySummary[]= [];
    let namedImages : artifacts.models.ContainerRepositorySummary[]= [];
    (await ociUtils.listContainerRepositories(provider, compartmentId)).forEach(cr => {
        if (cr.freeformTags['devops_tooling_projectOCID'] === pId) {
            taggedImages.push(cr);
        } else if (cr.displayName.startsWith(project.name)) {
            const rest = cr.displayName.substring(project.name.length);
            if (rest === '' || rest.startsWith(' -') || rest.startsWith('-')) {
                namedImages.push(cr);
            }
        }
    });
    if (!taggedImages.length) {
        taggedImages.push(...namedImages);
    }
    
    console.log(`Deleting conainer repositories`);
    if (taggedImages.length) {
        console.log(`Deleting ${taggedImages.length} container repositories`);
        delayedPromises.push(...(taggedImages.map(async (cr) => {
            console.log(`Deleting Container Repository: ${cr.displayName}(${cr.id})`);
            return ociUtils.deleteContainerRepository(provider, cr.id, true);
        })));
    }

    console.log(`Deleting code repositories`);
    for (let cr of await ociUtils.listCodeRepositories(provider, pId)) {
        console.log(`Deleting Code Repository: ${cr.name}(${cr.id})`);
        delayedPromises.push(ociUtils.deleteCodeRepository(provider, cr.id, true));
    }
    console.log(`Done repositories.`);

    /*
    await Promise.all(delayedPromises);

    delayedPromises = [];
    */

    let logs : logging.models.LogSummary[] = [];
    await Promise.all((await ociUtils.listLogGroups(provider, compartmentId)).map(async lg => {
        logs.push(...(await ociUtils.listLogs(provider, lg.id)).filter(lg => projectDeployID && projectDeployID === (lg.freeformTags || {})['devops_tooling_deployID']));
    }));

    console.log(`Deleting ${logs.length} logs`)
    delayedPromises.push(...logs.map(async l => {
        console.log(`Deleting log ${l.displayName}`);
        return ociUtils.deleteLog(provider, l.id, l.logGroupId, true);
    }));
    console.log(`Done logs.`);

    let audits : adm.models.VulnerabilityAuditSummary[] = [];
    let kbs : adm.models.KnowledgeBaseSummary[] = [];
    await Promise.all((await ociUtils.listKnowledgeBases(provider, compartmentId)).filter(kb => kb.freeformTags['devops_tooling_projectOCID'] === pId).map(async (kb) => {
        console.log(`Listing audits in ${kb.displayName}`);
        kbs.push(kb);
        audits.push(...(await ociUtils.listVulnerabilityAudits(provider, compartmentId, kb.id)));
    }));

    delayedPromises.push(...audits.map(async (au) => {
        console.log(`Deleting audit ${au.displayName}(${au.id}`);
        return ociUtils.deleteVulnerabilityAudit(provider, au.id, true);
    }));

    console.log(`Deleting deploy environments`);
    for (let de of await ociUtils.listDeployEnvironments(provider, pId)) {
        console.log(`Deleting deploy environment ${de.displayName}(${de.id})`);
        delayedPromises.push(ociUtils.deleteDeployEnvironment(provider, de.id, true));
    }
    console.log(`Done deploy environments`);

    console.log(`Waiting for ${delayedPromises.length} deletes to complete.`);
    await Promise.all(delayedPromises);

    // Delete containers. For KnowledgeBases, Audits must be deleted; for Artifact Repositories, artifacts must be deleted.
    let delayedContainers : Promise<void>[] = [];

    delayedContainers.push(...kbs.map(async (kb) => {
        console.log(`Deleting knowledge base ${kb.displayName}(${kb.id}`);                
        return ociUtils.deleteKnowledgeBase(provider, kb.id);
    }));

    delayedContainers.push(...(await (ociUtils.listArtifactRepositories(provider, compartmentId))).filter(ar => ar.freeformTags['devops_tooling_projectOCID'] === pId).map(async (ar) => {
        console.log(`Deleting artifact repository ${ar.displayName}(${ar.id})`);
        return ociUtils.deleteArtifactsRepository(provider, compartmentId, ar.id, true);
    }));
    console.log(`Artifact repositories cleaned`);

    console.log(`Waiting for ${delayedContainers.length} container deletes to complete`);

    console.log(`Deleting devops project ${project.name}`);

    return ociUtils.deleteDevOpsProject(provider, pId, true);
}

let opts = {};
if (process.env['GLOBAL_AGENT_HTTP_PROXY']) {
    opts = {
        httpProxy: process.env['GLOBAL_AGENT_HTTP_PROXY'],
        httpsProxy: process.env['GLOBAL_AGENT_HTTP_PROXY'],
        noProxy: process.env['GLOBAL_AGENT_NO_PROXY']
    };
}
const dispatcher = new EnvHttpProxyAgent(opts);
setGlobalDispatcher(dispatcher);


let projectNames : string[] = [];

async function main() {
    const t = (await idClient.getTenancy( { tenancyId : provider.getTenantId() })).tenancy.id;
    if (!t) {
        console.log(`No tenancy found for OCID ${provider.getTenantId}`);
        process.exit(1);
    }
    tenancyId = t;
    let cid;
    let path = compartmentName.split('/');
    let parentId = t;
    let cnt = 0;
    for (let n of path) {
        cnt++;
        let found = undefined;
        for (let c of (await idClient.listCompartments({
            compartmentId: parentId,
            accessLevel: identity.requests.ListCompartmentsRequest.AccessLevel.Accessible,
            name: n
            })).items) {
            found = c.id;
            break;
        }
        if (!found) {
            console.log(`No compartment ${path.slice(0, cnt).join('/')} found in tenancy ${t}`);
            process.exit(2);
        }
        parentId = found;
    }
    cid = parentId;
    if (!cid) {
        console.log(`No compartment ${compartmentName} found in tenancy ${t}`);
        process.exit(2);
    }
    compartmentId = cid;
    
    console.log(`Compartment OCID: ${compartmentId}`);

    let projectList = await devopsClient.listProjects({compartmentId});

    for (let p of projectList.projectCollection.items) {
        if (projectNameRegexp && !regexp.test(p.name)) {
            continue;
        }
        console.log(`Found: ${p.name}`);
        projects.push(p);
        projectNames.push(p.name);
    }

    const client = new artifacts.ArtifactsClient({ authenticationDetailsProvider: provider });

    const containerRequest: artifacts.requests.ListContainerImagesRequest = {
        compartmentId: compartmentId
    };
    let imagePromises : Promise<any>[] = [];

    function nameMatches(n : string) : boolean {
        if (projectNames.length) {
            return !!projectNames.find(v => n.startsWith(v));
        } else {
            return regexp.test(n);
        }
    }

    async function undeployImageList(response: artifacts.responses.ListContainerImagesResponse) : Promise<any> {
        console.log(`Listed ${response.containerImageCollection.items.length} images`);
        response.containerImageCollection.items.forEach(i => {
            let r : artifacts.requests.DeleteContainerImageRequest = {
                imageId: i.id
            };
            if (nameMatches(i.displayName)) {
                console.log(`Deleting image: ${i.displayName}`);
                imagePromises.push(client.deleteContainerImage(r));
            }
        });
        if (!response.opcNextPage) {
            return;
        }
        const nextRequest: artifacts.requests.ListContainerImagesRequest = {
            compartmentId: compartmentId,
            page: response.opcNextPage
        };
        return client.listContainerImages(nextRequest).then(r2 => undeployImageList(r2));
    }

    let imagePromise = client.listContainerImages(containerRequest).then(response => undeployImageList(response));

    console.log("Checking container images");
    await imagePromise;
    if (imagePromises.length) {
        console.log(`Waiting for container images to be deleted...`);
    }
    await Promise.all(imagePromises);

    let registryRequest : artifacts.requests.ListContainerRepositoriesRequest = {
        compartmentId: compartmentId
    };

    let repositoryPromises : Promise<any>[] = [];

    async function deleteImageRepositories(response : artifacts.responses.ListContainerRepositoriesResponse) : Promise<any> {
        console.log(`Listed ${response.containerRepositoryCollection.items.length} repositories`);
        response.containerRepositoryCollection.items.forEach(r => {
            if (nameMatches(r.displayName)) {
                let d : artifacts.requests.DeleteContainerRepositoryRequest = {
                    repositoryId: r.id
                }
                console.log(`Deleting container repository: ${r.displayName}`);
                repositoryPromises.push(client.deleteContainerRepository(d));
            }
        });
        if (response.opcNextPage) {
            let nextRequest : artifacts.requests.ListContainerRepositoriesRequest = {
                compartmentId: compartmentId,
                page: response.opcNextPage
            };
            return client.listContainerRepositories(nextRequest).then(r => deleteImageRepositories(r));
        }
    }

    console.log("Listing container repositories");
    let repositoryP = client.listContainerRepositories(registryRequest).then(response => deleteImageRepositories(response));
    await repositoryP;
    if (repositoryPromises.length) {
        console.log('Waiting to delete container repositories');
    }
    await Promise.all(repositoryPromises);

    await Promise.all(projects.map(async (p) => undeployProjects(p) ));

    const admClient = new adm.ApplicationDependencyManagementClient({ authenticationDetailsProvider: provider });
    const request: adm.requests.ListKnowledgeBasesRequest = {
        compartmentId: compartmentId,
        lifecycleState: adm.models.KnowledgeBase.LifecycleState.Active,
        limit: 1000
    };
    const result: adm.models.KnowledgeBaseSummary[] = [];
    do {
        const response = await admClient.listKnowledgeBases(request);
        result.push(...response.knowledgeBaseCollection.items);
        request.page = response.opcNextPage;
    } while (request.page);
    console.log(`Listed ${result.length} knowledgebases`);
    let knowledgePromises :  Promise<any>[] = [];
    for (let kbs of result) {
        if (!nameMatches(kbs.displayName)) {
            continue;
        }
        let delReq : adm.requests.DeleteKnowledgeBaseRequest = {
            knowledgeBaseId : kbs.id
        }
        console.log(`Deleting knowledgebase ${kbs.displayName}`);
        knowledgePromises.push(admClient.deleteKnowledgeBase(delReq));
    }
    if (knowledgePromises.length) {
        console.log("Waiting to delete knowledge bases");
    }
    await Promise.all(knowledgePromises);
    return result;

}

main();

