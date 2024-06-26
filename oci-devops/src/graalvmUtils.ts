/*
 * Copyright (c) 2022, 2024, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

// NOTE: should be updated whenever the defaults change
// TODO: could this be automated somehow based on the GitHub/GDS catalogs?
export const DEFAULT_JAVA_VERSION = '21';
export const DEFAULT_GRAALVM_VERSION = '23';

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
