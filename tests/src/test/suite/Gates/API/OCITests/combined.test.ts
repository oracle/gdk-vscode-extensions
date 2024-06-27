import * as assert from 'assert';
import * as vscode from 'vscode';
import { devops, identity } from 'oci-sdk';
import * as path from 'path';
import { execSync } from 'child_process';

import * as projectUtils from '../../../../../../../oci-devops/out/projectUtils';
import * as ociAuthentication from '../../../../../../../oci-devops/out/oci/ociAuthentication';
import * as ociUtils from '../../../../../../../oci-devops/out/oci/ociUtils';
import { DeployOptions } from '../../../../../../../oci-devops/out/oci/deployUtils';
import { logError } from '../../../../../../../common/lib/logUtils';
import { NodeProvider } from '../../../../../../../oci-devops/out/servicesView';
import { BuildPipelineNode } from '../../../../../../../oci-devops/out/oci/buildServices';
import * as helper from './helpers';
import { DeploymentPipelineNode } from '../../../../../../../oci-devops/out/oci/deploymentServices';
import { waitForStatup } from '../helpers';
import { generateUID } from '../../../../../Common/helpers';

let wf = vscode.workspace.workspaceFolders;

suite(`Oci Combined pipelines test: ${wf![0].name}`, function () {
  const wf = vscode.workspace.workspaceFolders;

  const COMPARTMENT_OCID: string = process.env['TEST_DEPLOY_COMPARTMENT_OCID']
    ? process.env['TEST_DEPLOY_COMPARTMENT_OCID']
    : 'ocid1.compartment.oc1..aaaaaaaa7thgaondgokuwyujlq4tosnpfaohdivlbbr64izsx5jxfxrezxca';
  const DEPLOY_COMPARTMENT_NAME: string = 'tests';

  let deployProjectName: string;
  let codeRepositoryId: string;
  let projectFolder: projectUtils.ProjectFolder;
  let selectedProfile: string;
  let projectId: string;
  let project: any;
  let provider: any;
  let comaprtmentOCID: string;
  let jvmItem: any;
  let randomGuid: string;
  let extContext: vscode.ExtensionContext;

  suite('Test configuaration', function () {
    suite('Prepare poject', function () {
      let projectType: string;
      suite('Extension testing', function () {
        vscode.window.showInformationMessage('Start Extension testing');
        /* Wait for the NBLS to start */
        // the timeout will propagate to beforeAll hook
        this.timeout(5 * 60 * 1000);
        this.beforeAll(async () => {
          await waitForStatup(wf![0]);
        });

        // This test must be run first, in order to activate the extension (and wait for the activation to complete)
        test('Extension loaded', async () => {
          let extension = vscode.extensions.getExtension('oracle-labs-graalvm.oci-devops');
          assert.ok(extension, 'No OCI DevOps Tools extension found!');

          await extension.activate();
          assert.ok(extension.isActive, 'OCI DevOps extension failed to activate!');

          await vscode.commands.executeCommand('git.close');
        });

        // Check if OCI DevOps Tools commands have been loaded
        test('OCI DevOps Tools commands loaded', async () => {
          let commands = await vscode.commands.getCommands(true);

          let containsOciDevOpsCommands = false;
          for (const command of commands) {
            if (command.indexOf('oci.devops.') === 0) containsOciDevOpsCommands = true;
          }

          assert.ok(containsOciDevOpsCommands, 'No OCI DevOps Tools command has been loaded');
        });

        // Check if OCI DevOps Tools page opens
        test('OCI DevOps Tools page', async () => {
          await vscode.commands.executeCommand('oci.devops.showToolsPage');

          // The marvellous vscode completes the command, but still has the active tab set to the previous content,
          // so let's wait a while in a timeouted loop....
          let res = new Promise((resolve, reject) => {
            let counter = 3; // by default test timeout is 5 secs, increase if set to > 4.
            function w() {
              if (counter > 0 && vscode.window.tabGroups.activeTabGroup.activeTab?.label !== 'OCI DevOps Tools') {
                counter--;
                setTimeout(w, 1000);
                return;
              }
              try {
                assert.strictEqual(
                  vscode.window.tabGroups.activeTabGroup.activeTab?.label,
                  'OCI DevOps Tools',
                  'Tools page is not being shown',
                );
                resolve(true);
              } catch (err: any) {
                reject(err);
              }
            }
            w();
          });
          return res;
        });

        // Check if the workspace has an OCI deployable project inside
        test('Contains OCI Project', async () => {
          if (!wf?.length) {
            assert.throws(() => logError('Extension host did not load any workspace folders!'));
          } else {
            projectFolder = await projectUtils.getProjectFolder(wf[0]);

            projectType = projectFolder.projectType;
            assert.ok(
              projectType === 'GDK' || projectType === 'Micronaut',
              'Specified project should be deployable to OCI',
            );
          }
        });

        test('Clean extension deploy context', async function() {
          extContext = await vscode.commands.executeCommand('_oci.devops.getExtensionContext');
          if (extContext) {
            extContext.workspaceState.update('devops_tooling_deployData', undefined);
          }
        });

        test('Create controller', async function () {
          randomGuid = generateUID();
          assert.ok(wf);
          assert.ok(wf.length === 1);
          const project = wf[0];
          const directoryName = project.uri.fsPath;
          assert.ok(directoryName);
          let controllerPath: string;
          if (projectType === 'GDK') {
            controllerPath = path.join('oci', 'src', 'main', 'java', 'com', 'example');
          } else if (projectType === 'Micronaut') {
            controllerPath = path.join('src', 'main', 'java', 'com', 'example');
          } else {
            assert.fail('unknown project type' + projectType);
          }

          assert.ok(
            helper.createController(directoryName, controllerPath, randomGuid),
            'controller created for ' + projectType,
          );
          deployProjectName = project.name;
        });
      });

      suite(`OCI configuration, compartment ${COMPARTMENT_OCID}`, async function () {
        test('Check Default Config profiles', async function () {
          assert.ok(
            COMPARTMENT_OCID,
            'require your OCID to be as environment variable under name TEST_DEPLOY_COMPARTMENT_OCID',
          );
          let defaultConfigFile = ociAuthentication.getDefaultConfigFile();
          assert.ok(defaultConfigFile !== '', 'Default configuration file not found');

          let profiles = ociAuthentication.listProfiles(defaultConfigFile);
          assert.ok(profiles.length > 0, 'No configuration profile Found');

          selectedProfile = helper.getProfile(profiles);
          assert.ok(
            selectedProfile && selectedProfile !== '',
            'Default profile cannot be determined. Make sure to have [DEFAULT] or [TESTS] profile in oci config.',
          );
        });

        test('Check Authentication', async function () {
          const ACTION_NAME = 'Authenticate';
          const auth = await ociAuthentication.resolve(ACTION_NAME, selectedProfile);
          assert.ok(auth, 'Cannot authenticated');

          const problem = auth.getConfigurationProblem();
          assert.ok(!problem, 'Authentication Problems: ' + problem);

          assert.ok(auth, 'Authentication failed! Check your oci config');
          const localprovider = auth.getProvider();
          assert.ok(localprovider, 'Cannot get provider');
        });

        // get provider data
        test('Authenticate to oci', async () => {
          const ACTION_NAME = 'Deploy to OCI';

          const auth = await ociAuthentication.resolve(ACTION_NAME, selectedProfile);
          assert.ok(auth, 'Authentication failed! Check your oci config.');

          const configurationProblem = auth.getConfigurationProblem();
          assert.ok(!configurationProblem, configurationProblem);

          assert.ok(auth, 'Authentication failed! Check your oci config.');
          provider = auth.getProvider();
          assert.ok(provider, 'provider is ok');
        });

        test('Check Networking Connectivity', async function () {
          this.timeout(5 * 60 * 1000);

          assert.ok(provider, 'Provider not authenticated');

          let vcns = await ociUtils.listVCNs(provider, COMPARTMENT_OCID);
          assert.ok(vcns.length > 0, 'Virual Networks Not Found');
        });

        test('Check clusters', async function () {
          const clusters = await ociUtils.listClusters(provider, COMPARTMENT_OCID);
          assert.ok(clusters && clusters.length > 0, 'No cluster Found in your compartment');
        });
      });
    });

    suite('Create OCI devops project', function () {
      // revert for tests (deployment/undeployment might take some time)
      this.timeout(5 * 60 * 1000);

      // Find OCID of target compartment
      test('List compartments', async () => {
        if (!provider) assert.fail('provider is null');

        const compartments: identity.models.Compartment[] = await ociUtils.listCompartments(provider);

        assert.ok(compartments.length > 0, 'No compartments listed');

        for (let compartment of compartments) {
          if (compartment.id === COMPARTMENT_OCID) {
            comaprtmentOCID = compartment.id;
            break;
          }
          if (compartment.name === DEPLOY_COMPARTMENT_NAME) {
            comaprtmentOCID = compartment.id;
          }
        }
        assert.ok(comaprtmentOCID && comaprtmentOCID !== '', 'No comapartment ' + DEPLOY_COMPARTMENT_NAME + ' found!');
      });

      // list devops projects inside a compartment
      test('List devops projects', async () => {
        if (!provider) assert.fail('provider is null');

        const DevOpsProjects: devops.models.ProjectSummary[] = await ociUtils.listDevOpsProjects(
          provider,
          comaprtmentOCID,
        );

        // left from previos unsuccessfull runs
        for (let project of DevOpsProjects) {
          if (project.name === deployProjectName) {
            await vscode.commands.executeCommand('oci.devops.undeployFromCloudSync');
            await ociUtils.deleteDevOpsProject(provider, project.id, true);
          }
        }
      });

      test('Deploy project', async () => {
        if (!provider) assert.fail('provider is null');
        const deployOptions: DeployOptions = {
          compartment: {
            ocid: comaprtmentOCID
          },
          skipOKESupport: false,
          projectName: deployProjectName,
          selectProfile: selectedProfile,
          autoConfirmDeploy: true,
        };

        await vscode.commands.executeCommand('oci.devops.deployToCloud_GlobalSync', deployOptions);

        const DevOpsProjects = await ociUtils.listDevOpsProjects(provider, comaprtmentOCID);
        for (let project of DevOpsProjects) {
          if (project.name === deployProjectName) {
            projectId = project.id;
          }
        }
        assert.ok(projectId && projectId !== '', 'Project not successfully deployed');

        project = await ociUtils.getDevopsProject(provider, projectId);
        assert.ok(project);
      });

      test('Check Code Repository', async function () {
        const codeRepositories = await ociUtils.listCodeRepositories(provider, projectId);
        assert.ok(codeRepositories.length > 0, 'Code Repository Not Found');
        codeRepositoryId = codeRepositories[0].id;
        assert.ok(codeRepositoryId);
        const repositoryName = (await ociUtils.getCodeRepository(provider, codeRepositoryId)).name || project.name;
        assert.ok(repositoryName, 'Repository Not Found');
      });
    });

    suite('Build pipeline Test Suite', function () {
      this.timeout(5 * 60 * 1000);
      let JVMContainerPipelineId: string = '';
      let nativeExecutablePipelineId: string = '';
      test('List build pipelines', async () => {
        assert.ok(provider !== undefined, 'Authentication failed');

        const buildPipelinesList: any[] = await ociUtils.listBuildPipelines(provider, projectId);
        assert.ok(buildPipelinesList.length > 0, 'No build pipelines found!');
        let foundJVMContainer: boolean = false;
        let foundNativeExecutableContainer: boolean = false;
        for (let buildPipe of buildPipelinesList) {
          if (
            buildPipe.displayName?.indexOf('Build OCI JVM Container') !== -1 ||
            buildPipe.displayName?.indexOf('Build JVM Container') !== -1
          ) {
            foundJVMContainer = true;
            JVMContainerPipelineId = buildPipe.id;
          } else if (
            buildPipe.displayName?.indexOf('Build OCI Native Executable Container') !== -1 ||
            buildPipe.displayName?.indexOf('Build Native Executable Container') !== -1
          ) {
            foundNativeExecutableContainer = true;
            nativeExecutablePipelineId = buildPipe.id;
          }
        }
        assert.ok(foundJVMContainer, 'Build pipeline `Build JVM Container` not found');
        assert.ok(foundNativeExecutableContainer, 'Build pipeline `Build Native Executable Container` not found');
      });

      // List build stages
      test('List build stages', async () => {
        assert.ok(provider !== undefined, 'Authentication failed');
        const stages = await ociUtils.listBuildPipelineStages(provider, JVMContainerPipelineId);
        assert.ok(stages.length > 0, 'No JVM build pipeline stages found!');

        jvmItem = stages.find(
          (item1) =>
            item1.buildPipelineStageType === devops.models.DeliverArtifactStageSummary.buildPipelineStageType,
        ) as devops.models.DeliverArtifactStageSummary;
        assert.ok(jvmItem?.deliverArtifactCollection.items.length, 'Jvm item Not Found ');
      });

      test('Artifact', async function () {
        const jvmartifact = await ociUtils.getDeployArtifact(
          provider,
          jvmItem.deliverArtifactCollection.items[0].artifactId,
        );
        assert.ok(
          jvmartifact.deployArtifactSource.deployArtifactSourceType ===
          devops.models.OcirDeployArtifactSource.deployArtifactSourceType,
          'Artifact Not Found',
        );
        const image = (jvmartifact.deployArtifactSource as devops.models.OcirDeployArtifactSource).imageUri;
        assert.ok(image, 'No Image Found');
      });

      // Start the build pipelines
      let jvmBuildState: string | undefined;
      let nativeBuildState: string | undefined;
      test('Start build pipeline', async () => {
        const nodeProvider: NodeProvider = await vscode.commands.executeCommand('oci.devops.nodeProvider');
        assert.ok(nodeProvider !== undefined, 'Node provider is not initialized!');

        const buildPipelines: BuildPipelineNode[] = nodeProvider.getChildren() as BuildPipelineNode[];
        assert.ok(buildPipelines.length > 0, 'No build pipelines found!');

        let JvmBuildPipelineIndex = -1;
        let NativeBuildPipelineIndex = -1;
        for (let i = 0; i < buildPipelines.length; ++i) {
          if (
            buildPipelines[i].label === 'Build OCI JVM Container' ||
            buildPipelines[i].label === 'Build JVM Container'
          )
            JvmBuildPipelineIndex = i;
          else if (
            buildPipelines[i].label === 'Build OCI Native Executable Container' ||
            buildPipelines[i].label === 'Build Native Executable Container'
          )
            NativeBuildPipelineIndex = i;
        }
        assert.ok(JvmBuildPipelineIndex !== -1, 'Pipeline `Build JVM Container` not found');
        assert.ok(NativeBuildPipelineIndex !== -1, 'Pipeline `Build Native Executable Container` not found');

        const jvmbuildPipeline: BuildPipelineNode = buildPipelines[JvmBuildPipelineIndex];
        jvmBuildState = jvmbuildPipeline.contextValue;

        const nativebuildPipeline: BuildPipelineNode = buildPipelines[NativeBuildPipelineIndex];
        nativeBuildState = nativebuildPipeline.contextValue;

        nativebuildPipeline.runPipeline(true); // TODO await
        jvmbuildPipeline.runPipeline(true); // TODO await

        // wait for build pipeline to change states
        jvmBuildState = await helper.waitForContextChange(jvmBuildState, jvmbuildPipeline, 60 * 30);
        nativeBuildState = await helper.waitForContextChange(nativeBuildState, nativebuildPipeline, 60 * 30);

        assert.ok(jvmBuildState !== undefined, 'Build timeout in switching to running state');
        assert.ok(nativeBuildState !== undefined, 'Build timeout in switching to running state');

        assert.strictEqual(
          jvmBuildState,
          'oci.devops.buildPipelineNode-in-progress',
          'Build switched to unexpected state',
        );

        assert.strictEqual(
          nativeBuildState,
          'oci.devops.buildPipelineNode-in-progress',
          'Build switched to unexpected state',
        );

        // wait for build to finish
        jvmBuildState = await helper.waitForContextChange(jvmBuildState, jvmbuildPipeline, 60 * 30);
        nativeBuildState = await helper.waitForContextChange(nativeBuildState, nativebuildPipeline, 60 * 30);

        assert.ok(jvmBuildState !== undefined, 'Build timeout in switching to finishing state');
        assert.ok(nativeBuildState !== undefined, 'Build timeout in switching to finishing state');
        assert.strictEqual(
          jvmBuildState,
          'oci.devops.buildPipelineNode-single-image-available',
          'Build switched to unexpected state',
        );
        assert.strictEqual(
          nativeBuildState,
          'oci.devops.buildPipelineNode-single-image-available',
          'Build switched to unexpected state',
        );
      }).timeout(1000 * 60 * 30);

      // List build runs (previous build should be present)
      test('List build runs', async () => {
        assert.ok(provider !== undefined, 'Authentication failed');

        test('JVMs', async () => {
          const runs: any[] = await ociUtils.listBuildRuns(provider, JVMContainerPipelineId);
          assert.ok(runs.length > 0, 'No build runs');

          // Check latest run if succeeded
          assert.ok(runs[0].lifecycleState === 'SUCCEEDED');
        });

        test('NATIVE', async () => {
          const runs: any[] = await ociUtils.listBuildRuns(provider, nativeExecutablePipelineId);
          assert.ok(runs.length > 0, 'No build runs');

          // Check latest run if succeeded
          assert.ok(runs[0].lifecycleState === 'SUCCEEDED');
        });
      });

      test('List build runs by code repository', async () => {
        let buildPipelines = await ociUtils.listBuildPipelinesByCodeRepository(provider, projectId, codeRepositoryId);
        assert.ok(buildPipelines.length > 0, 'Build Pipelines Not Created');

        const existingBuildPipelines = buildPipelines?.filter(
          (item) => 'oci' === item.freeformTags?.devops_tooling_docker_image,
        );
        assert.ok(existingBuildPipelines.length > 0, 'Build Pipelines Not Created');

        test('JVM', async () => {
          const buildPipeline = existingBuildPipelines.filter((pipe) => pipe.displayName?.includes('JVM Container'))[0];
          assert.ok(buildPipeline, 'Build Pipeline JVM Not Created');
        });

        test('Native', async () => {
          const nativeBuildPipeline = existingBuildPipelines.filter(
            (pipe) => pipe.displayName?.includes('Native Executable Container'),
          )[0];
          assert.ok(nativeBuildPipeline, 'Native Executable JVM Not Created');
        });
      }).timeout(1000 * 60 * 30);
    });

    suite('Deploy pipeline Test Suite', function () {
      this.timeout(5 * 60 * 1000);
      // List all build pipelines
      let JVMContainerPipelineId: string = '';
      let nativeContainerPipelineId: string = '';
      test('List deploy pipelines', async () => {
        assert.ok(provider !== undefined, 'Authentication failed');
        assert.ok(projectId !== undefined, 'Problem with projectId');

        const deployPipelinesList: any[] = await ociUtils.listDeployPipelines(provider, projectId);
        assert.ok(deployPipelinesList.length > 0, 'No deploy pipelines found!');

        let foundJVMContainer: boolean = false;
        let foundNativeExecutableContainer: boolean = false;
        for (let deployPipeline of deployPipelinesList) {
          if (
            deployPipeline.displayName?.indexOf('Deploy OCI JVM Container to OKE') !== -1 ||
            deployPipeline.displayName?.indexOf('Deploy JVM Container to OKE') !== -1
          ) {
            foundJVMContainer = true;
            JVMContainerPipelineId = deployPipeline.id;
          } else if (
            deployPipeline.displayName?.indexOf('Deploy OCI Native Executable Container to OKE') !== -1 ||
            deployPipeline.displayName?.indexOf('Deploy Native Executable Container to OKE') !== -1
          ) {
            foundNativeExecutableContainer = true;
            nativeContainerPipelineId = deployPipeline.id;
          }
        }

        assert.ok(foundJVMContainer, 'Deploy pipeline `Deploy JVM Container to OKE` not found');
        assert.ok(foundNativeExecutableContainer, 'Deploy Native Executable Container to OKE');
      });

      // List deploy stages
      test('List deploy stages', async () => {
        assert.ok(provider !== undefined, 'Authentication failed');

        const JVMstages = await ociUtils.listDeployStages(provider, JVMContainerPipelineId);
        assert.ok(JVMstages.length > 0, 'No deploy pipeline stages found!');

        const NativeStages = await ociUtils.listDeployStages(provider, nativeContainerPipelineId);
        assert.ok(NativeStages.length > 0, 'No deploy pipeline stages found!');
      });

      // Start the deploy pipelines
      let jvmBuildState: string | undefined;
      let nativeBuildState: string | undefined;
      let jvmDeployPipeline: DeploymentPipelineNode;
      let nativeDeployPipeline: DeploymentPipelineNode;
      test('Start deploy pipeline', async () => {
        const nodeProvider: NodeProvider = await vscode.commands.executeCommand('oci.devops.nodeProvider');
        assert.ok(nodeProvider !== undefined, 'Node provider is not initialized!');

        const deployPipelines: DeploymentPipelineNode[] = nodeProvider.getChildren() as DeploymentPipelineNode[];
        assert.ok(deployPipelines.length > 0, 'No build pipelines found!');

        let jvmBuildPipelineIndex = -1;
        let nativeBuildPipelineIndex = -1;
        for (let i = 0; i < deployPipelines.length; ++i) {
          if (
            deployPipelines[i].label === 'Deploy OCI JVM Container to OKE' ||
            deployPipelines[i].label === 'Deploy JVM Container to OKE'
          )
            jvmBuildPipelineIndex = i;
          else if (
            deployPipelines[i].label === 'Deploy OCI Native Executable Container to OKE' ||
            deployPipelines[i].label === 'Deploy Native Executable Container to OKE'
          )
            nativeBuildPipelineIndex = i;
        }
        assert.ok(jvmBuildPipelineIndex !== -1, 'Pipeline `Deploy OCI JVM Container to OKE` not found');
        assert.ok(nativeBuildPipelineIndex !== -1, 'Deploy OCI Native Executable Container to OKE');

        jvmDeployPipeline = deployPipelines[jvmBuildPipelineIndex];
        nativeDeployPipeline = deployPipelines[nativeBuildPipelineIndex];
        assert.ok(jvmDeployPipeline);
        assert.ok(nativeDeployPipeline);
        jvmBuildState = jvmDeployPipeline.contextValue;
        nativeBuildState = jvmDeployPipeline.contextValue;

        await vscode.commands.executeCommand('oci.devops.runDeployPipeline', nativeDeployPipeline);
        await vscode.commands.executeCommand('oci.devops.runDeployPipeline', jvmDeployPipeline);

        // wait for build pipeline to change states
        jvmBuildState = await helper.waitForContextChange(jvmBuildState, jvmDeployPipeline, 60 * 30);
        nativeBuildState = await helper.waitForContextChange(nativeBuildState, nativeDeployPipeline, 60 * 30);

        assert.ok(jvmBuildState !== undefined, 'Build timeout in switching to running state');
        assert.strictEqual(
          jvmBuildState,
          'oci.devops.deploymentPipelineNode-in-progress',
          'Build switched to unexpected state',
        );

        assert.ok(nativeBuildState !== undefined, 'Build timeout in switching to running state');
        assert.strictEqual(
          nativeBuildState,
          'oci.devops.deploymentPipelineNode-in-progress',
          'Build switched to unexpected state',
        );

        // wait for build to finish
        jvmBuildState = await helper.waitForContextChange(jvmBuildState, jvmDeployPipeline, 60 * 30);
        nativeBuildState = await helper.waitForContextChange(nativeBuildState, nativeDeployPipeline, 60 * 30);
        assert.ok(jvmBuildState !== undefined, 'Build timeout in switching to finishing state');
        assert.ok(nativeBuildState !== undefined, 'Build timeout in switching to finishing state');
        assert.ok(
          jvmBuildState === 'oci.devops.deploymentPipelineNode-has-lastdeployment' ||
          jvmBuildState === 'oci.devops.deploymentPipelineNode-deployments-available',
          'Build switched to unexpected state',
        );
        assert.ok(
          nativeBuildState === 'oci.devops.deploymentPipelineNode-has-lastdeployment' ||
          nativeBuildState === 'oci.devops.deploymentPipelineNode-deployments-available',
          'Build switched to unexpected state',
        );
      }).timeout(1000 * 60 * 30);

      // List build runs (previous build should be present)
      test('List deploy runs', async () => {
        assert.ok(provider !== undefined, 'Authentication failed');

        const jvmRuns: any[] = await ociUtils.listDeployments(provider, JVMContainerPipelineId);
        const nativeRuns: any[] = await ociUtils.listDeployments(provider, nativeContainerPipelineId);

        assert.ok(jvmRuns.length > 0, 'No build runs');
        // Check if latest two runs succeeded
        assert.strictEqual(jvmRuns[0].lifecycleState, 'SUCCEEDED', 'JVM run is in ${jvmRuns[0].lifecycleState} state rather than SUCCEEDED');

        assert.ok(nativeRuns.length > 0, 'No build runs');
        // Check if latest two runs succeeded
        assert.strictEqual(nativeRuns[0].lifecycleState, 'SUCCEEDED', 'Native run is in ${nativeRuns[0].lifecycleState} state rather than SUCCEEDED');
      });
    });

    suite('Clean', function () {
      this.timeout(50 * 60 * 1000);

      test('Undeploy project', async () => {
        await vscode.commands.executeCommand('oci.devops.undeployFromCloudSync');
        await new Promise((f) => setTimeout(f, 5000));
        let DevOpsProjects = await ociUtils.listDevOpsProjects(provider, comaprtmentOCID);
        for (let project of DevOpsProjects) {
          if (project.name === deployProjectName) {
            assert.fail('Project not successfully undeployed');
          }
        }
      }).timeout(50 * 60 * 1000);

      this.afterAll(() => {
        try {
          const projectName = wf![0].name;
          let deploymentName = projectName.replace(/_/g, "-");
          
          const deleteCommand = `kubectl delete deployment ${deploymentName} -n default`;
          execSync(deleteCommand, { timeout: 50000 });
          console.log(`Deployment ${projectName} deleted in the default namespace.`);
        } catch (error) {
          console.error('Error deleting deployments:', error);
        }
        }).timeout(60 * 1000);

    });
  });
});
