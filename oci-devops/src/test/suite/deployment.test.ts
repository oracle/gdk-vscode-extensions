import * as assert from 'assert';
import * as vscode from 'vscode';
import * as ociUtils from '../../oci/ociUtils';
import * as ociAuthentication from '../../oci/ociAuthentication';
import { ConfigFileAuthenticationDetailsProvider, devops, identity } from 'oci-sdk';
import { DeployOptions } from '../../oci/deployUtils';
import { waitForStatup } from './extension.test';

let wf = vscode.workspace.workspaceFolders;

suite('Deployment Test Suite', function() {
	vscode.window.showInformationMessage('Start all tests.');

    /* Wait for the NBLS to start */
	// the timeout will propagate to beforeAll hook
	this.timeout(30000);
	this.beforeAll(async () => {
	    await waitForStatup(wf![0]);
	});
    
	// revert for tests (deployment/undeployment might take some time)
	this.timeout(5*60*1000);
    
    let provider : ConfigFileAuthenticationDetailsProvider | undefined;
    let context : vscode.ExtensionContext;

    const DEPLOY_COMPARTMENT_NAME : string = "tests";
    const DEPLOY_PROJECT_NAME : string = "base-oci-template-test";

    test("Activate extension", async () => {
        const ext = vscode.extensions.getExtension("oracle-labs-graalvm.oci-devops");
        assert.ok(ext, "OCI DevOps Extension not found!");

        context = await ext.activate();
        assert.ok(context, "Context is undefined");
    });

    // get provider data
    test("Authenticate to oci", async () => {
        const ACTION_NAME = 'Deploy to OCI';

        const auth = await ociAuthentication.resolve(ACTION_NAME, undefined);
        assert.ok(auth, "Authentication failed! Check your oci config.");

        const configurationProblem = auth.getConfigurationProblem();
        assert.ok(!configurationProblem, configurationProblem);

        provider = auth.getProvider();
    });

    
    let comaprtmentOCID = "";
    // Find OCID of target compartment
    test("List compartments", async() => {
        if (provider) {
            const compartments : identity.models.Compartment[] = await ociUtils.listCompartments(provider);
            
            assert.ok(compartments.length>0, "No compartments listed");

            for (let compartment of compartments) {
                if (compartment.name === DEPLOY_COMPARTMENT_NAME)
                    comaprtmentOCID = compartment.id;
            }
            assert.ok(comaprtmentOCID!=="", "No comaprtment " + DEPLOY_COMPARTMENT_NAME + " found!");

        } else assert.ok(false, "Authentication failed");
    });

    // list devops projects inside a compartment
    test("List devops projects", async () => {
        if (provider) {
            const DevOpsProjects : devops.models.ProjectSummary[] = await ociUtils.listDevOpsProjects(provider, comaprtmentOCID);

            // left from previos unsuccessfull runs
            for (let project of DevOpsProjects) {
                if (project.name === DEPLOY_PROJECT_NAME) {
                    await vscode.commands.executeCommand("oci.devops.undeployFromCloudSync");
                }
            }

        } else assert.ok(false, "Authentication failed");
    });

    // deploy project
    let projectId : string = "";
    test("Deploy project", async() => {
        if (provider) {
            const deployOptions : DeployOptions = {
                compartment: {
                    ocid: comaprtmentOCID,
                    name: "gcn-dev/"+DEPLOY_COMPARTMENT_NAME,
                },
                skipOKESupport: true,
                projectName: DEPLOY_PROJECT_NAME
            };

            await vscode.commands.executeCommand("oci.devops.deployToCloud_GlobalSync", deployOptions);

            const DevOpsProjects : devops.models.ProjectSummary[] = await ociUtils.listDevOpsProjects(provider, comaprtmentOCID);

            for (let project of DevOpsProjects) {
                if (project.name === DEPLOY_PROJECT_NAME) {
                    projectId = project.id;
                }
            }
            assert.ok(projectId!=="", "Project not successfully deployed");

        } else assert.ok(false, "Authentication failed");
    });

    test("Undeploy project", async() => {
        if (provider) {
            const DevOpsProjects : devops.models.ProjectSummary[] = await ociUtils.listDevOpsProjects(provider, comaprtmentOCID);
            let projectFound = false;

            for (let project of DevOpsProjects) {
                if (project.name === DEPLOY_PROJECT_NAME) {
                    projectFound = true;
                }
            }
            assert(projectFound, "Project not found for undeployment");

            await vscode.commands.executeCommand("oci.devops.undeployFromCloudSync");

        } else assert.ok(false, "Authentication failed");
    });


});
