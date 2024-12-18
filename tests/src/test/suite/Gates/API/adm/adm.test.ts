/*
 * Copyright (c) 2023, 2024, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import * as ociUtils from '../../../../../../../oci-devops/out/oci/ociUtils';
import * as fs from 'fs';
import * as path from 'path';
import * as ociAuthentication from '../../../../../../../oci-devops/out/oci/ociAuthentication';
import { /* ConfigFileAuthenticationDetailsProvider, */ devops } from 'oci-sdk';
import { DeployOptions } from '../../../../../../../oci-devops/out/oci/deployUtils';

import * as adm from 'oci-adm';
import { waitForStatup } from '../helpers';

let wf = vscode.workspace.workspaceFolders;

/**
 * Local run of the tests can be controlled by environment variables:
 * - TEST_DEPLOY_COMPARTMENT_OCID - OCID of the compartment where the project will be deployed. Should be developer's own compartment, so it does not interfere with CI
 * - TEST_ADM_REUSE_PROJECTS - if set, the test will not undeploy an already project. Undeploy takes very long and reusing projects speeds the test cycle
 *
 * This test *requires* ADM_SUPPRESS_AUTO_DISPLAY=true to be set; the extension should not automatically run audit on startup.
 */

const COMPARTMENT_OCID: string = process.env['TEST_DEPLOY_COMPARTMENT_OCID']
  ? process.env['TEST_DEPLOY_COMPARTMENT_OCID']
  : 'ocid1.compartment.oc1..aaaaaaaa7thgaondgokuwyujlq4tosnpfaohdivlbbr64izsx5jxfxrezxca';
const DEPLOY_ACTION_NAME = 'Deploy to OCI';

/**
 * Name of the deployed project.
 */
let deployProjectName: string;

/**
 * Authentication provider. Initialized from `Project setup'
 */
let provider: any; // should be ConfigFileAuthenticationDetailsProvider; TS issue - imports from different sources although same library is not compatible

/**
 * OCI profil used by tests. Initialized from `Project setup'
 */
let selectProfile: string = '';

/**
 * The deployed project's OCID. Initialized from `Project setup'
 */
let projectId: string = '';

/**
 * The compartment of the deployed project. Initialized from `Project setup'.
 */
let projectCompartment: string = '';

/**
 * OCI authentication. Initialized from `Project setup'
 */
let auth: ociAuthentication.Authentication;

/**
 * NBLS local cache directory. Initialized from `Project setup'
 */
let admCacheDir: string;

let projectType: 'gradle' | 'maven';

/**
 * OCID of the project's knowledge base
 */
let knowledgeBaseOcid: string;

/**
 * Project subfolder whose audit will be inspected.
 */
let auditedSubprojectUri: vscode.Uri;

/**
 * Location of the gradle / maven buildscript that will be manipulated
 */
let buildscript: vscode.Uri;

/**
 * If true, then simple project is used, not GDK-like structure. Like normal Micronaut
 * or Springboot project.
 */
// let simpleProject : boolean;

/**
 * Deletes all vulnerabilities in the knowledge base
 */
async function deleteVulnerabilityAudits() {
  // clear all vulnerability reports from the previous run:
  let audits = await ociUtils.listVulnerabilityAudits(auth.getProvider(), projectCompartment, knowledgeBaseOcid);
  for (let a of audits) {
    await ociUtils.deleteVulnerabilityAudit(auth.getProvider(), a.id, true);
  }
}

/**
 * Deletes the local audit cache of the NBLS
 */
async function deleteNblsAuditCache() {
  if (fs.existsSync(admCacheDir)) {
    fs.rmSync(admCacheDir, { force: true, recursive: true });
  }
}

/**
 * Finds date/time stamp of a local ADM cache file.
 */
function findCacheTime() {
  let kbSegment;

  fs.readFileSync(path.join(admCacheDir, 'segments'))
    .toString()
    .split('\n')
    .map((s) => {
      let re = new RegExp(`knowledge.segment.${knowledgeBaseOcid}=(.*)$`).exec(s);
      if (re) {
        kbSegment = re[1];
      }
    });
  if (!kbSegment) {
    return -1;
  }

  let p = path.join(admCacheDir, kbSegment);
  let files = fs.readdirSync(p);
  assert.strictEqual(2, files.length, 'Single report in the cache');
  return fs.statSync(path.resolve(p, 'audit-report.json')).ctimeMs;
}

suite('ADM Test Suite: ' + wf![0].name, function () {
  vscode.window.showInformationMessage('Start ADM tests.');

  /* Wait for the NBLS to start */
  this.timeout(5 * 60 * 1000);
  this.beforeAll(async () => {
    await waitForStatup(wf![0]);
  });

  /**
   * Mainly sets up the environment for the rest of tests.
   */

  this.timeout(10 * 60 * 1000);
  test('Project setup', async () => {
    this.timeout('10m');
    const folderUri = vscode.workspace.workspaceFolders?.[0].uri;

    assert.ok(folderUri, 'Workspace must contain a project');
    let projectRoot = folderUri?.fsPath;

    if (projectRoot.includes('-simple')) {
      auditedSubprojectUri = folderUri;
      // simpleProject = true;
    } else {
      auditedSubprojectUri = vscode.Uri.joinPath(folderUri, 'lib');
      // simpleProject = false;
    }

    if (fs.existsSync(path.resolve(auditedSubprojectUri.fsPath, 'build.gradle'))) {
      projectType = 'gradle';
    }
    if (fs.existsSync(path.resolve(auditedSubprojectUri.fsPath, 'pom.xml'))) {
      projectType = 'maven';
    }

    console.log(`Audited subproject URI: ${auditedSubprojectUri}`);

    buildscript =
      projectType === 'gradle'
        ? vscode.Uri.joinPath(auditedSubprojectUri, 'build.gradle')
        : vscode.Uri.joinPath(auditedSubprojectUri, 'pom.xml');

    switch (projectType) {
      case 'maven':
        fs.copyFileSync(path.resolve(auditedSubprojectUri.fsPath, 'pom.xml.first'), buildscript.fsPath);
        break;
      case 'gradle':
        fs.copyFileSync(path.resolve(auditedSubprojectUri.fsPath, 'build.gradle.first'), buildscript.fsPath);
        break;
      default:
        assert.fail('Unknown project type');
    }
    const ext = vscode.extensions.getExtension('oracle-labs-graalvm.oci-devops');
    assert.ok(ext, 'OCI DevOps extension not found!');

    await ext.activate();
    assert.ok(ext.isActive, 'OCI DevOps extension failed to activate!');

    // authenticate
    let a = await ociAuthentication.resolve(DEPLOY_ACTION_NAME, selectProfile);
    assert.ok(a, 'Authentication failed! Check your oci config.');
    if (a) {
      auth = a;
    }

    const configurationProblem = auth.getConfigurationProblem();
    assert.ok(!configurationProblem, configurationProblem);

    deployProjectName = process.env['TEST_DEPLOY_PROJECT_NAME']
      ? process.env['TEST_DEPLOY_PROJECT_NAME']
      : path.basename(projectRoot);
    if (deployProjectName === '__RANDOM') {
      deployProjectName = 'gcn-adm-test-project' + (Math.random() + 1).toString(36).substring(7);
    }

    const p = auth.getProvider();
    assert.ok(p);
    provider = p;

    // left from previos unsuccessfull runs
    let DevOpsProjects: devops.models.ProjectSummary[] = await ociUtils.listDevOpsProjects(provider, COMPARTMENT_OCID);

    for (let project of DevOpsProjects) {
      if (project.name === deployProjectName) {
        const p = path.resolve(folderUri.fsPath, '.vscode/devops.json');
        if (fs.existsSync(p)) {
          const lines = fs.readFileSync(p).toString().split('\n');
          let ocid;

          lines.forEach((l) => {
            const re = /devopsProject.*:.*"([^"]+)"/.exec(l);
            if (re) {
              ocid = re[1];
            }
          });
          if (ocid === project.id && process.env['TEST_ADM_REUSE_PROJECTS']) {
            projectId = project.id;
            projectCompartment = project.compartmentId;
            break;
          }
          await vscode.commands.executeCommand('oci.devops.undeployFromCloudSync');
        } else {
          // this will
          await ociUtils.deleteDevOpsProject(provider, project.id, true);
        }
        // need a wait between delete .git and git init, otherwise git API will fail.
        await new Promise((r) => setTimeout(r, 5000));
      }
    }

    // erase the deployment state
    let extContext : vscode.ExtensionContext = await vscode.commands.executeCommand('_oci.devops.getExtensionContext');
    extContext.workspaceState.update('devops_tooling_deployData', undefined);

    if (!projectId) {
      const compartment = await ociUtils.getCompartment(provider, COMPARTMENT_OCID);

      const deployOptions: DeployOptions = {
        compartment: {
          ocid: COMPARTMENT_OCID,
          name: compartment.name,
        },
        skipOKESupport: true,
        projectName: deployProjectName,
        selectProfile: selectProfile,
        autoConfirmDeploy: true,
      };

      await vscode.commands.executeCommand('oci.devops.deployToCloud_GlobalSync', deployOptions);
    }
    DevOpsProjects = await ociUtils.listDevOpsProjects(provider, COMPARTMENT_OCID);
    for (let project of DevOpsProjects) {
      if (project.name === deployProjectName) {
        projectId = project.id;
        projectCompartment = project.compartmentId;
      }
    }
    assert.ok(projectId, 'Deployed project must be listed');
    assert.ok(projectCompartment, 'Deployed project has no compartment');
    let dirs: any = await vscode.commands.executeCommand('nbls.server.directories');
    assert.ok(dirs, 'Incompatible version of NBLS is present');
    admCacheDir = path.join(dirs['cache'], 'oracle-cloud-adm');
  });

  /**
   * Finds a knowledge base (created by project deploy) and records its OCID
   */
  test('Locate knowledgebase', async () => {
    let auth = await ociAuthentication.resolve('Locate knowledgebase', selectProfile);
    assert.ok(auth, 'Authentication must succeed');
    let kbs: adm.models.KnowledgeBaseSummary[] = (
      await ociUtils.listKnowledgeBases(auth.getProvider(), projectCompartment)
    ).filter((kb) => kb.displayName === deployProjectName + 'Audits');
    assert.strictEqual(1, kbs.length, 'Project must have exactly one knowledgebase');
    knowledgeBaseOcid = kbs[0].id;
  });

  let firstAuditId: string;
  let cacheCreated: number;

  /**
   * Checks that vulnerability audit display will not execute OCI vulnerability audit even though no audit results exist at the moment.
   */
  test('Display while no data exist', async () => {
    assert.ok(auth, 'Authentication must succeed');
    assert.ok(knowledgeBaseOcid, 'Knowledgebase must be present');

    await deleteNblsAuditCache();
    await deleteVulnerabilityAudits();

    // if the audit fails, then the test fails as well, which we want.

    let auditData: any = await vscode.commands.executeCommand(
      'nbls.projectAudit.display',
      auditedSubprojectUri.toString(),
      knowledgeBaseOcid,
      {
        force: false,
        compute: false,
        profile: selectProfile || undefined,
        returnData: true,
        displaySummary: false,
        suppressErrors: true,
      },
    );
    assert.ok(auditData, 'Audit must complete');
    assert.strictEqual(0, auditData.dependencyCount, 'Audit must not be empty');
    assert.strictEqual('', auditData.auditId, 'No audit must be loaded');
  });

  /**
   * Checks that display will compute the vulnerability audit, if one does not exist
   */
  test('Compute audit as part of the display', async () => {
    assert.ok(auth, 'Authentication must succeed');
    assert.ok(knowledgeBaseOcid, 'Knowledgebase must be present');

    await deleteNblsAuditCache();

    let f = vscode.workspace.workspaceFolders?.[0];
    assert.ok(f, 'Project workspace folder exists');
    // if the audit fails, then the test fails as well, which we want.

    let auditData: any = await vscode.commands.executeCommand(
      'nbls.projectAudit.display',
      auditedSubprojectUri.toString(),
      knowledgeBaseOcid,
      {
        force: false,
        disableCache: true,
        // compute : true,  -- should be the default
        profile: selectProfile || undefined,
        returnData: true,
        displaySummary: false,
        suppressErrors: true,
      },
    );
    assert.ok(auditData, 'Audit must complete');
    assert.notStrictEqual(0, auditData.dependencyCount, 'Project has non-empty dependencies');
    assert.notStrictEqual(0, auditData.vulnerabilityCount, 'Project has vulnerabilities');
    assert.notStrictEqual('', auditData.auditId, 'Audit was created');

    let audits = await ociUtils.listVulnerabilityAudits(auth.getProvider(), projectCompartment, knowledgeBaseOcid);
    assert.strictEqual(1, audits.length, 'Single audit was created');

    firstAuditId = auditData.auditId;

    cacheCreated = findCacheTime();
  });

  test('Do not compute audit again if not forced', async () => {
    let f = vscode.workspace.workspaceFolders?.[0];
    assert.ok(f, 'Project workspace folder exists');

    // make some ms, so cache re-fetch time differs
    await new Promise((resolve) => setTimeout(resolve, 50));

    let auditData: any = await vscode.commands.executeCommand(
      'nbls.projectAudit.display',
      auditedSubprojectUri.toString(),
      knowledgeBaseOcid,
      {
        force: false,
        disableCache: true,
        // compute : true,  -- should be the default
        profile: selectProfile || undefined,
        returnData: true,
        displaySummary: false,
        suppressErrors: true,
      },
    );
    let refetched = findCacheTime();
    let c = cacheCreated;
    cacheCreated = refetched;

    assert.ok(auditData, 'Audit must complete');
    assert.notStrictEqual(0, auditData.dependencyCount, 'Project has non-empty dependencies');
    assert.notStrictEqual(0, auditData.vulnerabilityCount, 'Project has vulnerabilities');
    assert.strictEqual(firstAuditId, auditData.auditId, 'The same audit was returned');

    assert.notStrictEqual(c, refetched, 'Cache should be refreshed from OCI');
  });

  test('Check local cache holds data fetched in past', async () => {
    let f = vscode.workspace.workspaceFolders?.[0];
    assert.ok(f, 'Project workspace folder exists');

    // make some ms, so cache time would differ, if re-fetched
    await new Promise((resolve) => setTimeout(resolve, 50));

    let auditData: any = await vscode.commands.executeCommand(
      'nbls.projectAudit.display',
      auditedSubprojectUri.toString(),
      knowledgeBaseOcid,
      {
        force: false,
        disableCache: false,
        compute: true,
        profile: selectProfile || undefined,
        returnData: true,
        displaySummary: false,
        suppressErrors: true,
      },
    );
    assert.ok(auditData, 'Audit must complete');
    assert.strictEqual(firstAuditId, auditData.auditId, 'The same audit was returned');

    let refetched = findCacheTime();
    assert.strictEqual(cacheCreated, refetched, 'No OCI fetch should happen');
  });

  test('Test forced audit update', async () => {
    let f = vscode.workspace.workspaceFolders?.[0];
    assert.ok(f, 'Project workspace folder exists');

    let auditData: any = await vscode.commands.executeCommand(
      'nbls.projectAudit.execute',
      auditedSubprojectUri.toString(),
      knowledgeBaseOcid,
      {
        profile: selectProfile || undefined,
        returnData: true,
        displaySummary: false,
        suppressErrors: true,
      },
    );
    let refetched = findCacheTime();
    let c = cacheCreated;
    cacheCreated = refetched;

    assert.ok(auditData, 'Audit must complete');
    assert.notStrictEqual(0, auditData.dependencyCount, 'Project has non-empty dependencies');
    assert.notStrictEqual(0, auditData.vulnerabilityCount, 'Project has vulnerabilities');
    assert.notStrictEqual(firstAuditId, auditData.auditId, 'A different audit from the first one must be returned');

    let audits = await ociUtils.listVulnerabilityAudits(auth.getProvider(), projectCompartment, knowledgeBaseOcid);
    assert.strictEqual(2, audits.length, 'Two audits are present');

    audits.sort((a, b) => {
      return Date.parse(a.timeCreated.toString()) - Date.parse(b.timeCreated.toString());
    });
    assert.strictEqual(audits[1].id, auditData.auditId, 'Most recent audit must be returned');
    assert.notStrictEqual(c, refetched, 'Cache should be refreshed from OCI');
  });

  test('Check reported vulnerabilities', async () => {
    let f = vscode.workspace.workspaceFolders?.[0];
    assert.ok(f, 'Project workspace folder exists');

    // make some ms, so cache time would differ, if re-fetched
    await new Promise((resolve) => setTimeout(resolve, 50));

    let auditData: any = await vscode.commands.executeCommand(
      'nbls.projectAudit.display',
      auditedSubprojectUri.toString(),
      knowledgeBaseOcid,
      {
        force: false,
        disableCache: false,
        compute: true,
        profile: selectProfile || undefined,
        returnData: true,
        displaySummary: false,
        suppressErrors: true,
      },
    );
    assert.ok(auditData, 'Audit must complete');
    let artifacts = new Map<string, number>();
    for (let item of auditData.vulnerabilities) {
      let gav = `${item.groupId}:${item.artifactId}:${item.versionSpec}`;
      artifacts.set(gav, 1);
    }
    let expectedCount = 4;
    switch (f.name) {
      case 'oci-adm-g':
        expectedCount = 5;
        break;
      case 'oci-adm-g-simple':
        expectedCount = 5;
        break;
      case 'oci-adm-m':
        expectedCount = 4;
        break;
    }
    assert.strictEqual(artifacts.size, expectedCount);
  });

  /**
   * Diags:
   * 1/ netty-codec-http through micronaut-oraclecloud-atp,
   * 2/ opentelemetry-sdk through micronaut-tracing-opentelemetry
   * 3/ opentelemetry-sdk through micronaut-tracing-opentelemetry-http
   * 4/ netty-codec-http through micronaut-tracing-opentelemetry-http
   * 5/ logback-core through logback-classic
   * 6/ logback-classic through logback-classic
   * 7/ netty-codec-http through micronaut-http-client,
   * 
   * Artifacts:
   * - netty-codec-http
   * - opentelemetry-sdk
   * - logback-core
   * - logbacj-classic
   */
  // oci-adm-g-simple: 4 / 6
  // oci-adm-g: 4 / 7
  // oci-adm-m: 4 / 4
  test('Check reported vulnerability lines', async () => {
    let f = vscode.workspace.workspaceFolders?.[0];
    assert.ok(f, 'Project workspace folder exists');

    let lines = fs.readFileSync(buildscript.fsPath).toString().split('\n');

    let diags: any[] = await vscode.commands.executeCommand('nbls.get.diagnostics', buildscript.toString());

    let expectedCount = 4;

    switch (f.name) {
      case 'oci-adm-g':
        expectedCount = 8;
        break;
      case 'oci-adm-g-simple':
        expectedCount = 7;
        break;
      case 'oci-adm-m':
        expectedCount = 4;
        break;
    }

    for (let d of diags) {
      let groupAndArtifact;

      let res = /, included by ([.-\w]+:[.-\w]+):(?:[.-\w]+)/.exec(d.message);
      if (!res) {
        res = /, by dependence: ([.-\w]+:[.-\w]+):(?:[.-\w]+)/.exec(d.message);
      }
      if (res) {
        groupAndArtifact = res[1];
        assert.ok(groupAndArtifact, 'Group and artifact ID must be present in the vulnerability report');
        let l = d.range.start.line;
        
        assert.ok(lines.length >= d.range.start.line, 'Vulnerability line must not exceed file line count');
        if (projectType === 'gradle') {
          let selected = lines[l];
          assert.ok(selected.indexOf(groupAndArtifact) >= 0, 'Reported dependency must occur on the reported line');
        } else {
          let gav = /([.-\w]+):([.-\w]+)/.exec(groupAndArtifact);
          assert.ok(gav);
          let dep = lines.slice(l, l + 3).join(' ');
          assert.ok(dep.indexOf(`artifactId>${gav[2]}`) >= 0, `Artifact ID ${gav[2]} not found`);
        }
      } else {
        assert.fail('Unexpected change in vulnerability diag message');
      }
    }
    assert.strictEqual(diags.length, expectedCount);
  });

  // removes line #39 in buildscript, that should remove 2 errors from the output, as the
  // artifacts will not be mapped anywhere.
  test('Check that buildscript change removes an error', async () => {
    let f = vscode.workspace.workspaceFolders?.[0];
    assert.ok(f, 'Project workspace folder exists');

    if (projectType === 'gradle') {
      let buildGradle = path.resolve(auditedSubprojectUri.fsPath, 'build.gradle');
      let lines = fs.readFileSync(buildGradle).toString().split('\n');
      // the vulnerable dependency comes through multiple endpoints, remove them all

      function removeGradleDependency(dep: string) {
        let x: number = -1;
        lines.filter((s, n) => {
          if (s.indexOf(dep) > 0) {
            x = n;
          }
        });
        if (x < 0) {
          return;
        }
        lines.splice(x, 1);
      }
      removeGradleDependency('micronaut-tracing-opentelemetry-http');
      removeGradleDependency('micronaut-http-client');
      removeGradleDependency('micronaut-http-server-netty');
      removeGradleDependency('micronaut-oraclecloud-atp');
      removeGradleDependency('logback-classic');
      fs.writeFileSync(buildGradle, lines.join('\n'));
    } else {
      let pomXml = path.resolve(auditedSubprojectUri.fsPath, 'pom.xml');
      let lines = fs.readFileSync(pomXml).toString().split('\n');

      function removeMavenDependency(dep: string) {
        let x: number = -1;
        lines.filter((s, n) => {
          if (s.indexOf(`artifactId>${dep}</artifactId`) > 0) {
            x = n;
          }
        });
        if (x < 0) {
          return;
        }
        lines.splice(x - 2, 5);
      }
      removeMavenDependency('micronaut-tracing-opentelemetry-http');
      removeMavenDependency('micronaut-http-client');
      removeMavenDependency('micronaut-http-server-netty');
      removeMavenDependency('micronaut-oraclecloud-atp');
      removeMavenDependency('logback-classic');

      fs.writeFileSync(pomXml, lines.join('\n'));
    }

    // wait a while for NB fs to fire changes. We may need to retry, the dependency re-collection takes some time.
    let retryCount = 6;
    let diags: any[] = [];
    while (retryCount > 0) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      diags = await vscode.commands.executeCommand('nbls.get.diagnostics', buildscript.toString());
      if (diags?.length != 3 && diags?.length > 0) {
        break;
      }
      retryCount--;
    }
    assert.ok(retryCount, 'Diagnostics for missing dependency must go away');
    let filtered = diags.filter((d) => (d.message as string).indexOf('io.netty:netty-') >= 0);
    assert.strictEqual(0, filtered.length, 'All netty vulnerability diagnostics should be gone');
  });

  test('Locally changed buildscript and obsolete report', async () => {
    let f = vscode.workspace.workspaceFolders?.[0];
    assert.ok(f, 'Project workspace folder exists');
    let auditData: any = await vscode.commands.executeCommand(
      'nbls.projectAudit.display',
      auditedSubprojectUri.toString(),
      knowledgeBaseOcid,
      {
        force: false,
        disableCache: false,
        compute: true,
        profile: selectProfile || undefined,
        returnData: true,
        displaySummary: false,
        suppressErrors: true,
      },
    );
    let expectedCount = 4;
    if (/-adm-g/.exec(f.name)) {
      // different dependency structure in gradle
      expectedCount++;
    }
    assert.strictEqual(auditData.vulnerableCount, expectedCount, 'Audit report was not recomputed, should still show old data');
  });

  test('Update vulnerability report', async () => {
    let f = vscode.workspace.workspaceFolders?.[0];
    assert.ok(f, 'Project workspace folder exists');
    let auditData: any = await vscode.commands.executeCommand(
      'nbls.projectAudit.execute',
      auditedSubprojectUri.toString(),
      knowledgeBaseOcid,
      {
        profile: selectProfile || undefined,
        returnData: true,
        displaySummary: false,
        suppressErrors: true,
      },
    );
    assert.strictEqual(1, auditData.vulnerableCount, 'Renewed report must contain just single vulnerability');
  });

  test('Updated report diagnostics', async () => {
    let f = vscode.workspace.workspaceFolders?.[0];
    assert.ok(f, 'Project workspace folder exists');
    let diags: any[] = await vscode.commands.executeCommand('nbls.get.diagnostics', buildscript.toString());
    assert.strictEqual(1, diags.length, 'Diagnostics updated according to newer audit');
  });

  // Unable to run the following test, as knowledgeBaseServices.findByFolder() runs in some weird context,
  // not sharing data with the real devopsServices.findByFolder and will block.
  /*
    test('Initial project dependency scan', async() => {
        await deleteVulnerabilityAudits();

        let audits = await ociUtils.listVulnerabilityAudits(auth.getProvider(), projectCompartment, knowledgeBaseOcid);
        assert.strictEqual(0, audits.length, 'No audits are present');

        const u = vscode.workspace.workspaceFolders?.[0].uri;
        assert.ok(u);
        let services = await findByFolder(u);
        assert.ok(services, 'Knowledgebase service must be present');
        
        await services[0].tryDisplayProjectAudit(0);

        const prjs: any[] = await vscode.commands.executeCommand('nbls.project.info', u.toString(), { recursive : true, projectStructure : true });
        if (simpleProject) {
            assert.strictEqual(1, prjs.length, 'Single project must be present');
        } else {
            assert.ok(prjs.length > 2, `Full GDK project must contain parent project + at least 2 subprojects. Found ${prjs}`);
        }

        for (let p of prjs) {
            let auditData : any = await vscode.commands.executeCommand('nbls.projectAudit.display', p.projectDirectory, knowledgeBaseOcid, 
            { 
                force : false,
                disableCache : false,
                compute : false, 
                profile: selectProfile || undefined,
                returnData: true,
                displaySummary: false,
                suppressErrors: true
            });
            assert.ok(auditData, 'Audit display must complete successfuly');
            assert.notStrictEqual(0, auditData.dependencyCount, `Project audit was never executed for ${p}`);
        }
    })
    */

  test('Cleanup deployed project', async () => {
    if (projectId && projectCompartment && !process.env['TEST_ADM_REUSE_PROJECTS']) {
      await vscode.commands.executeCommand('oci.devops.undeployFromCloudSync');
    }
  });
});
