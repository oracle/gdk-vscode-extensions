import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
// import * as myExtension from '../../extension';

import * as ociUtils from '../../oci/ociUtils';
import * as ociAuthentication from '../../oci/ociAuthentication';
import { ConfigFileAuthenticationDetailsProvider, identity } from 'oci-sdk';
import * as devopsServices from '../../devopsServices';
import { CLOUD_SUPPORTS } from '../../extension';

//let wf = vscode.workspace.workspaceFolders;

suite('Deployment Test Suite', function() {
	vscode.window.showInformationMessage('Start all tests.');

        /* Wait for the NBLS to start */
	// the timeout will propagate to beforeAll hook
	this.timeout(30000);
	this.beforeAll(async () => {
	        //await waitForStatup(wf![0]);
	});
	// revert for tests
	this.timeout(10000000);
    
    // configuration for creating a project
    /*let options = {
            micronautVersion: {
                label: "3.7.4",
                serviceUrl: "",
            },
            applicationType: "APPLICATION",
            buildTool: "GRADLE",
            language: "JAVA",
            testFramework: "JUNIT",
            basePackage: "com.example",
            projectName: "demo",
            javaVersion: "JDK_17",
            clouds: [
                "OCI",
            ],
            services: undefined,
            features: undefined,
    };*/
    
    let provider : ConfigFileAuthenticationDetailsProvider | undefined;
    //let compartment_name = "stevo";

    let context : vscode.ExtensionContext;

    test("Activate extension", async () => {
        const ext = vscode.extensions.getExtension("oracle-labs-graalvm.oci-devops");
        assert.ok(ext, "OCI DevOps Extension not found!");

        context = await ext.activate();
    });

    // list all compartments and get the 'gcn-dev/tests' if none are provided
    test("Authenticate to oci", async () => {
        const ACTION_NAME = 'Deploy to OCI';

        const auth = await ociAuthentication.resolve(ACTION_NAME, undefined);
        assert.ok(auth, "Authentication failed! Check your oci config.");

        const configurationProblem = auth.getConfigurationProblem();
        assert.ok(!configurationProblem, configurationProblem);

        provider = auth.getProvider();
    });

    test("List compartments", async() => {
        if (provider) {
            const compartments : identity.models.Compartment[] = await ociUtils.listCompartments(provider);
            
            assert.ok(compartments.length>0, "No compartments listed");

        } else assert.ok(false, "Authentication failed");
    });

    // list devops projects inside a compartment
    test("List devops projects", async () => {
        
    });

    // deploy project
    test("Deploy project", async() => {
        let workspaceState : vscode.Memento = context.workspaceState;

        assert.ok(workspaceState, "Workspace state is not defined");

        const folders = vscode.workspace.workspaceFolders;
        assert.ok(folders, "No folder data to deploy");
        assert.ok(folders.length===1, "There should be exactly one workspace folder");
        const folderData: devopsServices.FolderData[ ] = [{
            folder: folders[0],
            configurations: [],
            services: []
        }];
        

        const workspaceFolders = devopsServices.folderDataToWorkspaceFolders(folderData) as vscode.WorkspaceFolder[];
        const dump = devopsServices.dumpDeployData(workspaceState, workspaceFolders.map(f => f.name));

        const cloudSupport = CLOUD_SUPPORTS[0];

        assert.ok(cloudSupport, "No cloud support found!");

        try {
            const deployed = await cloudSupport.deployFolders(workspaceFolders, false, dump);
            if (deployed) {
                await devopsServices.build(workspaceState);
            }
        } finally {
            if (dump(null)) {
                await vscode.commands.executeCommand('setContext', 'oci.devops.deployFailed', true);
                await devopsServices.build(workspaceState);
            } else {
                await vscode.commands.executeCommand('setContext', 'oci.devops.deployFailed', false);
            }
        }

        //deployFolders()
    }).timeout(1000000);

    // cleanup project deployment
    test("Cleanup deploy project", async () => {
        
    });

});
