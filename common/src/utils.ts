/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export function findExecutable(program: string, home: string): string | undefined {
    if (home) {
        let executablePath = path.join(home, 'bin', program);
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

export async function getJavaVersion(homeFolder: string): Promise<string | undefined> {
    return new Promise<string | undefined>(resolve => {
        if (homeFolder && fs.existsSync(homeFolder)) {
            const executable: string | undefined = findExecutable('java', homeFolder);
            if (executable) {
                cp.execFile(executable, ['-version'], { encoding: 'utf8' }, (_error, _stdout, stderr) => {
                    if (stderr) {
                        let javaVersion: string | undefined;
                        let graalVMInfo: string | undefined;
                        let javaVMInfo: string | undefined;
                        stderr.split('\n').forEach((line: string) => {
							const javaInfo: string[] | null = line.match(/version\s+"(\S+)"/);
							const gvmInfo = line.match(/(GraalVM.*)\s+\(/);
							const jvmInfo = line.match(/^(.*)\s+Runtime Environment/);
							if (javaInfo && javaInfo.length > 1) {
								javaVersion = javaInfo[1];
							}
							if (gvmInfo && gvmInfo.length > 1) {
								graalVMInfo = gvmInfo[1];
							}
							if (jvmInfo && jvmInfo.length > 1) {
								javaVMInfo = jvmInfo[1];
							}
                        });
                        if (javaVersion && (javaVMInfo || graalVMInfo)) {
							let majorVersion = javaVersion;
                            if (majorVersion.startsWith('1.')) {
                                majorVersion = majorVersion.slice(2);
                            }
                            let i = majorVersion.indexOf('.');
                            if (i > -1) {
                                majorVersion = majorVersion.slice(0, i);
                            }
                            resolve(graalVMInfo ? `${graalVMInfo}, Java ${majorVersion}` : `${javaVMInfo} ${javaVersion}, Java ${majorVersion}`);
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
	const javaRuntimes = vscode.workspace.getConfiguration('java').get('configuration.runtimes') as any[];
	if (javaRuntimes) {
		for (const runtime of javaRuntimes) {
			if (runtime && typeof runtime === 'object' && runtime.path && runtime.default) {
				return runtime.path;
			}
		}
	}
	javaHome = vscode.workspace.getConfiguration('java').get('home') as string;
	if (javaHome) {
		return javaHome;
	}
	javaHome = process.env['JAVA_HOME'] as string;
	return javaHome;
}

export async function micronautProjectExists(): Promise<boolean> {
	return (await vscode.workspace.findFiles('**/micronaut-cli.yml', '**/node_modules/**')).length > 0;
}