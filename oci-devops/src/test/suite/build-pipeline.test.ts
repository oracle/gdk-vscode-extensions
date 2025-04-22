/*
 * Copyright (c) 2023, 2024, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import { waitForStatup, getProfile } from './common';
import * as ociAuthentication from '../../oci/ociAuthentication';
import * as ociUtils from '../../oci/ociUtils';
import { ConfigFileAuthenticationDetailsProvider, devops} from 'oci-sdk';
import { DeployOptions } from '../../oci/deployUtils';
import { getDefaultConfigFile, listProfiles } from '../../oci/ociAuthentication';
import { NodeProvider } from '../../servicesView';
import { BuildPipelineNode } from '../../oci/buildServices';

let wf = vscode.workspace.workspaceFolders;

/**
 * Waits for the pipeline context to swtich from an old state
 * @param oldValue 
 * @param buildPipeline 
 * @param timeout 
 * @returns 
 */
async function waitForContextChange(oldValue :string |undefined, buildPipeline : BuildPipelineNode, timeout : number) : Promise<string | undefined> {
    while (--timeout) {
        if (buildPipeline.contextValue !== oldValue) {
            return buildPipeline.contextValue;
        } else {
            await new Promise(f => setTimeout(f, 1000));
        }
    }
    return undefined;
}

suite('Build pipeline Test Suite', function() {
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
    test("Environment setup", async () => {
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
        const auth = await ociAuthentication.resolve(ACTION_NAME, selectProfile);
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
            autoConfirmDeploy: true,
            enableTests: false,
        };

        await vscode.commands.executeCommand("oci.devops.deployToCloud_GlobalSync", deployOptions);

        DevOpsProjects = await ociUtils.listDevOpsProjects(provider, COMPARTMENT_OCID);
        for (let project of DevOpsProjects) {
            if (project.name === DEPLOY_PROJECT_NAME) {
                projectId = project.id;
            }
        }
    });

    // List all build pipelines
    let JVMContainerPipelineId : string = "";
    test("List build pipelines", async () => {
        assert.ok(provider!==undefined, "Authentication failed");

        const buildPipelinesList : devops.models.BuildPipelineSummary[] = await ociUtils.listBuildPipelines(provider, projectId);
        assert.ok(buildPipelinesList.length>0, "No build pipelines found!");

        let foundJVMContainer : boolean = false;
        let foundNativeExecutableContainer : boolean = false;
        for (let buildPipeline of buildPipelinesList) {
            if (buildPipeline.displayName?.indexOf("Build OCI JVM Container") !== -1) {
                foundJVMContainer = true;
                JVMContainerPipelineId = buildPipeline.id;
            }
            else if (buildPipeline.displayName?.indexOf("Build OCI Native Executable Container") !== -1)
                foundNativeExecutableContainer = true;
        }
        assert.ok(foundJVMContainer, "Build pipeline `Build OCI JVM Container` not found");
        assert.ok(foundNativeExecutableContainer, "Build pipeline `Build OCI Native Executable Container` not found");

    });

    // List build stages
    test("List build stages", async () => {
        assert.ok(provider!==undefined, "Authentication failed");
        
        const stages : devops.models.BuildPipelineStageSummary[] =  await ociUtils.listBuildPipelineStages(provider, JVMContainerPipelineId);
        assert.ok(stages.length > 0, "No build pipeline stages found!");
    });

    // Start the build pipeline: Build OCI JVM Container
    let buildState : string | undefined;
    test("Start build pipeline", async () => {
        const nodeProvider : NodeProvider = await vscode.commands.executeCommand("oci.devops.nodeProvider");
        assert.ok(nodeProvider!==undefined, "Node provider is not initialized!");

        const buildPipelines : BuildPipelineNode[] = nodeProvider.getChildren() as BuildPipelineNode[];
        assert.ok(buildPipelines.length > 0, "No build pipelines found!");

        let buildPipelineIndex = -1;
        for (let i = 0; i < buildPipelines.length; ++i) {
            if (buildPipelines[i].label === "Build OCI JVM Container")
                buildPipelineIndex = i;
        }
        assert.ok(buildPipelineIndex !== -1, "Pipeline `Build OCI JVM Container` not found");

        const buildPipeline : BuildPipelineNode = buildPipelines[buildPipelineIndex];
        buildState = buildPipeline.contextValue;

        await vscode.commands.executeCommand("oci.devops.runBuildPipeline", buildPipeline);

        // wait for build pipeline to change states
        buildState = await waitForContextChange(buildState, buildPipeline, 10);
        
        assert.ok(buildState!==undefined, "Build timeout in switching to running state");
        assert.strictEqual(buildState, "oci.devops.buildPipelineNode-in-progress", "Build switched to unexpected state");
    
        // wait for build to finish
        buildState = await waitForContextChange(buildState, buildPipeline, 60*30);
        assert.ok(buildState!==undefined, "Build timeout in switching to finishing state");
        assert.strictEqual(buildState, "oci.devops.buildPipelineNode-single-image-available", "Build switched to unexpected state");
    
    }).timeout(1000*60*30);


    // List build runs (previous build should be present)
    test("List build runs", async () => {
        assert.ok(provider!==undefined, "Authentication failed");

        const runs : devops.models.BuildRunSummary[] = await ociUtils.listBuildRuns(provider, JVMContainerPipelineId);
        assert.ok(runs.length > 0, "No build runs");

        // Check latest run if succeeded
        assert.ok(runs[0].lifecycleState === "SUCCEEDED");
    });

    // Run un-deploy
    test("Test cleanup", async () => {
        await vscode.commands.executeCommand("oci.devops.undeployFromCloudSync");
    });

});