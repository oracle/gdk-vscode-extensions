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

export function getGVMDownloadParameters(versions: string[]): { name: string, value: string }[] | undefined {
    const javaVersion = versions[0];

    const graalVMVersion = getGraalVMVersion(versions[1]);
    if (!graalVMVersion) {
        return undefined;
    }

    const parameters: { name: string, value: string }[] = [];

    if (graalVMVersion[0] === 'CE') {
        // --- GraalVM CE ---
        // TODO: handle devbuilds (graalVMVersion[2] === '-dev')
        const graalvmDownloadKey = 'GRAALVM_DOWNLOAD_ADDRESS';
        const graalVMArch = 'linux-amd64';
        const graalvmDownloadAddress = `https://github.com/graalvm/graalvm-ce-builds/releases/download/vm-${graalVMVersion[1]}/graalvm-ce-java${javaVersion}-${graalVMArch}-${graalVMVersion[1]}.tar.gz`;
        parameters.push({ name: graalvmDownloadKey, value: graalvmDownloadAddress });
    } else {
        // --- GraalVM EE ---
        // TODO: provide GRAALVM_ARTIFACT_ID instead of GRAALVM_DOWNLOAD_ADDRESS!
        // TODO: add GRAALVM_DOWNLOAD_TOKEN parameter to download EE!
    }

    return parameters;
}

function getGraalVMVersion(versionString: string): string[] | undefined {
    const versionStrings = versionString.split(' ');
    if (versionStrings.length !== 3) {
        return undefined;
    }
    if (versionStrings[0] !== 'GraalVM') {
        return undefined;
    }
    // let version = versionStrings[2].slice(0, versionStrings[2].length - 1);
    let version = versionStrings[2];
    const dev = version.endsWith('-dev') ? '-dev' : '';
    if (dev) {
        version = version.slice(0, version.length - '-dev'.length);
    }
    if (versionStrings[1] === 'CE') {
        return [ 'CE', version, dev ];
    }
    if (versionStrings[1] === 'EE') {
        return [ 'EE', version, dev ];
    }
    return undefined;
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