/*
 * Copyright (c) 2022, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as cp from 'child_process';
import * as vscode from 'vscode';


export async function getActiveGVMVersion(): Promise<string[] | undefined> {
    const gvm = getActiveGVM();
    if (!gvm) {
        return undefined;
    }
    return getGraalVMVersions(gvm);
}

export function getGVMBuildRunParameters(versions: string[]): { name: string, value: string }[] | undefined {
    const parameters: { name: string, value: string }[] = [];
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

function findExecutable(executable: string, graalVMHome: string): string | undefined {
	if (graalVMHome) {
        let executablePath = path.join(graalVMHome, 'bin', executable);
        if (process.platform === 'win32') {
            if (fs.existsSync(executablePath + '.cmd')) {
                return executablePath + '.cmd';
            }
            if (fs.existsSync(executablePath + '.exe')) {
                return executablePath + '.exe';
            }
        } else if (fs.existsSync(executablePath)) {
            return executablePath;
        }
    }
    return undefined;
}

function getActiveGVM(): string | undefined {
    const gvm = vscode.workspace.getConfiguration('graalvm').get('home');
    return gvm ? gvm as string : undefined;
}

async function getGraalVMVersions(homeFolder: string): Promise<string[] | undefined> {
    return new Promise<string[] | undefined>(resolve => {
        if (homeFolder && fs.existsSync(homeFolder)) {
            const executable: string | undefined = findExecutable('java', homeFolder);
            if (executable) {
                cp.execFile(executable, ['-version'], { encoding: 'utf8' }, (_error, _stdout, stderr) => {
                    if (stderr) {
                        let javaVersion: string | undefined;
                        let graalVMVersion: string | undefined;
                        stderr.split('\n').forEach((line: string) => {
							const javaInfo: string[] | null = line.match(/version\s+"(\S+)"/);
							const vmInfo = line.match(/(GraalVM.*)\s+\(/);
							if (javaInfo && javaInfo.length > 1) {
								javaVersion = javaInfo[1];
							}
							if (vmInfo && vmInfo.length > 1) {
								graalVMVersion = vmInfo[1];
							}
                        });
                        if (javaVersion && graalVMVersion) {
                            if (javaVersion.startsWith('1.')) {
                                javaVersion = javaVersion.slice(2);
                            }
                            let i = javaVersion.indexOf('.');
                            if (i > -1) {
                                javaVersion = javaVersion.slice(0, i);
                            }
                            const versionStrings = graalVMVersion.split(' ')
                            if (versionStrings.length !== 3) {
                                resolve(undefined);
                            }
                            if (versionStrings[0] !== 'GraalVM') {
                                resolve(undefined);
                            }
                            graalVMVersion = versionStrings[2];
                            i = graalVMVersion.indexOf('.');
                            if (i > -1) {
                                graalVMVersion = graalVMVersion.slice(0, i);
                            }
                            resolve([ javaVersion, graalVMVersion ]);
                        } else {
                            resolve(undefined);
                        }
                    } else {
                        resolve(undefined);
                    }
                });
            } else {
                resolve(undefined);
            }
        } else {
            resolve(undefined);
        }
    });
}

export function getJavaHome(): string {
	let javaHome: string = vscode.workspace.getConfiguration('graalvm').get('home') as string;
	if (javaHome) {
		return javaHome;
	}
	javaHome = process.env['GRAALVM_HOME'] as string;
	if (javaHome) {
		return javaHome;
	}
	javaHome = vscode.workspace.getConfiguration('java').get('home') as string;
	if (javaHome) {
		return javaHome;
	}
	javaHome = process.env['JAVA_HOME'] as string;
	return javaHome;
}

export function normalizeJavaVersion(version: string | undefined, supportedVersions: string[]): string {
    if (!version) {
        return '8';
    }
    if (!supportedVersions || supportedVersions.length == 0) {
        return version;
    }
    let versionN = parseInt(version);
    for (let supportedVersion of supportedVersions.reverse()) {
        const supportedN = parseInt(supportedVersion);
        if (versionN >= supportedN) {
            return supportedVersion;
        }
    }
    return '8';
}

