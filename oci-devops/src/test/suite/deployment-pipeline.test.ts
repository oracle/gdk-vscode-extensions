import * as assert from 'assert';
import * as vscode from 'vscode';
import { waitForStatup } from './extension.test';
import * as ociAuthentication from '../../oci/ociAuthentication';
import * as ociUtils from '../../oci/ociUtils';
// import * as okeUtils from '../../oci/okeUtils';
import * as vcnUtils from '../../oci/vcnUtils';
import * as deployUtils from '../../oci/deployUtils';
import * as projectUtils from '../../projectUtils';
import { ConfigFileAuthenticationDetailsProvider, devops} from 'oci-sdk';
import { DeployOptions } from '../../oci/deployUtils';
import { getDefaultConfigFile, listProfiles } from '../../oci/ociAuthentication';
import { containerengine } from 'oci-sdk';

import path = require('path');


let wf = vscode.workspace.workspaceFolders;

export function getProfile(profiles : string[]) : string {
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

suite("Test OCI Devops Tools Features", function() {

	vscode.window.showInformationMessage('Start all tests.');
    
    /* Wait for the NBLS to start */
	this.timeout(5*60*1000);
	this.beforeAll(async () => {
	        await waitForStatup(wf![0]);
	});

    const DEPLOY_COMPARTMENT_NAME : string = "tests";
    const DEPLOY_PROJECT_NAME : string = (process.env["TEST_DEPLOY_PROJECT_NAME"] ? process.env["TEST_DEPLOY_PROJECT_NAME"] : "base-oci-template-test");
    const COMPARTMENT_OCID : string =  (process.env["TEST_DEPLOY_COMPARTMENT_OCID"] ? process.env["TEST_DEPLOY_COMPARTMENT_OCID"] : "ocid1.compartment.oc1..aaaaaaaa7thgaondgokuwyujlq4tosnpfaohdivlbbr64izsx5jxfxrezxca" );
    const ACTION_NAME = 'Deploy to OCI';
    // const REGION_ID = "us-phoenix-1";

    let provider : ConfigFileAuthenticationDetailsProvider | undefined;

    let selectProfile : string = "";
    let projectId : string = "";

    let auth: ociAuthentication.Authentication | undefined;
    // activate extension, authenticate, deploy
    
    test("Create OCI Devops Project", async () => {
        // activate extension
        const ext = vscode.extensions.getExtension("oracle-labs-graalvm.oci-devops");
        assert.ok(ext, "OCI DevOps extension not found!");

        await ext.activate();
        assert.ok(ext.isActive, "OCI DevOps extension failed to activate!");

        // Get profile
        const defaultConfig = getDefaultConfigFile();
        const profiles = listProfiles(defaultConfig);
        assert.ok(profiles.length>0, "No configuration profiles");

        selectProfile = getProfile(profiles);
        assert.ok(selectProfile!=="", "Default profile cannot be determined. Make sure to have [DEFAULT] or [TESTS] profile in oci config.");
   
        // authenticate
        auth = await ociAuthentication.resolve(ACTION_NAME, selectProfile);
        assert.ok(auth, "Authentication failed! Check your oci config.");

        const configurationProblem = auth.getConfigurationProblem();
        assert.ok(!configurationProblem, configurationProblem);

        // close git to prevent from identifying the parent project
        await vscode.commands.executeCommand("git.close");

        provider = auth.getProvider();

        // left from previos unsuccessfull runs
        let DevOpsProjects : devops.models.ProjectSummary[] = await ociUtils.listDevOpsProjects(provider, COMPARTMENT_OCID);
        for (let project of DevOpsProjects) {
            if (project.name === DEPLOY_PROJECT_NAME) {
                await vscode.commands.executeCommand("oci.devops.undeployFromCloudSync");
                await ociUtils.deleteDevOpsProject(provider, project.id, true);
            }
        }

        const deployOptions : DeployOptions = {
            compartment: {
                ocid: COMPARTMENT_OCID,
                name: "gcn-dev/"+DEPLOY_COMPARTMENT_NAME,
            },
            skipOKESupport: true,
            projectName: DEPLOY_PROJECT_NAME,
            selectProfile: selectProfile,
            autoConfirmDeploy: true
        };

        await vscode.commands.executeCommand("oci.devops.deployToCloud_GlobalSync", deployOptions);
        // await vscode.commands.executeCommand("oci.devops.deployToCloud_Global");

        DevOpsProjects = await ociUtils.listDevOpsProjects(provider, COMPARTMENT_OCID);
        for (let project of DevOpsProjects) {
            if (project.name === DEPLOY_PROJECT_NAME) {
                projectId = project.id;
            }
        }
        
    });

    
    // test("Check build pipelines",  async function() {
    //     assert.ok(provider, "Provider not authenticated");
    //     assert.ok(projectId, "Project Id Not Found");
        
    //     let buildPipelines = await ociUtils.listBuildPipelines(provider, projectId);
    //     assert.ok(buildPipelines.length > 0, "No Build Pipelines is created");
                
    // });

    let codeRepositoryId : string | undefined;
    test("Check Code Repository", async function() {
        assert.ok(provider, "Provider not authenticated");
        assert.ok(projectId, "Project Id Not Found");

        let codeRepositories = await ociUtils.listCodeRepositories(provider, projectId);
        codeRepositoryId = codeRepositories[0].id;
        assert.ok(codeRepositories.length > 0, "Code Repository Not Found");
    });

    let deployPipelineId = "";
    test("Create Deployment pipeline", async function() {

        assert.ok(provider, "Provider not authenticated");
        assert.ok(wf, "Workspace empty");
        assert.ok(auth, "Not Authenticated");
        assert.ok(projectId, "Project Id Not Found");
        assert.ok(codeRepositoryId, "Code Repository Id Not Found");

        const project = await ociUtils.getDevopsProject(provider, projectId);
        assert.ok(project, "Project Not Found");

        const repositoryName = (await ociUtils.getCodeRepository(provider, codeRepositoryId)).name || project.name;
        assert.ok(repositoryName, "Repository Not Found");

        const projectFolder = await projectUtils.getProjectFolder(wf[0]);
        assert.ok(projectFolder, "ProjectFolder Not Found");

        // let cluster = await okeUtils.selectOkeCluster(provider, COMPARTMENT_OCID, REGION_ID );
        // assert.ok(cluster && cluster !== null, "Default Cluster Not Selected");

        let clusters = await ociUtils.listClusters(provider, COMPARTMENT_OCID);
        assert.ok(clusters.length > 0, "No Cluster found in your Compartment");

        let cluster: containerengine.models.Cluster  = clusters[0] as containerengine.models.Cluster;

        let buildPipelines = await ociUtils.listBuildPipelinesByCodeRepository(provider, projectId, codeRepositoryId);
        assert.ok(buildPipelines.length > 0, "Build Pipelines Not Created");

        const existingBuildPipelines = buildPipelines?.filter(item => 'oci' === item.freeformTags?.devops_tooling_docker_image);
        assert.ok(existingBuildPipelines.length > 0, "Build Pipelines Not Created");

        let pipeline = existingBuildPipelines.filter(pipe => pipe.displayName?.includes("JVM Container"))[0];
        assert.ok(pipeline, "Build Pipeline JVM Not Created");

        let pipelineStages = await ociUtils.listBuildPipelineStages(provider, pipeline.id);
        assert.ok(pipelineStages, "Build Stages Not Created");

        const item = pipelineStages.find(item => item.buildPipelineStageType === devops.models.DeliverArtifactStageSummary.buildPipelineStageType) as devops.models.DeliverArtifactStageSummary;
        assert.ok(item?.deliverArtifactCollection.items.length, "Item Not Found");

        const artifact = await ociUtils.getDeployArtifact(provider, item.deliverArtifactCollection.items[0].artifactId);
        assert.ok(artifact.deployArtifactSource.deployArtifactSourceType === devops.models.OcirDeployArtifactSource.deployArtifactSourceType, "Artifact Not Found");

        let image = (artifact.deployArtifactSource as devops.models.OcirDeployArtifactSource).imageUri;

        assert.ok(image, "No Image Found");

        assert.ok(cluster.vcnId, " vcnID is Undefined");
        const subnet = await vcnUtils.selectNetwork(provider, cluster.vcnId);
        assert.ok(subnet, " subnet is Undefined");

        let deployEnvironments = await ociUtils.listDeployEnvironments(provider, projectId);
        // assert.ok(deployEnvironments.length>0, " deployEnvironments  Undefined");

        let existingDeployEnvironments = deployEnvironments.filter(env => {
            if (env.deployEnvironmentType === devops.models.OkeClusterDeployEnvironmentSummary.deployEnvironmentType) {
                assert(cluster);
                return (env as devops.models.OkeClusterDeployEnvironmentSummary).clusterId === cluster.id;
            }
            return;
        });
        // assert.ok(existingDeployEnvironments.length>0, " existingDeployEnvironments  Undefined");


        assert.ok(cluster.id, "Cluster Id is undefined");
        const okeClusterEnvironment = existingDeployEnvironments?.length ? existingDeployEnvironments[0] 
            : await ociUtils.createOkeDeployEnvironment(provider, projectId, project.name, cluster.id);
        assert.ok(okeClusterEnvironment, " okeClusterEnvironment  Undefined");
        
        const secretName = `${repositoryName.toLowerCase().replace(/[^0-9a-z]+/g, '-')}-vscode-generated-ocirsecret`;
        
        const deployArtifacts = await ociUtils.listDeployArtifacts(provider, projectId);
        assert.ok(deployArtifacts.length>0, " deployArtifacts  Undefined");

        let setupCommandSpecArtifact = deployArtifacts?.find(env => {
            assert(cluster, "setupCommandSpecArtifact: Cluster is undefined");
            return env.deployArtifactType === devops.models.DeployArtifact.DeployArtifactType.CommandSpec && env.freeformTags?.devops_tooling_oke_cluster === cluster.id;
        })?.id;

        if (!setupCommandSpecArtifact) {
            let extPath = vscode.extensions.getExtension("oracle-labs-graalvm.oci-devops")?.extensionPath;
            assert.ok(extPath, "setupCommandSpecArtifact: Path Not Found");
            let RESOURCES_FOLDER = path.join(extPath, 'resources', 'oci');
            let repoEndpoint = `${provider.getRegion().regionCode}.ocir.io`;
    
            const inlineContent = deployUtils.expandTemplate(RESOURCES_FOLDER, 'oke_docker_secret_setup.yaml', {
                repo_endpoint: repoEndpoint,
                region: provider.getRegion().regionId,
                cluster_id: cluster.id,
                secret_name: secretName
            });
            assert(inlineContent, "setupCommandSpecArtifact: inlineContent Error");
            const artifactName = `${repositoryName}_oke_deploy_docker_secret_setup_command`;
            const artifactDescription = `OKE deployment docker secret setup command specification artifact for devops project ${project} & repository ${repositoryName}`;
            const okeDeploySetupCommandArtifact = (await ociUtils.createOkeDeploySetupCommandArtifact(provider, projectId, inlineContent, artifactName, artifactDescription, {
                'devops_tooling_oke_cluster': cluster.id
            })).id;
            assert(okeDeploySetupCommandArtifact!=="", "setupCommandSpecArtifact: okeDeploySetupCommandArtifact Error");

            
            setupCommandSpecArtifact = okeDeploySetupCommandArtifact;
        }       

        let deployConfigArtifact = deployArtifacts?.find(env => {
            return env.deployArtifactType === devops.models.DeployArtifact.DeployArtifactType.KubernetesManifest && env.freeformTags?.devops_tooling_image_name === image;
        })?.id;

        if (!deployConfigArtifact) {
            let extPath = vscode.extensions.getExtension("oracle-labs-graalvm.oci-devops")?.extensionPath;
            assert.ok(extPath, "deployConfigArtifact: Path Not Found");
            let RESOURCES_FOLDER = path.join(extPath, 'resources', 'oci');
            let inlineContent = deployUtils.expandTemplate(RESOURCES_FOLDER, 'oke_deploy_config.yaml', {
                image_name: image,
                app_name: repositoryName.toLowerCase().replace(/[^0-9a-z]+/g, '-'),
                secret_name: secretName
            });

            assert(inlineContent, "deployConfigArtifact: inlineContent Error");
            const jvm = image.endsWith('-jvm:${DOCKER_TAG}');
            const artifactName = `${repositoryName}_oke_deploy_${jvm ? 'jvm' : 'ni'}_configuration`;
            const artifactDescription = `OKE ${jvm ? 'jvm' : 'native'} deployment configuration artifact for devops project ${project.name} & repository ${repositoryName}`;
            const artifact = (await ociUtils.createOkeDeployConfigurationArtifact(provider, projectId, inlineContent, artifactName, artifactDescription, {
                'devops_tooling_codeRepoID':codeRepositoryId,
                'devops_tooling_image_name': image
            })).id;
            assert(artifact!=="", "deployConfigArtifact: okeDeploySetupCommandArtifact Error");

            deployConfigArtifact = artifact;
        }


        const codeRepoPrefix = (pipeline.freeformTags?.devops_tooling_codeRepoPrefix || '');
        const displayNamePrefix = codeRepoPrefix + 'Build ';
        const displayName = pipeline.displayName?.startsWith(displayNamePrefix) ? pipeline.displayName.slice(displayNamePrefix.length) : `${projectFolder.projectType === 'GCN' ? ' OCI ' : ' '}Container`;
        const deployPipelineName = `Deploy ${displayName} to OKE`;
        const descriptionPrefix = 'Build pipeline to build ';
        const descriptionPart = pipeline.description?.startsWith(descriptionPrefix) ? pipeline.description.slice(descriptionPrefix.length) : `container for ${projectFolder.projectType === 'GCN' ? 'OCI & ' : ''}devops project ${project.name} & repository ${repositoryName}`;
        const deployPipelineDescription = `Deployment pipeline to deploy ${descriptionPart} to OKE`;
        const tags: { [key:string]: string } = {
            'devops_tooling_codeRepoID': codeRepositoryId,
            'devops_tooling_buildPipelineOCID': pipeline.id,
            'devops_tooling_okeDeploymentName': repositoryName.toLowerCase().replace(/[^0-9a-z]+/g, '-')
        };
        if (codeRepoPrefix.length) {
            tags.devops_tooling_codeRepoPrefix = codeRepoPrefix;
        }
    
        assert.ok(subnet, "Subnet Not Exist at all");
        try {
            await ociUtils.updateCompartmentAccessPolicies(provider, COMPARTMENT_OCID, COMPARTMENT_OCID, subnet.compartmentID);
        } catch (error) {
            console.warn("Policies: ", error);
            
        }
        
        let deployPipeline;
        try {
            deployPipeline = (await ociUtils.createDeployPipeline(provider, projectId, `${codeRepoPrefix}${deployPipelineName}`, deployPipelineDescription, [{
                name: 'DOCKER_TAG',
                defaultValue: 'latest'
            }], tags));
        } catch (error) {
            console.warn("deployPipeline: ", error);
            
        }
        
        assert.ok(deployPipeline, "deployPipeline Not Exist at all");

        let setupSecretStage;
        try {
            setupSecretStage = await ociUtils.createSetupKubernetesDockerSecretStage(provider, deployPipeline.id, setupCommandSpecArtifact, subnet.id);
        } catch (error) {
            console.warn("setupSecretStage: ", error);
            
        }
        assert.ok(setupSecretStage, "setupSecretStage Not Exist at all");

        let deployStage = await ociUtils.createDeployToOkeStage(provider, deployPipeline.id, setupSecretStage.id, okeClusterEnvironment.id, deployConfigArtifact);
        assert.ok(deployStage, "deployStage Not Exist at all");

        let deployPipelines = await  ociUtils.listDeployPipelines(provider, projectId);
        assert.ok(deployPipelines.length > 0, "Deployment pipelines not created");

        deployPipelineId = deployPipelines[0].id;

    });


    test("Delete Deploy Pipeline Stages",async () => {
       
        assert.ok(deployPipelineId!=="", "Deploy pipeline not found");
        assert.ok(provider, "Provider is undefined");

        let deployPipelineStages = await ociUtils.listDeployStages(provider, deployPipelineId);
        assert.ok(deployPipelineStages.length > 0, "deploy Pipeline Stages Not Found");

        for (const stage of deployPipelineStages) {
            await ociUtils.deleteDeployStage(provider, stage.id, true);
        }

        deployPipelineStages = await ociUtils.listDeployStages(provider, deployPipelineId);
        assert.ok(deployPipelineStages.length === 0, "deploy Environments Not Deleted");
    });


    test("Delete Deploy Environment",async () => {
       
        assert.ok(provider, "Provider is undefined");;
        let deployEnvironments = await ociUtils.listDeployEnvironments(provider, projectId);
        assert.ok(deployEnvironments.length > 0, "deploy Environments Not found");

        let deployEnvironmentId = deployEnvironments[0].id;
        await ociUtils.deleteDeployEnvironment(provider, deployEnvironmentId, true);

        deployEnvironments = await ociUtils.listDeployEnvironments(provider, projectId);
        assert.ok(deployEnvironments.length === 0, "deploy Environments Not Deleted");
    });

    
    test("Delete Deploy Pipeline",async () => {
       
        assert.ok(deployPipelineId!=="", "Deploy pipeline not found");
        assert.ok(provider, "Provider is undefined");

        await ociUtils.deleteDeployPipeline(provider, deployPipelineId, true);

        let deployPipelines = await ociUtils.listDeployEnvironments(provider, projectId);
        assert.ok(deployPipelines.length === 0, "deploy Environments Not Deleted");
    });


    test("Test cleanup", async () => {
        await vscode.commands.executeCommand("oci.devops.undeployFromCloudSync");
    });

});