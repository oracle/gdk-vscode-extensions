import * as assert from 'assert';
import * as vscode from 'vscode';
import { waitForStatup } from './extension.test';
import * as ociAuthentication from '../../oci/ociAuthentication';
import * as ociUtils from '../../oci/ociUtils';
import { ConfigFileAuthenticationDetailsProvider, devops} from 'oci-sdk';
import { DeployOptions } from '../../oci/deployUtils';
import { getDefaultConfigFile, listProfiles } from '../../oci/ociAuthentication';

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
    const DEPLOY_PROJECT_NAME : string = (process.env["TEST_DEPLOY_PROJECT_NAME"] ? process.env["TEST_DEPLOY_PROJECT_NAME"] : "base-oci-template-testpipeline");
    const COMPARTMENT_OCID : string =  (process.env["TEST_DEPLOY_COMPARTMENT_OCID"] ? process.env["TEST_DEPLOY_COMPARTMENT_OCID"] : "ocid1.compartment.oc1..aaaaaaaa7thgaondgokuwyujlq4tosnpfaohdivlbbr64izsx5jxfxrezxca" );
    const ACTION_NAME = 'Deploy to OCI';

    let provider : ConfigFileAuthenticationDetailsProvider | undefined;

    let selectProfile : string = "";
    let projectId : string = "";

    
    
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
        let auth = await ociAuthentication.resolve(ACTION_NAME, selectProfile);
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

        DevOpsProjects = await ociUtils.listDevOpsProjects(provider, COMPARTMENT_OCID);
        for (let project of DevOpsProjects) {
            if (project.name === DEPLOY_PROJECT_NAME) {
                projectId = project.id;
            }
        }
        
    });

   

    test("Check build pipelines",  async function() {
        assert.ok(provider, "Provider not authenticated");
        assert.ok(projectId, "Project Id Not Found");
        
        let buildPipelines = await ociUtils.listBuildPipelines(provider, projectId);
        assert.ok(buildPipelines.length > 0, "No Build Pipelines is created");
                
    });

    let codeRepositoryId : string | undefined;
    test("Check Code Repository", async function() {
        assert.ok(provider, "Provider not authenticated");
        assert.ok(projectId, "Project Id Not Found");

        let codeRepositories = await ociUtils.listCodeRepositories(provider, projectId);
        codeRepositoryId = codeRepositories[0].id;
        assert.ok(codeRepositories.length > 0, "Code Repository Not Found");
    });

    test("Create Deployment pipeline", async function() {
        assert.ok(provider, "Provider not authenticated");
        assert.ok(projectId, "Project Id Not Found");
        assert.ok(codeRepositoryId, "Code Repository Id Not Found");

        // create deployment pipeline
        await ociUtils.createDeployPipeline(provider, projectId, "Native Executable Deployment Pipeline", undefined, undefined, undefined);
        
        // check creation of deployment pipeline
        let deploymentPipelines = await ociUtils.listDeployPipelines(provider, projectId);
        assert.ok(deploymentPipelines.length > 0, "No Deployment Pipelines is created");

        // delete deployments Pipelines
        for(let deployPipeline of deploymentPipelines ) {
            await ociUtils.deleteDeployPipeline(provider, deployPipeline.id, true);
        }
        deploymentPipelines = await ociUtils.listDeployPipelines(provider, projectId);
        assert.ok(deploymentPipelines.length ===  0, " Deployment Pipelines not deleted");


    });


    test("Test cleanup", async () => {
        await vscode.commands.executeCommand("oci.devops.undeployFromCloudSync");
    });

});