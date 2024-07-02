/*
 * Copyright (c) 2022, 2024, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

// NOTE: should be updated whenever the defaults change
// TODO: could this be automated somehow based on the GitHub/GDS catalogs?

import * as vscode from 'vscode';
import * as projectUtils from './projectUtils';

let DEFAULT_GRAALVM_VERSION = '23';
let DEFAULT_JAVA_VERSION = '21';
let DOCKER_TAG_INPUT = 'latest';
let RAW_USER_INPUT: { name: string; value: string }[] = [];
const regex = /^[a-zA-Z][a-zA-Z0-9_]*=[a-zA-Z0-9][a-zA-Z0-9_]*$/;

export function getBuildRunGVMVersion(requiredGVMVersions?: string[]): string[] {
  const requiredJavaVersion = requiredGVMVersions?.[0];
  const javaVersion = requiredJavaVersion ? requiredJavaVersion : DEFAULT_JAVA_VERSION;
  
  const requiredGraalVMVersion = requiredGVMVersions?.[1];
  let graalVMVersion;
  if (requiredGraalVMVersion) {
      if (requiredGraalVMVersion.endsWith('.0.0-dev')) { // stable version not available yet for the remote yum
          graalVMVersion = DEFAULT_GRAALVM_VERSION; // TODO: should use previous stable GraalVM version (major--)?
      } else {
          const i = requiredGraalVMVersion.indexOf('.');
          graalVMVersion = i === -1 ? requiredGraalVMVersion : requiredGraalVMVersion.slice(0, i);
      }
  } else {
      graalVMVersion = DEFAULT_GRAALVM_VERSION;
  }
  
  return [javaVersion, graalVMVersion];
}

export function getGVMBuildRunParameters(versions: string[]): { name: string; value: string }[] | undefined {
  const parameters: { name: string; value: string }[] = [];
  if (versions.length === 2) {
      const javaVersion = versions[0];
      if (javaVersion) {
          const javaVersionKey = 'JAVA_VERSION';
          parameters.push({ name: javaVersionKey, value: javaVersion });
      }

      const graalVMVersion = versions[1];
      if (graalVMVersion) {
          const graalVMVersionKey = 'GRAALVM_VERSION';
          parameters.push({ name: graalVMVersionKey, value: graalVMVersion });
      }

      if (graalVMVersion === '22') {
          // Set USE_NATIVE_IMAGE_JAVA_PLATFORM_MODULE_SYSTEM=false only for GraalVM 22.2.0 Native image builds, due to bug in NI
          const useNIJavaPlatformModuleSystemKey = 'USE_NATIVE_IMAGE_JAVA_PLATFORM_MODULE_SYSTEM';
          parameters.push({ name: useNIJavaPlatformModuleSystemKey, value: 'false' });
      }
  }
  return parameters;
}

export function parseBuildPipelineUserInput(input: string): { name: string; value: string }[] {
    if (/\s{2,}$/.test(input)) {
      return [];
    }
    const pairs = input.split(/,\s?/).filter(pair => pair !== '');
    
    RAW_USER_INPUT = pairs.map(pair => {
      const [name, value] = pair.split('=');
      return { name: name.trim(), value: value ? value.trim() : '' };
    });
    const params: { name: string; value: string }[] = [];
    let hasGraalvmVersion = false;
    let hasJavaVersion = false;
    let hasDockerTagValue = false;

    if (pairs.length === 0) {
      return [];
    }
    for (const pair of pairs) {
      if (/\s{2,}$/.test(pair)) {
        return [];
      }
      if (!regex.test(pair.trim())) {
        return [];
      }
      const [name, value] = pair.split('=');
      const trimmedName = name.trim();
      const trimmedValue = value ? value.trim() : '';

      if (trimmedName === 'DOCKER_TAG') {
        params.push({ name: 'DOCKER_TAG_INPUT', value: trimmedValue });
        hasDockerTagValue = true;
      } else {
        params.push({ name: trimmedName, value: trimmedValue });
        if (trimmedName === 'GRAALVM_VERSION') {
          hasGraalvmVersion = true;
        }
        if (trimmedName === 'JAVA_VERSION') {
          hasJavaVersion = true;
        }
      }
    }

    if (!hasGraalvmVersion) {
      params.push({ name: 'GRAALVM_VERSION', value: DEFAULT_GRAALVM_VERSION });
    }
    if (!hasJavaVersion) {
      params.push({ name: 'JAVA_VERSION', value: DEFAULT_JAVA_VERSION });
    }
    if (!hasDockerTagValue) {
      params.push({ name: 'DOCKER_TAG', value: DOCKER_TAG_INPUT });
    }

    return params;
}

export async function handleVersionWarning(params: { name: string; value: string }[], folder: vscode.WorkspaceFolder | undefined): Promise<{ name: string; value: string }[]> {
  if (!folder) {
    return params;
  }

  const javaVersionParam = params.find(p => p.name === 'JAVA_VERSION');
  const graalvmVersionParam = params.find(p => p.name === 'GRAALVM_VERSION');

  if (!javaVersionParam &&!graalvmVersionParam) {
    return params;
  }

  let requiredGraalvmVersion = await vscode.window.withProgress({
    location: { viewId: 'oci-devops' }
  }, (_progress, _token) => {
    return projectUtils.getProjectRequiredJavaVersion(folder);
  });

  if (requiredGraalvmVersion) {
    requiredGraalvmVersion = '23';
  }

  const requiredJavaVersion = await vscode.window.withProgress({
    location: { viewId: 'oci-devops' }
  }, (_progress, _token) => {
    return projectUtils.getProjectRequiredJavaVersion(folder);
  });

  const versionToCheck = requiredJavaVersion || DEFAULT_JAVA_VERSION;
  const targetGvmVersion = getBuildRunGVMVersion([versionToCheck, '']);
  const updatedParams = getGVMBuildRunParameters(targetGvmVersion);

  if (!updatedParams) {
    return params;
  }

  const updatedGraalvmVersionParam = updatedParams.find(p => p.name === 'GRAALVM_VERSION');
  const updatedJavaVersionParam = updatedParams.find(p => p.name === 'JAVA_VERSION');

  let updateParams = params;

  if (updatedGraalvmVersionParam && updatedGraalvmVersionParam.value!== graalvmVersionParam?.value) {
    const graalvmSelection = await vscode.window.showWarningMessage(
      `The ${requiredGraalvmVersion? 'required' : 'default'} GRAALVM_VERSION (${updatedGraalvmVersionParam.value}) is different from the current version (${graalvmVersionParam?.value}). This may affect the build pipeline.`,
      'Do Not Modify GRAALVM_VERSION',
      'Run Anyway'
    );

    if (graalvmSelection === undefined) {
      return [];
    }

    if (graalvmSelection === 'Do Not Modify GRAALVM_VERSION') {
      updateParams = updateParams.map(p => p.name === 'GRAALVM_VERSION'? {...p, value: updatedGraalvmVersionParam.value } : p);
    }
  }

  if (updatedJavaVersionParam && updatedJavaVersionParam.value!== javaVersionParam?.value) {
    const javaSelection = await vscode.window.showWarningMessage(
      `The ${requiredJavaVersion? 'required' : 'default'} JAVA_VERSION (${updatedJavaVersionParam.value}) is different from the current version (${javaVersionParam?.value}). This may affect the build pipeline.`,
      'Do Not Modify JAVA_VERSION',
      'Run Anyway'
    );

    if (javaSelection === undefined) {
      return [];
    }

    if (javaSelection === 'Do Not Modify JAVA_VERSION') {
      updateParams = updateParams.map(p => p.name === 'JAVA_VERSION'? {...p, value: updatedJavaVersionParam.value } : p);
    }
  }

  return updateParams;
}

export function parseDeployPipelineUserInput(input: string): { name: string; value: string }[] {
    const pairs = input.split(/,\s?/).filter(pair => pair.trim() !== '');
    const params: { name: string; value: string }[] = [];
    let hasDockerTagValue = false;
  
    if (pairs.length === 0) {
      return [];
    }
  
    for (const pair of pairs) {
      if (!regex.test(pair)) {
        return [];
      }
  
      const [name, value] = pair.split('=');
      const trimmedName = name.trim();
      const trimmedValue = value ? value.trim() : '';
  
      if (trimmedName === 'DOCKER_TAG') {
        params.push({ name: trimmedName, value: trimmedValue });
        hasDockerTagValue = true;
      } else {
        params.push({ name: trimmedName, value: trimmedValue });
      }
    }
  
    if (!hasDockerTagValue) {
      params.push({ name: 'DOCKER_TAG', value: DOCKER_TAG_INPUT });
    }
  
    return params;
  }


export { DEFAULT_GRAALVM_VERSION, DEFAULT_JAVA_VERSION, DOCKER_TAG_INPUT, RAW_USER_INPUT};