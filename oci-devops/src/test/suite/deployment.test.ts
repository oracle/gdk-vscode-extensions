/*
 * Copyright (c) 2023, 2024, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import * as ociUtils from '../../oci/ociUtils';
import * as fs from 'fs';
import * as ociAuthentication from '../../oci/ociAuthentication';
import { ConfigFileAuthenticationDetailsProvider, devops, identity } from 'oci-sdk';
import { DeployOptions } from '../../oci/deployUtils';
import { waitForStatup, getProfile } from './common';
import { getDefaultConfigFile, listProfiles } from '../../oci/ociAuthentication';

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

    const DEPLOY_COMPARTMENT_NAME : string = "tests";
    const DEPLOY_PROJECT_NAME : string = process.env['TEST_DEPLOY_PROJECT_NAME'] || "base-oci-template-testdeploy";

    test("Initial test setup", async () => {
        const ext = vscode.extensions.getExtension("oracle-labs-graalvm.oci-devops");
        assert.ok(ext, "OCI DevOps extension not found!");

        await ext.activate();
        assert.ok(ext.isActive, "OCI DevOps extension failed to activate!");

        await vscode.commands.executeCommand("git.close");
    });

    // list and get the default profile
    let selectProfile : string = "";
    test("List OCI Profiles", async () => {
        const defaultConfig = getDefaultConfigFile();
        assert.ok(fs.existsSync(defaultConfig), "Default configuration file not found");

        const profiles = listProfiles(defaultConfig);
        assert.ok(profiles.length>0, "No configuration profiles");

        selectProfile = getProfile(profiles);
        assert.ok(selectProfile!=="", "Default profile cannot be determined. Make sure to have [DEFAULT] or [TESTS] profile in oci config.");
    });

    // get provider data
    test("Authenticate to oci", async () => {
        const ACTION_NAME = 'Deploy to OCI';

        const auth = await ociAuthentication.resolve(ACTION_NAME, selectProfile);
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

            if (process.env['TEST_DEPLOY_COMPARTMENT_OCID']) {
                comaprtmentOCID = process.env['TEST_DEPLOY_COMPARTMENT_OCID'];
            } else {
                for (let compartment of compartments) {
                    if (compartment.name === DEPLOY_COMPARTMENT_NAME)
                        comaprtmentOCID = compartment.id;
                }
                assert.ok(comaprtmentOCID!=="", "No comaprtment " + DEPLOY_COMPARTMENT_NAME + " found!");
            }

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
                    await ociUtils.deleteDevOpsProject(provider, project.id, true);
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
                },
                skipOKESupport: true,
                projectName: DEPLOY_PROJECT_NAME,
                selectProfile: selectProfile,
                autoConfirmDeploy: true,
                includeTests: false,
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
