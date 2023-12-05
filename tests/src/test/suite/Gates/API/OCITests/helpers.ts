import * as assert from 'assert';
import * as vscode from 'vscode';
import { containerengine, devops } from 'oci-sdk';
import * as projectUtils from '../../../../../../../oci-devops/out/projectUtils';
import * as ociUtils from '../../../../../../../oci-devops/out/oci/ociUtils';
import * as deployUtils from '../../../../../../../oci-devops/out/oci/deployUtils';
import * as path from 'path';
import { ChangeableNode } from '../../../../../../../oci-devops/out/nodes';
import * as fs from 'fs';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

export function serverResponse(randomNumber: string): string {
  return `Server response is ${randomNumber}`;
}

export function createController(directoryName: string, controllerPath: string, randomNumber: string): boolean {
  const fileName = 'HelloController.java';
  const filePath = path.join(directoryName, controllerPath, fileName);
  const fileContent = `
  package com.example;

  import io.micronaut.http.MediaType;
  import io.micronaut.http.annotation.Controller;
  import io.micronaut.http.annotation.Get;
  import io.micronaut.http.annotation.Produces;
  
  @Controller("/test${randomNumber}") 
  public class HelloController {
      @Get 
      @Produces(MediaType.TEXT_PLAIN) 
      public String index() {
        return "${serverResponse(randomNumber)}"; 
      }
  }
  `;

  let value = true;
  try {
    fs.writeFileSync(filePath, fileContent);
  } catch (e: any) {
    value = false;
    console.log('Cannot create a controller:' + e.message);
  }
  return value;
}

export async function functionAskServer(randomNumber: string, port: number): Promise<string> {
  return (await axios.get(`http://localhost:${port}/test${randomNumber}`)).data;
}

export function generateUID(): string {
  const fullUUID = uuidv4();
  const shortUUID = fullUUID.substr(0, 8);
  return shortUUID;
}

export function getProfile(profiles: string[]): string {
  if (profiles.length === 1) return profiles[0];
  else if (profiles.indexOf('TESTS') !== -1) return 'TESTS';
  else if (profiles.indexOf('DEFAULT') !== -1) return 'DEFAULT';
  else {
    return '';
  }
}

/**
 * Waits for the pipeline context to swtich from an old state
 * @param oldValue
 * @param buildPipeline
 * @param timeout
 * @returns
 */
export async function waitForContextChange(
  oldValue: string | undefined,
  buildPipeline: ChangeableNode,
  timeout: number,
): Promise<string | undefined> {
  while (--timeout) {
    if (buildPipeline.contextValue !== oldValue) {
      return buildPipeline.contextValue;
    } else {
      await new Promise((f) => setTimeout(f, 1000));
    }
  }
  return undefined;
}

export async function waitForStatup(wf?: vscode.WorkspaceFolder): Promise<void> {
  if (!wf) {
    return;
  }
  let wf2 = wf;
  let counter = 0;
  let p: Promise<void> = new Promise(async (resolve, reject) => {
    async function dowait() {
      try {
        await vscode.commands.executeCommand('nbls.project.info', wf2.uri.toString(), { projectStructure: true });
        resolve();
      } catch (e) {
        if (counter < 60) {
          counter++;
          console.log(`Still waiting for NBLS start, ${counter} seconds elapsed.`);
          setTimeout(dowait, 1000);
          return;
        } else {
          reject(e);
        }
      }
    }
    setTimeout(dowait, 1000);
  });
  return p;
}

export type DeploymentResources = {
  auth: AuthCredentials;
  projectInfo: ProjectInfo;
  pipeline: devops.models.BuildPipelineSummary;
  repository: Repository;
  subnet: Subnet;
  okeConfig: OkeConfig;
};

export type AuthCredentials = {
  provider: any;
  compartmentID: string;
};

export type ProjectInfo = {
  project: devops.models.Project;
  projectFolder: projectUtils.ProjectFolder;
};

export type OciResources = {
  cluster?: containerengine.models.Cluster;
  secretName: string;
  image: string;
};

export type Repository = {
  id: string;
  name: string;
};

export type Subnet = {
  id: string;
  compartmentID: string;
};

export type OkeConfig = {
  okeClusterEnvironment?: devops.models.DeployEnvironmentSummary;
  setupCommandSpecArtifact: string;
  deployConfigArtifact: string;
};

export async function setupCommandSpecArtifactAndDeployConfigArtifact(
  provider: any,
  project: devops.models.Project,
  repository: Repository,
  ociResources: OciResources,
): Promise<OkeConfig> {
  return await vscode.window.withProgress(
    {
      title: 'Setup CommandSpecArtifact and DeployConfigArtifact',
      location: vscode.ProgressLocation.Notification,
      cancellable: false,
    },
    (_progress, _token) => {
      return new Promise(async (resolve) => {
        const deployArtifacts = await ociUtils.listDeployArtifacts(provider, project.id);
        assert.ok(deployArtifacts.length > 0, ' Deployment Artifacts Not Found - Line 245');

        let setupCommandSpecArtifact = deployArtifacts?.find((env) => {
          assert.ok(ociResources.cluster, 'Cluster is Not Found - Line 248');
          return (
            env.deployArtifactType === devops.models.DeployArtifact.DeployArtifactType.CommandSpec &&
            env.freeformTags?.devops_tooling_oke_cluster === ociResources.cluster.id
          );
        })?.id;

        let extensionPath = vscode.extensions.getExtension('oracle-labs-graalvm.oci-devops')?.extensionPath;
        assert.ok(extensionPath, 'Extension Path Not Found - Line 253');
        let RESOURCES_FOLDER = path.join(extensionPath, 'resources', 'oci');

        if (!setupCommandSpecArtifact) {
          let repoEndpoint = `${provider.getRegion().regionCode}.ocir.io`;
          assert.ok(ociResources.cluster && ociResources.cluster.id, 'Cluster with given Id not Found - Line 259');
          const inlineContent = deployUtils.expandTemplate(RESOURCES_FOLDER, 'oke_docker_secret_setup.yaml', {
            repo_endpoint: repoEndpoint,
            region: provider.getRegion().regionId,
            cluster_id: ociResources.cluster.id,
            secret_name: ociResources.secretName,
          });
          assert.ok(inlineContent, 'setupCommandSpecArtifact: inline Content is undefined - line 266');
          const artifactName = `${repository.name}_oke_deploy_docker_secret_setup_command`;
          const artifactDescription = `OKE deployment docker secret setup command specification artifact for devops project ${project} & repository ${repository.name}`;
          const okeDeploySetupCommandArtifact = (
            await ociUtils.createOkeDeploySetupCommandArtifact(
              provider,
              project.id,
              inlineContent,
              artifactName,
              artifactDescription,
              {
                devops_tooling_oke_cluster: ociResources.cluster.id,
              },
            )
          ).id;
          assert.ok(
            okeDeploySetupCommandArtifact !== '',
            'setupCommandSpecArtifact: okeDeploySetupCommandArtifact Error - Line 272',
          );

          setupCommandSpecArtifact = okeDeploySetupCommandArtifact;
        }

        let deployConfigArtifact = deployArtifacts?.find((env) => {
          return (
            env.deployArtifactType === devops.models.DeployArtifact.DeployArtifactType.KubernetesManifest &&
            env.freeformTags?.devops_tooling_image_name === ociResources.image
          );
        })?.id;

        if (!deployConfigArtifact) {
          let inlineContent = deployUtils.expandTemplate(RESOURCES_FOLDER, 'oke_deploy_config.yaml', {
            image_name: ociResources.image,
            app_name: repository.name.toLowerCase().replace(/[^0-9a-z]+/g, '-'),
            secret_name: ociResources.secretName,
          });

          assert.ok(inlineContent, 'deployConfigArtifact: inline Content is undefined - Line 290');
          const jvm = ociResources.image.endsWith('-jvm:${DOCKER_TAG}');
          const artifactName = `${repository.name}_oke_deploy_${jvm ? 'jvm' : 'ni'}_configuration`;
          const artifactDescription = `OKE ${
            jvm ? 'jvm' : 'native'
          } deployment configuration artifact for devops project ${project.name} & repository ${repository.name}`;
          const artifact = (
            await ociUtils.createOkeDeployConfigurationArtifact(
              provider,
              project.id,
              inlineContent,
              artifactName,
              artifactDescription,
              {
                devops_tooling_codeRepoID: repository.id,
                devops_tooling_image_name: ociResources.image,
              },
            )
          ).id;
          assert.ok(artifact !== '', 'deployConfigArtifact: okeDeploySetupCommandArtifact Error - Line 298');

          deployConfigArtifact = artifact;
        }
        let okeConfig: OkeConfig = {
          okeClusterEnvironment: undefined,
          setupCommandSpecArtifact,
          deployConfigArtifact,
        };
        resolve(okeConfig);
      });
    },
  );
}

export async function createJVMDeploymentPipeline(deploy: DeploymentResources): Promise<string> {
  return await vscode.window.withProgress(
    {
      title: 'Start creating Deployment Pipeline...',
      location: vscode.ProgressLocation.Notification,
      cancellable: false,
    },
    (_progress, _token) => {
      return new Promise(async (resolve) => {
        const codeRepoPrefix = deploy.pipeline.freeformTags?.devops_tooling_codeRepoPrefix || '';
        const displayNamePrefix = codeRepoPrefix + 'Build ';
        const displayName = deploy.pipeline.displayName?.startsWith(displayNamePrefix)
          ? deploy.pipeline.displayName.slice(displayNamePrefix.length)
          : `${deploy.projectInfo.projectFolder.projectType === 'GCN' ? ' OCI ' : ' '}Container`;
        const deployPipelineName = `Deploy ${displayName} to OKE`;
        const descriptionPrefix = 'Build pipeline to build ';
        const descriptionPart = deploy.pipeline.description?.startsWith(descriptionPrefix)
          ? deploy.pipeline.description.slice(descriptionPrefix.length)
          : `container for ${deploy.projectInfo.projectFolder.projectType === 'GCN' ? 'OCI & ' : ''}devops project ${
              deploy.projectInfo.project.name
            } & repository ${deploy.repository.name}`;
        const deployPipelineDescription = `Deployment pipeline to deploy ${descriptionPart} to OKE`;
        const tags: { [key: string]: string } = {
          devops_tooling_codeRepoID: deploy.repository.id,
          devops_tooling_buildPipelineOCID: deploy.pipeline.id,
          devops_tooling_okeDeploymentName: deploy.repository.name.toLowerCase().replace(/[^0-9a-z]+/g, '-'),
        };
        if (codeRepoPrefix.length) {
          tags.devops_tooling_codeRepoPrefix = codeRepoPrefix;
        }

        assert.ok(deploy.subnet, 'Subnet Not Exist at all - Line 400');
        try {
          await ociUtils.updateCompartmentAccessPolicies(
            deploy.auth.provider,
            deploy.auth.compartmentID,
            deploy.auth.compartmentID,
            deploy.subnet.compartmentID,
          );
        } catch (error) {
          console.warn('Policies: ', error);
        }

        let deployPipeline;
        try {
          deployPipeline = await ociUtils.createDeployPipeline(
            deploy.auth.provider,
            deploy.projectInfo.project.id,
            `${codeRepoPrefix}${deployPipelineName}`,
            deployPipelineDescription,
            [
              {
                name: 'DOCKER_TAG',
                defaultValue: 'latest',
              },
            ],
            tags,
          );
        } catch (error) {
          console.warn('Deployment Pipeline: ', error);
        }

        assert.ok(deployPipeline, 'deployPipeline Not Found - Line 418');

        let setupSecretStage;
        try {
          setupSecretStage = await ociUtils.createSetupKubernetesDockerSecretStage(
            deploy.auth.provider,
            deployPipeline.id,
            deploy.okeConfig.setupCommandSpecArtifact,
            deploy.subnet.id,
          );
        } catch (error) {
          console.warn('setupSecretStage: ', error);
        }

        assert.ok(setupSecretStage, 'setupSecretStage Not Found - Line 427');
        assert.ok(deploy.okeConfig.okeClusterEnvironment, 'Oke Cluster Environment Error - Line 428');
        let deployStage = await ociUtils.createDeployToOkeStage(
          'pipeline',
          deploy.auth.provider,
          deployPipeline.id,
          setupSecretStage.id,
          deploy.okeConfig.okeClusterEnvironment.id,
          deploy.okeConfig.deployConfigArtifact,
        );
        assert.ok(deployStage, 'deployStage Not Exist at all - Line 430');

        let deployPipelines = await ociUtils.listDeployPipelines(deploy.auth.provider, deploy.projectInfo.project.id);
        assert.ok(deployPipelines.length > 0, 'Deployment pipelines not created - Line 433');

        resolve(deployPipelines[0].id);
      });
    },
  );
}
