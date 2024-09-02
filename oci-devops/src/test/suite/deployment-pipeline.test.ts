import * as assert from 'assert';
import * as vscode from 'vscode';
import { waitForStatup } from './common';
import * as ociAuthentication from '../../oci/ociAuthentication';
import * as ociUtils from '../../oci/ociUtils';
import * as vcnUtils from '../../oci/vcnUtils';
import * as deployUtils from '../../oci/deployUtils';
import * as projectUtils from '../../projectUtils';
import { ConfigFileAuthenticationDetailsProvider, devops} from 'oci-sdk';
import { DeployOptions } from '../../oci/deployUtils';
import { getDefaultConfigFile, listProfiles } from '../../oci/ociAuthentication';
import { RESOURCES } from '../../oci/ociResources';
import { containerengine } from 'oci-sdk';

/**
 * Types used to reduce the number of arguments passed to functions
 */

type AuthCredentials = {
    provider: ConfigFileAuthenticationDetailsProvider,
    compartmentID: string,
}

type ProjectProvider = {
    provider: ConfigFileAuthenticationDetailsProvider,
    projectId: string,
}

type ProjectInfo = {
    project: devops.models.Project,
    projectFolder: projectUtils.ProjectFolder, 
}

type OciResources = {
    cluster?: containerengine.models.Cluster,
    secretName: string,
    image: string,
}

type Repository = {
    id: string,
    name: string
}

type Subnet = {
    id: string,
    compartmentID: string
}

type OkeConfig = {
    okeClusterEnvironment?: devops.models.DeployEnvironmentSummary, 
    setupCommandSpecArtifact: string, 
    deployConfigArtifact: string,
}

type DeploymentResources = {
    auth: AuthCredentials,
    projectInfo: ProjectInfo,
    pipeline: devops.models.BuildPipelineSummary,
    repository: Repository,
    subnet: Subnet,
    okeConfig: OkeConfig
}

/**
 * Methods used to interact with OCI and read/write the appropriate resources
 */
async function activateExtension(): Promise<void> {
    const ext = vscode.extensions.getExtension("oracle-labs-graalvm.oci-devops");
    assert.ok(ext, "OCI DevOps extension not found! - Line 71");

    await ext.activate();
    assert.ok(ext.isActive, "OCI DevOps extension failed to activate! - Line 74");
}

function selectDefaultProfile(): string {
    function getProfile(profiles : string[]) : string {
        if (profiles.length === 1)
            return  profiles[0];
        else if (profiles.indexOf("TESTS") !== -1)
            return "TESTS";
        else if (profiles.indexOf("DEFAULT") !== -1)
            return "DEFAULT";
        else {
            return "";
        }
    }

    const defaultConfig = getDefaultConfigFile();
    const profiles = listProfiles(defaultConfig);
    assert.ok(profiles.length>0, "No configuration profiles found - Line 92");
    let selectedProfile = getProfile(profiles);
    assert.ok(selectedProfile!=="", "Default profile cannot be found. Make sure to have [DEFAULT] or [TESTS] profile in oci config. - Line 94");

    return selectedProfile;
}

async function getProviderWhenAuthenticate(action: string, profile: string): Promise<ConfigFileAuthenticationDetailsProvider> {
    // authenticate
    let auth = await ociAuthentication.resolve(action, profile);
    assert.ok(auth, "Authentication failed! Check your oci config. - Line 102");

    const configurationProblem = auth.getConfigurationProblem();
    assert.ok(!configurationProblem, "Configuration Problems:  - Line 105" + configurationProblem);

    return new Promise((resolve) => {
        assert.ok(auth, "Authentication failed! Check your oci config. - Line 108");
        let provider = auth.getProvider();
        resolve(provider);
    })
}

async function undeployProjectIfExist(auth: AuthCredentials, projectName: string ): Promise<void> {
    let DevOpsProjects : devops.models.ProjectSummary[] = await ociUtils.listDevOpsProjects(auth.provider, auth.compartmentID);
    for (let project of DevOpsProjects) {
        if (project.name === projectName) {
            await vscode.commands.executeCommand("oci.devops.undeployFromCloudSync");
            await ociUtils.deleteDevOpsProject(auth.provider, project.id, true);
        }
    }
}

async function getCompartmentName(auth: AuthCredentials): Promise<string> {
    let compartment = await ociUtils.getCompartment(auth.provider, auth.compartmentID);
    return compartment.name;
}

async function assertBuildCreation(project: ProjectProvider): Promise<void> {
    let buildPipelines = await ociUtils.listBuildPipelines(project.provider, project.projectId);
    assert.ok(buildPipelines.length > 0, "No Build Pipelines created - Line 131");
}

async function assertCodeRepositoryCreation(project: ProjectProvider): Promise<string> {
    return new Promise(async (resolve) => {
        let codeRepositories = await ociUtils.listCodeRepositories(project.provider, project.projectId);
        assert.ok(codeRepositories.length > 0, "Code Repository Not Found - Line 137");
        resolve(codeRepositories[0].id);        
    })

}

async function getDevopsProject(input: ProjectProvider): Promise<devops.models.Project> {
    return new Promise(async (resolve) => {
        let project = await ociUtils.getDevopsProject(input.provider, input.projectId);
        assert.ok(project.id, "Project Not Found in OCI - Line 146");
        resolve(project);
    })
}

async function getProjectId(auth: AuthCredentials, projectName: string): Promise<string> {
    return new Promise(async (resolve) => {
        let projectId = "";
        let devOpsProjects = await ociUtils.listDevOpsProjects(auth.provider, auth.compartmentID);
        for (let project of devOpsProjects) {
            if (project.name === projectName) {
                projectId = project.id;
            }
        }

        resolve(projectId);
    })

}

async function getCluster(auth: AuthCredentials): Promise<containerengine.models.Cluster> {
    return new Promise(async (resolve) => {
        let clusters = await ociUtils.listClusters(auth.provider, auth.compartmentID);
        assert.ok(clusters && clusters.length > 0, "No cluster Found in your compartment - Line 169");
        resolve(clusters[0] as containerengine.models.Cluster )
    })
}

async function getJVMBuildPipeline(input: ProjectProvider, repositryId: string): Promise<devops.models.BuildPipelineSummary> {

    return new Promise(async (resolve) => {
        let buildPipelines = await ociUtils.listBuildPipelinesByCodeRepository(input.provider, input.projectId, repositryId);
        assert.ok(buildPipelines.length > 0, "Build Pipelines Not Created - Line 178");

        const existingBuildPipelines = buildPipelines?.filter(item => 'oci' === item.freeformTags?.devops_tooling_docker_image);
        assert.ok(existingBuildPipelines.length > 0, "Build Pipelines Not Created - Line 181");

        let pipeline = existingBuildPipelines.filter(pipe => pipe.displayName?.includes("JVM Container"))[0];
        assert.ok(pipeline, "Build Pipeline JVM Not Created - Line 184");
        resolve(pipeline)
    })

}

async function getJVMBuildPipelineStage(provider: ConfigFileAuthenticationDetailsProvider, buildPipelineId: string): Promise<devops.models.DeliverArtifactStageSummary> {
    return new Promise(async (resolve) => {
        let pipelineStages = await ociUtils.listBuildPipelineStages(provider, buildPipelineId);
        assert.ok(pipelineStages.length > 0, "Build Stages Not Created - Line 193");

        const item = pipelineStages.find(item => item.buildPipelineStageType === devops.models.DeliverArtifactStageSummary.buildPipelineStageType) as devops.models.DeliverArtifactStageSummary;
        assert.ok(item?.deliverArtifactCollection.items.length, "Item Not Found - Line 196");
        resolve(item);
    })
}

async function getDeployArtifactImage(provider: ConfigFileAuthenticationDetailsProvider, artifactId: string): Promise<string> {
    return new Promise(async (resolve) => {
        const artifact = await ociUtils.getDeployArtifact(provider, artifactId);
        assert.ok(artifact.deployArtifactSource.deployArtifactSourceType === devops.models.OcirDeployArtifactSource.deployArtifactSourceType, "Artifact Not Found - Line 204");
        let image = (artifact.deployArtifactSource as devops.models.OcirDeployArtifactSource).imageUri;
        assert.ok(image, "No Image Found - Line 206");
        resolve(image);        
    })

}

async function getOkeClusterEnvironment(provider: ConfigFileAuthenticationDetailsProvider, project:devops.models.Project, cluster: containerengine.models.Cluster): Promise<devops.models.DeployEnvironmentSummary> {
    
    return new Promise(async (resolve) => {
        
        let deployEnvironments = await ociUtils.listDeployEnvironments(provider, project.id);

        let existingDeployEnvironments = deployEnvironments.filter(env => {
            if (env.deployEnvironmentType === devops.models.OkeClusterDeployEnvironmentSummary.deployEnvironmentType) {
                assert(cluster, "Cluster is undefined - Line 220");
                return (env as devops.models.OkeClusterDeployEnvironmentSummary).clusterId === cluster.id;
            }
            return;
        });

        assert.ok(cluster.id, "Cluster Id is undefined - Line 226");
        const okeClusterEnvironment = existingDeployEnvironments?.length ? existingDeployEnvironments[0] 
            : await ociUtils.createOkeDeployEnvironment(provider, project.id, project.name, cluster.id);
        assert.ok(okeClusterEnvironment, " okeClusterEnvironment  Undefined - Line 229");

        resolve(okeClusterEnvironment);    
    })

    
}

async function setupCommandSpecArtifactAndDeployConfigArtifact(provider: ConfigFileAuthenticationDetailsProvider, project: devops.models.Project, repository: Repository, ociResources: OciResources): Promise<OkeConfig> {
    return await vscode.window.withProgress({
        title: "Setup CommandSpecArtifact and DeployConfigArtifact",
        location: vscode.ProgressLocation.Notification,
        cancellable: false
    }, (_progress, _token) => {
        return new Promise(async (resolve) => {
            const deployArtifacts = await ociUtils.listDeployArtifacts(provider, project.id);
            assert.ok(deployArtifacts.length>0, " Deployment Artifacts Not Found - Line 245");
        
            let setupCommandSpecArtifact = deployArtifacts?.find(env => {
                assert(ociResources.cluster, "Cluster is Not Found - Line 248");
                return env.deployArtifactType === devops.models.DeployArtifact.DeployArtifactType.CommandSpec && env.freeformTags?.devops_tooling_oke_cluster === ociResources.cluster.id;
            })?.id;
        
            let extensionPath = vscode.extensions.getExtension("oracle-labs-graalvm.oci-devops")?.extensionPath;
            assert.ok(extensionPath, "Extension Path Not Found - Line 253");
        
            if (!setupCommandSpecArtifact) {
                    
                let repoEndpoint = `${provider.getRegion().regionCode}.ocir.io`;
                assert.ok(ociResources.cluster && ociResources.cluster.id, "Cluster with given Id not Found - Line 259");
                const inlineContent = deployUtils.expandTemplate(RESOURCES['oke_pod_deletion.yaml'], {
                    repo_endpoint: repoEndpoint,
                    region: provider.getRegion().regionId,
                    cluster_id: ociResources.cluster.id,
                    secret_name: ociResources.secretName
                });
                assert(inlineContent, "setupCommandSpecArtifact: inline Content is undefined - line 266");
                const artifactName = `${repository.name}_oke_deploy_docker_secret_setup_command`;
                const artifactDescription = `OKE deployment docker secret setup command specification artifact for devops project ${project} & repository ${repository.name}`;
                const okeDeploySetupCommandArtifact = (await ociUtils.createOkeDeploySetupCommandArtifact(provider, project.id, inlineContent, artifactName, artifactDescription, {
                    'devops_tooling_oke_cluster': ociResources.cluster.id
                })).id;
                assert(okeDeploySetupCommandArtifact!=="", "setupCommandSpecArtifact: okeDeploySetupCommandArtifact Error - Line 272");
        
                
                setupCommandSpecArtifact = okeDeploySetupCommandArtifact;
            }       
        
            let deployConfigArtifact = deployArtifacts?.find(env => {
                return env.deployArtifactType === devops.models.DeployArtifact.DeployArtifactType.KubernetesManifest && env.freeformTags?.devops_tooling_image_name === ociResources.image;
            })?.id;
        
            if (!deployConfigArtifact) {
        
                let inlineContent = deployUtils.expandTemplate(RESOURCES['oke_deploy_config.yaml'], {
                    image_name: ociResources.image,
                    app_name: repository.name.toLowerCase().replace(/[^0-9a-z]+/g, '-'),
                    secret_name: ociResources.secretName
                });
        
                assert(inlineContent, "deployConfigArtifact: inline Content is undefined - Line 290");
                const jvm = ociResources.image.endsWith('-jvm:${DOCKER_TAG}');
                const artifactName = `${repository.name}_oke_deploy_${jvm ? 'jvm' : 'ni'}_configuration`;
                const artifactDescription = `OKE ${jvm ? 'jvm' : 'native'} deployment configuration artifact for devops project ${project.name} & repository ${repository.name}`;
                const artifact = (await ociUtils.createOkeDeployConfigurationArtifact(provider, project.id, inlineContent, artifactName, artifactDescription, {
                    'devops_tooling_codeRepoID':repository.id,
                    'devops_tooling_image_name': ociResources.image
                })).id;
                assert(artifact!=="", "deployConfigArtifact: okeDeploySetupCommandArtifact Error - Line 298");
        
                deployConfigArtifact = artifact;
            }
            let okeConfig: OkeConfig = {
                okeClusterEnvironment: undefined,
                setupCommandSpecArtifact, 
                deployConfigArtifact
            }
            resolve(okeConfig);
        })
    })
}

async function getDeploymentResources(auth: AuthCredentials, projectProvider: ProjectProvider, repositoryId: string,wf: readonly vscode.WorkspaceFolder[]): Promise<DeploymentResources> {
    return await vscode.window.withProgress({
        title: "Collect Resources to create Deployment...",
        location: vscode.ProgressLocation.Notification,
        cancellable: false
    }, (_progress, _token) => {
        return new Promise(async (resolve) => {
            
            const project = await getDevopsProject(projectProvider);
    
            const repositoryName = (await ociUtils.getCodeRepository(auth.provider, repositoryId)).name || project.name;
            assert.ok(repositoryName, "Repository Not Found - Line 323");
    
            const projectFolder = await projectUtils.getProjectFolder(wf[0]);
            assert.ok(projectFolder, "ProjectFolder Not Found - Line 326");
    
            
            let cluster = await getCluster(auth);
    
            let pipeline = await getJVMBuildPipeline(projectProvider, repositoryId);
            
            const item = await getJVMBuildPipelineStage(auth.provider, pipeline.id);
    
            let image = await getDeployArtifactImage(auth.provider, item.deliverArtifactCollection.items[0].artifactId );
    
            assert.ok(cluster.vcnId, "vcnID is Undefined - Line 337");
            const subnet = await vcnUtils.selectNetwork(auth.provider, cluster.vcnId);
            assert.ok(subnet, " subnet is Undefined - Line 339");
           
            const okeClusterEnvironment = await getOkeClusterEnvironment(auth.provider, project, cluster);
            
            const secretName = 'docker-bearer-vscode-generated-ocirsecre';
            
            let repository: Repository = {
                id: repositoryId,
                name: repositoryName
            }
            
            let ociResources: OciResources = {
                image: image,
                secretName: secretName,
                cluster: cluster
            }
            let okeConfig: OkeConfig = await setupCommandSpecArtifactAndDeployConfigArtifact(auth.provider, project, repository, ociResources )
            okeConfig.okeClusterEnvironment = okeClusterEnvironment;
    
            let projectInfo: ProjectInfo = {
                project: project,
                projectFolder: projectFolder
            }

            let deploy: DeploymentResources = {
                auth: auth,
                okeConfig: okeConfig,
                pipeline: pipeline,
                projectInfo: projectInfo,
                repository: repository,
                subnet: subnet
            }

            resolve(deploy);
        })
    })
}

async function createJVMDeploymentPipeline(deploy: DeploymentResources): Promise<string> {
    return await vscode.window.withProgress({
        title: "Start creating Deployment Pipeline...",
        location: vscode.ProgressLocation.Notification,
        cancellable: false
    }, (_progress, _token) => {
        return new Promise(async (resolve) => {
            const codeRepoPrefix = (deploy.pipeline.freeformTags?.devops_tooling_codeRepoPrefix || '');
            const displayNamePrefix = codeRepoPrefix + 'Build ';
            const displayName = deploy.pipeline.displayName?.startsWith(displayNamePrefix) ? deploy.pipeline.displayName.slice(displayNamePrefix.length) : `${deploy.projectInfo.projectFolder.projectType === 'GDK' ? ' OCI ' : ' '}Container`;
            const deployPipelineName = `Deploy ${displayName} to OKE`;
            const descriptionPrefix = 'Build pipeline to build ';
            const descriptionPart = deploy.pipeline.description?.startsWith(descriptionPrefix) ? deploy.pipeline.description.slice(descriptionPrefix.length) : `container for ${deploy.projectInfo.projectFolder.projectType === 'GDK' ? 'OCI & ' : ''}devops project ${deploy.projectInfo.project.name} & repository ${deploy.repository.name}`;
            const deployPipelineDescription = `Deployment pipeline to deploy ${descriptionPart} to OKE`;
            const tags: { [key:string]: string } = {
                'devops_tooling_codeRepoID': deploy.repository.id,
                'devops_tooling_buildPipelineOCID': deploy.pipeline.id,
                'devops_tooling_okeDeploymentName': deploy.repository.name.toLowerCase().replace(/[^0-9a-z]+/g, '-')
            };
            if (codeRepoPrefix.length) {
                tags.devops_tooling_codeRepoPrefix = codeRepoPrefix;
            }

            assert.ok(deploy.subnet, "Subnet Not Exist at all - Line 400");
            try {
                await ociUtils.updateCompartmentAccessPolicies(deploy.auth.provider, deploy.auth.compartmentID, deploy.auth.compartmentID, deploy.subnet.compartmentID);
            } catch (error) {
                console.warn("Policies: ", error);
            }
            
            let deployPipeline;
            try {
                deployPipeline = (await ociUtils.createDeployPipeline(deploy.auth.provider, deploy.projectInfo.project.id, `${codeRepoPrefix}${deployPipelineName}`, deployPipelineDescription, [{
                    name: 'DOCKER_TAG',
                    defaultValue: 'latest'
                }], tags));
            } catch (error) {
                console.warn("Deployment Pipeline: ", error);
                
            }

            assert.ok(deployPipeline, "deployPipeline Not Found - Line 418");

            let setupSecretStage;
            try {
                setupSecretStage = await ociUtils.createSetupKubernetesPodDeletionStage(deploy.auth.provider, deployPipeline.id, deploy.okeConfig.setupCommandSpecArtifact, deploy.subnet.id);
            } catch (error) {
                console.warn("setupSecretStage: ", error); 
            }

            assert.ok(setupSecretStage, "setupSecretStage Not Found - Line 427");
            assert.ok(deploy.okeConfig.okeClusterEnvironment, "Oke Cluster Environment Error - Line 428");
            let deployStage = await ociUtils.createDeployToOkeStage('Deploy to OKE', deploy.auth.provider, deployPipeline.id, setupSecretStage.id, deploy.okeConfig.okeClusterEnvironment.id, deploy.okeConfig.deployConfigArtifact);
            assert.ok(deployStage, "deployStage Not Exist at all - Line 430");

            let deployPipelines = await  ociUtils.listDeployPipelines(deploy.auth.provider, deploy.projectInfo.project.id);
            assert.ok(deployPipelines.length > 0, "Deployment pipelines not created - Line 433");

            resolve(deployPipelines[0].id);
        })
    })
}

async function deletePipelineStages(auth: AuthCredentials, deploymentId: string): Promise<void> {
    
    let deployPipelineStages = await ociUtils.listDeployStages(auth.provider, deploymentId);
    assert.ok(deployPipelineStages.length > 0, "deploy Pipeline Stages Not Found - Line 443");

    for (const stage of deployPipelineStages) {
        await ociUtils.deleteDeployStage(auth.provider, stage.id, true);
    }

    deployPipelineStages = await ociUtils.listDeployStages(auth.provider, deploymentId);
    assert.ok(deployPipelineStages.length === 0, "deploy Environments Not Deleted - Line 450");
}

async function deleteEnvironment(projectProvider: ProjectProvider) {
    assert.ok(projectProvider.provider, "Provider is undefined - Line 454");;
    let deployEnvironments = await ociUtils.listDeployEnvironments(projectProvider.provider, projectProvider.projectId);
    assert.ok(deployEnvironments.length > 0, "deploy Environments Not found - Line 456");

    let deployEnvironmentId = deployEnvironments[0].id;
    await ociUtils.deleteDeployEnvironment(projectProvider.provider, deployEnvironmentId, true);

    deployEnvironments = await ociUtils.listDeployEnvironments(projectProvider.provider, projectProvider.projectId);
    assert.ok(deployEnvironments.length === 0, "deploy Environments Not Deleted - Line 462");
}

async function deleteDeploymentPipeline(projectProvider: ProjectProvider, deploymentId: string): Promise<void> {
    await ociUtils.deleteDeployPipeline(projectProvider.provider, deploymentId, true);

    let deployPipelines = await ociUtils.listDeployEnvironments(projectProvider.provider, projectProvider.projectId);
    assert.ok(deployPipelines.length === 0, "deploy Environments Not Deleted");
}

let wf = vscode.workspace.workspaceFolders;

suite("Test OCI Devops Tools Features", function() {
    
    /* Wait for the NBLS to start */
	this.timeout(5*60*1000);
	this.beforeAll(async () => {
	        await waitForStatup(wf![0]);
	});

    /**
     * CMPARTMENT_OCID: require your OCID to be as environment variable under name TEST_DEPLOY_COMPARTMENT_OCID
     */
    const COMPARTMENT_OCID : string | undefined =   process.env["TEST_DEPLOY_COMPARTMENT_OCID"] || undefined;
    const DEPLOY_PROJECT_NAME : string =  process.env["TEST_DEPLOY_PROJECT_NAME"] || "base-oci-template";
    let DEPLOY_COMPARTMENT_NAME: string;
    const ACTION_NAME = 'Deploy to OCI';

    let selectedProfile : string = "";
    let auth: AuthCredentials;
    let projectProvider: ProjectProvider;

    let deployPipelineId = "";
    let codeRepositoryId : string | undefined;


    test("Create OCI Devops Project", async () => {
        // activate extension
        await activateExtension();

        // assert that COMPARTMENT_OCID is added to the environment variable
        assert.ok(COMPARTMENT_OCID, "require your OCID to be as environment variable under name TEST_DEPLOY_COMPARTMENT_OCID - Line 503")
        
        // Get profile
        selectedProfile = selectDefaultProfile();

        // get Provider
        let provider: ConfigFileAuthenticationDetailsProvider = await getProviderWhenAuthenticate(ACTION_NAME, selectedProfile);
        auth = {
            provider: provider,
            compartmentID: COMPARTMENT_OCID
        }

        // left from previous unsuccessfull runs
        await undeployProjectIfExist(auth, DEPLOY_PROJECT_NAME);

        DEPLOY_COMPARTMENT_NAME = await getCompartmentName(auth);
        
        const deployOptions : DeployOptions = {
            compartment: {
                ocid: COMPARTMENT_OCID,
                name: `gcn-dev/${DEPLOY_COMPARTMENT_NAME}`,
            },
            skipOKESupport: true,
            projectName: DEPLOY_PROJECT_NAME,
            selectProfile: selectedProfile,
            autoConfirmDeploy: true
        };

        await vscode.commands.executeCommand("oci.devops.deployToCloud_GlobalSync", deployOptions);

        let projectId = await getProjectId(auth, DEPLOY_PROJECT_NAME);
        projectProvider = {
            projectId: projectId,
            provider: provider
        }
        
    });

    test("Check build pipelines",  async function() {
        await assertBuildCreation(projectProvider)
    });

    test("Check Code Repository", async function() {
        codeRepositoryId = await assertCodeRepositoryCreation(projectProvider);
    });

    test("Create Deployment pipeline", async function() {
        assert.ok(wf, "Workspace is empty - Line 550");
        assert.ok(codeRepositoryId, "Code Repository Id Not Found - Line 551");

        let deployResources: DeploymentResources = await getDeploymentResources(auth, projectProvider, codeRepositoryId, wf);
        deployPipelineId = await createJVMDeploymentPipeline(deployResources );
    });

    test("Delete Deploy Pipeline Stages & Artifacts",async () => {
        assert.ok(deployPipelineId!=="", "Deploy pipeline not found - Line 558");
        await deletePipelineStages(auth, deployPipelineId);
    });

    test("Delete Deploy Environment",async () => {
       await deleteEnvironment(projectProvider);
    });

    test("Delete Deploy Pipeline",async () => {
        await deleteDeploymentPipeline(projectProvider, deployPipelineId);
    });

    test("Test cleanup", async () => {
        await vscode.commands.executeCommand("oci.devops.undeployFromCloudSync");
    });

});