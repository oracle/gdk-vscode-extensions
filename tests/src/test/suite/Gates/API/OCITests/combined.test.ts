import * as assert from 'assert';
import * as vscode from 'vscode';
import { containerengine, devops, identity } from 'oci-sdk';
import * as projectUtils from '../../../../../../../oci-devops/out/projectUtils';
import * as ociAuthentication from '../../../../../../../oci-devops/out/oci/ociAuthentication';
import * as ociUtils from '../../../../../../../oci-devops/out/oci/ociUtils';
import * as vcnUtils from '../../../../../../../oci-devops/out/oci/vcnUtils';
import * as path from 'path';
import { DeployOptions } from '../../../../../../../oci-devops/out/oci/deployUtils';
import { logError } from '../../../../../../../common/lib/logUtils';
import { NodeProvider } from '../../../../../../../oci-devops/out/servicesView';
import { BuildPipelineNode } from '../../../../../../../oci-devops/out/oci/buildServices';
import * as helper from './helpers';
import { DeploymentPipelineNode } from '../../../../../../../oci-devops/out/oci/deploymentServices';

suite('Oci Combined pipelines test', function () {
  const wf = vscode.workspace.workspaceFolders;

  const COMPARTMENT_OCID: string = process.env['TEST_DEPLOY_COMPARTMENT_OCID']
    ? process.env['TEST_DEPLOY_COMPARTMENT_OCID']
    : 'ocid1.compartment.oc1..aaaaaaaa7thgaondgokuwyujlq4tosnpfaohdivlbbr64izsx5jxfxrezxca';
  const DEPLOY_COMPARTMENT_NAME: string = 'tests';

  let deploy_project_name: string;
  let selectedProfile = '';
  let projectId: string = '';
  let provider: any;
  let comaprtmentOCID = '';
  let codeRepositoryId = '';

  let projectFolder: any;
  let buildBipeline: any;
  let project: any;
  let item: any;
  let image: any;
  let subnet: any;
  let okeClusterEnvironment: any;

  let cluster: containerengine.models.Cluster;
  let deployPipelineId = '';
  let repositoryName: string;

  let randNumber = '';

  suite('Test configuaration', function () {
    suite('Prepare poject', async function () {
      test('Create controller', async function () {
        randNumber = helper.generateUID();
        assert.ok(wf);
        assert.ok(wf.length === 1);
        const project = wf[0];
        const directoryName = project.uri.fsPath;
        assert.ok(directoryName);
        const controllerPath = path.join('oci', 'src', 'main', 'java', 'com', 'example');
        assert.ok(helper.createController(directoryName, controllerPath, randNumber), 'controller created');
        deploy_project_name = project.name;
      });

      suite('OCI configuration', async function () {
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
            selectedProfile !== '',
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
          cluster = clusters[0] as containerengine.models.Cluster;
        });
      });
      suite('Extension testing', function () {
        vscode.window.showInformationMessage('Start Extension testing');

        /* Wait for the NBLS to start */
        // the timeout will propagate to beforeAll hook
        this.timeout(5 * 60 * 1000);
        this.beforeAll(async () => {
          await helper.waitForStatup(wf![0]);
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
              // let label = vscode.window.tabGroups.activeTabGroup.activeTab?.label;
              // console.log(`Waiting for the active editor to change: counter=${counter}, label =${label}`)
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
            assert.strictEqual(projectFolder.projectType, 'GCN', 'Specified project should be deployable to OCI');
          }
        });
      });
    });

    suite('Create OCI devops project', function () {
      vscode.window.showInformationMessage('Start all tests.');

      // revert for tests (deployment/undeployment might take some time)
      this.timeout(5 * 60 * 1000);

      // Find OCID of target compartment
      test('List compartments', async () => {
        if (!provider) assert.fail('provider is null');

        const compartments: identity.models.Compartment[] = await ociUtils.listCompartments(provider);

        assert.ok(compartments.length > 0, 'No compartments listed');

        for (let compartment of compartments) {
          if (compartment.name === DEPLOY_COMPARTMENT_NAME) comaprtmentOCID = compartment.id;
        }
        assert.ok(comaprtmentOCID !== '', 'No comapartment ' + DEPLOY_COMPARTMENT_NAME + ' found!');
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
          if (project.name === deploy_project_name) {
            await vscode.commands.executeCommand('oci.devops.undeployFromCloudSync');
            await ociUtils.deleteDevOpsProject(provider, project.id, true);
          }
        }
      });

      test('Deploy project', async () => {
        if (!provider) assert.fail('provider is null');
        const deployOptions: DeployOptions = {
          compartment: {
            ocid: comaprtmentOCID,
            name: 'gcn-dev/' + DEPLOY_COMPARTMENT_NAME,
          },
          skipOKESupport: false,
          projectName: deploy_project_name,
          selectProfile: selectedProfile,
          autoConfirmDeploy: true,
        };

        await vscode.commands.executeCommand('oci.devops.deployToCloud_GlobalSync', deployOptions);

        const DevOpsProjects = await ociUtils.listDevOpsProjects(provider, comaprtmentOCID);
        for (let project of DevOpsProjects) {
          if (project.name === deploy_project_name) {
            projectId = project.id;
          }
        }
        assert.ok(projectId !== '', 'Project not successfully deployed');

        project = await ociUtils.getDevopsProject(provider, projectId);
        assert.ok(project);
      });

      test('Check Code Repository', async function () {
        const codeRepositories = await ociUtils.listCodeRepositories(provider, projectId);
        assert.ok(codeRepositories.length > 0, 'Code Repository Not Found');
        codeRepositoryId = codeRepositories[0].id;
        assert.ok(codeRepositoryId);
        repositoryName = (await ociUtils.getCodeRepository(provider, codeRepositoryId)).name || project.name;
        assert.ok(repositoryName, 'Repository Not Found');
      });
    });

    suite('Build pipeline Test Suite', function () {
      vscode.window.showInformationMessage('Start all tests.');
      this.timeout(5 * 60 * 1000);
      let JVMContainerPipelineId: string = '';
      test('List build pipelines', async () => {
        assert.ok(provider !== undefined, 'Authentication failed');

        const buildPipelinesList: any[] = await ociUtils.listBuildPipelines(provider, projectId);
        assert.ok(buildPipelinesList.length > 0, 'No build pipelines found!');

        let foundJVMContainer: boolean = false;
        let foundNativeExecutableContainer: boolean = false;
        for (let buildPipeline of buildPipelinesList) {
          if (buildPipeline.displayName?.indexOf('Build OCI JVM Container') !== -1) {
            foundJVMContainer = true;
            JVMContainerPipelineId = buildPipeline.id;
          } else if (buildPipeline.displayName?.indexOf('Build OCI Native Executable Container') !== -1)
            foundNativeExecutableContainer = true;
        }
        assert.ok(foundJVMContainer, 'Build pipeline `Build OCI JVM Container` not found');
        assert.ok(foundNativeExecutableContainer, 'Build pipeline `Build OCI Native Executable Container` not found');
      });

      // List build stages
      test('List build stages', async () => {
        assert.ok(provider !== undefined, 'Authentication failed');

        const stages = await ociUtils.listBuildPipelineStages(provider, JVMContainerPipelineId);
        assert.ok(stages.length > 0, 'No build pipeline stages found!');

        item = stages.find(
          (item1) => item1.buildPipelineStageType === devops.models.DeliverArtifactStageSummary.buildPipelineStageType,
        ) as devops.models.DeliverArtifactStageSummary;
        assert.ok(item?.deliverArtifactCollection.items.length, 'Item Not Found ');
      });

      test('Artifact', async function () {
        const artifact = await ociUtils.getDeployArtifact(provider, item.deliverArtifactCollection.items[0].artifactId);
        assert.ok(
          artifact.deployArtifactSource.deployArtifactSourceType ===
            devops.models.OcirDeployArtifactSource.deployArtifactSourceType,
          'Artifact Not Found',
        );
        image = (artifact.deployArtifactSource as devops.models.OcirDeployArtifactSource).imageUri;
        assert.ok(image, 'No Image Found');
      });

      // Start the build pipeline: Build OCI JVM Container
      let buildState: string | undefined;
      test('Start build pipeline', async () => {
        const nodeProvider: NodeProvider = await vscode.commands.executeCommand('oci.devops.nodeProvider');
        assert.ok(nodeProvider !== undefined, 'Node provider is not initialized!');

        const buildPipelines: BuildPipelineNode[] = nodeProvider.getChildren() as BuildPipelineNode[];
        assert.ok(buildPipelines.length > 0, 'No build pipelines found!');

        let buildPipelineIndex = -1;
        for (let i = 0; i < buildPipelines.length; ++i) {
          if (buildPipelines[i].label === 'Build OCI JVM Container') buildPipelineIndex = i;
        }
        assert.ok(buildPipelineIndex !== -1, 'Pipeline `Build OCI JVM Container` not found');

        const buildPipeline: BuildPipelineNode = buildPipelines[buildPipelineIndex];
        buildState = buildPipeline.contextValue;

        await vscode.commands.executeCommand('oci.devops.runBuildPipeline', buildPipeline);

        // wait for build pipeline to change states
        buildState = await helper.waitForContextChange(buildState, buildPipeline, 60 * 30);

        assert.ok(buildState !== undefined, 'Build timeout in switching to running state');
        assert.strictEqual(
          buildState,
          'oci.devops.buildPipelineNode-in-progress',
          'Build switched to unexpected state',
        );

        // wait for build to finish
        buildState = await helper.waitForContextChange(buildState, buildPipeline, 60 * 30);
        assert.ok(buildState !== undefined, 'Build timeout in switching to finishing state');
        assert.strictEqual(
          buildState,
          'oci.devops.buildPipelineNode-single-image-available',
          'Build switched to unexpected state',
        );
      }).timeout(1000 * 60 * 30);

      // List build runs (previous build should be present)
      test('List build runs', async () => {
        assert.ok(provider !== undefined, 'Authentication failed');

        const runs: any[] = await ociUtils.listBuildRuns(provider, JVMContainerPipelineId);
        assert.ok(runs.length > 0, 'No build runs');

        // Check latest run if succeeded
        assert.ok(runs[0].lifecycleState === 'SUCCEEDED');
      });

      test('List build runs by code repository', async () => {
        let buildPipelines = await ociUtils.listBuildPipelinesByCodeRepository(provider, projectId, codeRepositoryId);
        assert.ok(buildPipelines.length > 0, 'Build Pipelines Not Created');

        const existingBuildPipelines = buildPipelines?.filter(
          (item) => 'oci' === item.freeformTags?.devops_tooling_docker_image,
        );
        assert.ok(existingBuildPipelines.length > 0, 'Build Pipelines Not Created');

        buildBipeline = existingBuildPipelines.filter((pipe) => pipe.displayName?.includes('JVM Container'))[0];
        assert.ok(buildBipeline, 'Build Pipeline JVM Not Created');
      }).timeout(1000 * 60 * 30);
    });

    suite('Deploy pipeline Test Suite', function () {
      vscode.window.showInformationMessage('Start all tests.');
      this.timeout(5 * 60 * 1000);
      // List all build pipelines
      let JVMContainerPipelineId: string = '';
      test('List deploy pipelines', async () => {
        assert.ok(provider !== undefined, 'Authentication failed');

        const deployPipelinesList: any[] = await ociUtils.listDeployPipelines(provider, projectId);
        assert.ok(deployPipelinesList.length > 0, 'No deploy pipelines found!');

        let foundJVMContainer: boolean = false;
        let foundNativeExecutableContainer: boolean = false;
        for (let buildPipeline of deployPipelinesList) {
          if (buildPipeline.displayName?.indexOf('Deploy OCI JVM Container to OKE') !== -1) {
            foundJVMContainer = true;
            JVMContainerPipelineId = buildPipeline.id;
          } else if (buildPipeline.displayName?.indexOf('Deploy OCI Native Executable Container to OKE') !== -1)
            foundNativeExecutableContainer = true;
        }
        assert.ok(foundJVMContainer, 'Deploy pipeline `Deploy OCI JVM Container to OKE` not found');
        assert.ok(foundNativeExecutableContainer, 'Deploy OCI Native Executable Container to OKE');
      });

      // List deploy stages
      test('List deploy stages', async () => {
        assert.ok(provider !== undefined, 'Authentication failed');

        const stages = await ociUtils.listDeployStages(provider, JVMContainerPipelineId);
        assert.ok(stages.length > 0, 'No deploy pipeline stages found!');
      });

      // Start the build pipeline: Build OCI JVM Container
      let buildState: string | undefined;
      let deployPipeline: DeploymentPipelineNode;
      test('Start deploy pipeline', async () => {
        const nodeProvider: NodeProvider = await vscode.commands.executeCommand('oci.devops.nodeProvider');
        assert.ok(nodeProvider !== undefined, 'Node provider is not initialized!');

        const deployPipelines: DeploymentPipelineNode[] = nodeProvider.getChildren() as DeploymentPipelineNode[];
        assert.ok(deployPipelines.length > 0, 'No build pipelines found!');

        let buildPipelineIndex = -1;
        for (let i = 0; i < deployPipelines.length; ++i) {
          if (deployPipelines[i].label === 'Deploy OCI JVM Container to OKE') buildPipelineIndex = i;
        }
        assert.ok(buildPipelineIndex !== -1, 'Pipeline `Deploy OCI JVM Container to OKE` not found');

        deployPipeline = deployPipelines[buildPipelineIndex];
        assert.ok(deployPipeline);
        buildState = deployPipeline.contextValue;

        await vscode.commands.executeCommand('oci.devops.runDeployPipeline', deployPipeline);

        // wait for build pipeline to change states
        buildState = await helper.waitForContextChange(buildState, deployPipeline, 60 * 30);

        assert.ok(buildState !== undefined, 'Build timeout in switching to running state');
        assert.strictEqual(
          buildState,
          'oci.devops.deploymentPipelineNode-in-progress',
          'Build switched to unexpected state',
        );

        // wait for build to finish
        buildState = await helper.waitForContextChange(buildState, deployPipeline, 60 * 30);
        assert.ok(buildState !== undefined, 'Build timeout in switching to finishing state');
        assert.ok(
          buildState === 'oci.devops.deploymentPipelineNode-has-lastdeployment' ||
            buildState === 'oci.devops.deploymentPipelineNode-deployments-available',
          'Build switched to unexpected state',
        );
      }).timeout(1000 * 60 * 30);

      // List build runs (previous build should be present)
      test('List deploy runs', async () => {
        assert.ok(provider !== undefined, 'Authentication failed');

        const runs: any[] = await ociUtils.listDeployments(provider, JVMContainerPipelineId);
        assert.ok(runs.length > 0, 'No build runs');

        // Check latest run if succeeded
        assert.strictEqual(runs[0].lifecycleState, 'SUCCEEDED');
      });
    });

    suite('Create deploy pipeline', function () {
      test('subne ok', async () => {
        assert.ok(cluster);
        assert.ok(cluster.vcnId, 'vcnID is Undefined');
        subnet = await vcnUtils.selectNetwork(provider, cluster.vcnId);
        assert.ok(subnet, ' subnet is Undefined');
      }).timeout(1000 * 60 * 30);

      test('oke cluster', async () => {
        let deployEnvironments = await ociUtils.listDeployEnvironments(provider, project.id);

        let existingDeployEnvironments = deployEnvironments.filter((env) => {
          if (env.deployEnvironmentType === devops.models.OkeClusterDeployEnvironmentSummary.deployEnvironmentType) {
            assert.ok(cluster, 'Cluster is undefined');
            return (env as devops.models.OkeClusterDeployEnvironmentSummary).clusterId === cluster.id;
          }
          return;
        });

        assert.ok(cluster.id, 'Cluster Id is undefined');
        okeClusterEnvironment = existingDeployEnvironments?.length
          ? existingDeployEnvironments[0]
          : await ociUtils.createOkeDeployEnvironment(provider, project.id, project.name, cluster.id);
        assert.ok(okeClusterEnvironment, ' okeClusterEnvironment  Undefined');
      }).timeout(1000 * 60 * 30);

      test('oke cluster', async () => {
        const secretName = `${repositoryName.toLowerCase().replace(/[^0-9a-z]+/g, '-')}-vscode-generated-ocirsecret`;

        let repository: helper.Repository = {
          id: codeRepositoryId,
          name: repositoryName,
        };

        let ociResources: helper.OciResources = {
          image: image,
          secretName: secretName,
          cluster: cluster,
        };
        let okeConfig: helper.OkeConfig = await helper.setupCommandSpecArtifactAndDeployConfigArtifact(
          provider,
          project,
          repository,
          ociResources,
        );
        okeConfig.okeClusterEnvironment = okeClusterEnvironment;

        let projectInfo: helper.ProjectInfo = {
          project: project,
          projectFolder: projectFolder,
        };

        const auth = {
          provider: provider,
          compartmentID: COMPARTMENT_OCID,
        };
        let deployResources: helper.DeploymentResources = {
          auth: auth,
          okeConfig: okeConfig,
          pipeline: buildBipeline,
          projectInfo: projectInfo,
          repository: repository,
          subnet: subnet,
        };

        deployPipelineId = await helper.createJVMDeploymentPipeline(deployResources);
        assert.ok(deployPipelineId);
      }).timeout(1000 * 60 * 30);
    });

    suite('Clean', function () {
      this.timeout(50 * 60 * 1000);

      test('Undeploy project', async () => {
        await vscode.commands.executeCommand('oci.devops.undeployFromCloudSync');
        await new Promise((f) => setTimeout(f, 5000));
        let DevOpsProjects = await ociUtils.listDevOpsProjects(provider, comaprtmentOCID);
        for (let project of DevOpsProjects) {
          if (project.name === deploy_project_name) {
            assert.fail('Project not successfully undeployed');
          }
        }
      }).timeout(50 * 60 * 1000);
    });
  });
});
