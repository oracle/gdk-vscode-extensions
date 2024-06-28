/*
 * Copyright (c) 2022, 2024, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

// NOTE: should be updated whenever the defaults change
// TODO: could this be automated somehow based on the GitHub/GDS catalogs?

import * as vscode from 'vscode';
import { LAST_USER_INPUT } from './oci/buildServices';

let DEFAULT_GRAALVM_VERSION = '23';
let DEFAULT_JAVA_VERSION = '21';
let DOCKER_TAG_INPUT = 'latest';
const regex = /^[a-zA-Z0-9_]+=?[a-zA-Z0-9_]*$/;

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
    const pairs = input.split(/,\s?/);
    const params: { name: string; value: string }[] = [];
    let hasGraalvmVersion = false;
    let hasJavaVersion = false;
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
        const trimmedValue = value.trim();

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

export async function handleJavaVersionWarning(params: { name: string; value: string }[]): Promise<{ name: string; value: string }[]> {
  const javaVersionParam = params.find(p => p.name === 'JAVA_VERSION');
  if (javaVersionParam) {
    const lastJavaVersion = getLastJavaVersionFromInput(LAST_USER_INPUT);
    if (lastJavaVersion === undefined) {
      if (javaVersionParam.value !== DEFAULT_JAVA_VERSION) {
        const selection = await vscode.window.showWarningMessage(
          'JAVA_VERSION has been modified. This may affect the build pipeline.',
          'Do Not Modify JAVA_VERSION',
          'Run Anyway'
        );
        if (selection === undefined) {
          return [];
        }
        if (selection === 'Do Not Modify JAVA_VERSION') {
          javaVersionParam.value = DEFAULT_JAVA_VERSION;
        }
      }
    } else if (javaVersionParam.value !== lastJavaVersion) {
      const selection = await vscode.window.showWarningMessage(
        'JAVA_VERSION has been modified. This may affect the build pipeline.',
        'Do Not Modify JAVA_VERSION',
        'Run Anyway'
      );
      if (selection === undefined) {
        return [];
      }
      if (selection === 'Do Not Modify JAVA_VERSION') {
        javaVersionParam.value = lastJavaVersion;
      }
    }
  }
  return params;
}

function getLastJavaVersionFromInput(input: string): string | undefined {
  const keyValuePairs = input.split('&');
  for (const pair of keyValuePairs) {
    const [key, value] = pair.split('=');
    if (key === 'JAVA_VERSION') {
      return value;
    }
  }
  return undefined;
}

export function parseDeployPipelineUserInput(input: string): { name: string; value: string }[] {
    const pairs = input.split(/,\s?/);
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


export { DEFAULT_GRAALVM_VERSION, DEFAULT_JAVA_VERSION, DOCKER_TAG_INPUT};