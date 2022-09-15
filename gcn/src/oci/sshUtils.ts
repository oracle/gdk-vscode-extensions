/*
 * Copyright (c) 2022, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as which from 'which';
import * as common from 'oci-common';
import * as ociUtils from './ociUtils';


let sshKeyInitInProgress = false;
export async function initializeSshKeys() {
    if (!sshKeyInitInProgress) {
        sshKeyInitInProgress = true;
        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Initializing SSH keys',
                cancellable: false
            }, (progress, _token) => {
                return new Promise<void>(async resolve => {
                    const defaultConfigLocation = path.join(os.homedir(), '.ssh', 'config');
                    const fileExists = fs.existsSync(defaultConfigLocation);
                    if (fileExists) {
                        const content = fs.readFileSync(defaultConfigLocation);
                        if (/^Host devops.scmservice.*.oci.oraclecloud.com/mi.test(content.toString())) {
                            progress.report({ message: 'Done.', increment: 100 });
                            resolve();
                            return;
                        }
                    }
                    let userName: string | undefined;
                    let tenancyName: string | undefined;
                    let identityFile: string | null | undefined;
                    try {
                        const provider = new common.ConfigFileAuthenticationDetailsProvider();
                        userName = (await ociUtils.getUser(provider)).name;
                        tenancyName = (await ociUtils.getTenancy(provider)).name;
                        identityFile = common.ConfigFileReader.parseDefault(null).get('key_file');
                    } catch (err) {
                        vscode.window.showErrorMessage(`Failed to read OCI configuration${(err as any).message ? ': ' + (err as any).message : ''}.`);
                        resolve();
                        return;
                    }
                    const uri = fileExists ? vscode.Uri.file(defaultConfigLocation) : vscode.Uri.parse('untitled:' + defaultConfigLocation);
                    const editor = await vscode.window.showTextDocument(uri);
                    if (userName && tenancyName && identityFile) {
                        const text = `Host devops.scmservice.*.oci.oraclecloud.com\n   User ${userName}@${tenancyName}\n   IdentityFile ${identityFile}\n\n`; 
                        editor.edit(editBuilder => editBuilder.replace(new vscode.Position(0, 0), text));
                    } else {
                        const snippet = new vscode.SnippetString('Host devops.scmservice.*.oci.oraclecloud.com\n');
                        if (userName && tenancyName) {
                            snippet.appendText(`   User ${userName}@${tenancyName}\n`);
                        } else {
                            snippet.appendPlaceholder('   User <USER_NAME>@<TENANCY_NAME>\n');
                        }
                        if (identityFile) {
                            snippet.appendText(`   IdentityFile ${identityFile}\n\n`)
                        } else {
                            snippet.appendPlaceholder('   IdentityFile <PATH_TO_PEM_FILE>\n\n')
                        }
                        editor.insertSnippet(snippet, new vscode.Position(0, 0));
                    }
                    progress.report({ message: 'Done.', increment: 100 });
                    resolve();
                });
            });
        } finally {
            sshKeyInitInProgress = false;
        }
    }
}

export async function sshUtilitiesPresent() : Promise<boolean> {
    try {
        let keygen = await which("ssh-keygen");
        let keyscan = await which("ssh-keyscan");
        return (!!keygen) && (!!keyscan);
    } catch (e) {
        return false;
    }
}

function outputOf(command : string, stdin? : string) : Promise<string> {
    return new Promise((resolve, reject) => {
        const child = cp.exec(command, (error, stdout, stderr) => {
            if (error) {
                reject(error);
            } else {
                resolve(stdout ? stdout : stderr);
            }
        });
        if (stdin) {
            child.stdin?.write(stdin);
            child.stdin?.end();
        }
    });
}

export async function addCloudKnownHosts(hostname : string, ask : boolean) : Promise<number> {
    if (!await sshUtilitiesPresent()) {
        return -1;
    }
    const hostsLocation = path.join(os.homedir(), '.ssh', 'known_hosts');
    if (fs.existsSync(hostsLocation)) {
        try {
            // attemp to find host's key in the known_hosts file
            await outputOf(`ssh-keygen -f ${hostsLocation} -F ${hostname}`);
            return 1;
        } catch(e) {}
    }
    let keys;
    const cmdString = `ssh-keyscan ${hostname}`;
    try {
        keys = (await outputOf(cmdString)).split(os.EOL).filter(s => s.startsWith(hostname));
    } catch (e) {
        let msg = (e as any)?.message as string || "Unknown failure";
        let i = msg.indexOf(cmdString);
        if (i >= 0) {
            msg = msg.substring(i + cmdString.length + 1).trim();
        }
        vscode.window.showErrorMessage(`Fetching SSH host key for ${hostname} failed: ${msg}`);
        return 0;
    }
    if (keys.length == 0) {
        vscode.window.showWarningMessage(`Could not automatically obtain SSH host key for ${hostname}.`);
        return 0;
    }
    const hostLine = keys[0] + os.EOL;
    if (ask) {
        try {
            const out = await outputOf('ssh-keygen -l -f -', hostLine);
            const parts = out.split(' ');
            let fprint = parts.length >= 3 ? parts[1] : out;
            let ack = await vscode.window.showInformationMessage(`The host ${hostname} has fingerprint: ${fprint}\nDo you allow to add it to known hosts file ? 
                Various repository operations may fail if the host is not confirmed as trusted.`, "Yes", "No");
            if (ack !== "Yes") {
                return 0;
            }
        } catch(e) {
            vscode.window.showWarningMessage(`Could not automatically obtain SSH host key for ${hostname}.`);
            return 0;
        }
    }
    fs.appendFileSync(hostsLocation, hostLine);
    return 1;
}

export async function addAutoAcceptHostFingerprintForCloud() : Promise<boolean> {
    const defaultConfigLocation = path.join(os.homedir(), '.ssh', 'config');

    const fileExists = fs.existsSync(defaultConfigLocation);
    if (fileExists) {
        const content = fs.readFileSync(defaultConfigLocation);
        const contentStr = content.toString();
        if (!/^Host devops.scmservice.*.oci.oraclecloud.com/mi.test(contentStr)) {
            return false;
        }

        const lines : string[] = contentStr.split(os.EOL);
        let foundIndex : number = -1;
        let checkHostIPIndex : number = -1;
        let strictHostsIndex : number = -1;
        let checkOK = false;
        let strictOK = false;

        for (let index = 0; index < lines.length; index++) {
            const line = lines[index];
            if (/^Host devops.scmservice.\*.oci.oraclecloud.com/i.test(line)) {
                foundIndex = index;
                continue;
            }
            if (/^\s*CheckHostIP/i.test(line)) {
                checkHostIPIndex = index;
                checkOK = /^\s*CheckHostIP(\s*=\s*|\s+)(no)/i.test(line);
            } else if (/^\s*StrictHostKeyChecking/i.test(line)) {
                strictHostsIndex = index;
                checkOK = /^\s*StrictHostKeyChecking(\s*=\s*|\s+)(accept-new|no|off)/i.test(line);
            } else if (/^(Host|Match)/i.test(line)) {
                // terminate at the next host
                break;
            }
        }

        if (foundIndex == -1) {
            // no entry for the oracle cloud machine found.
            return false;
        }
        if (checkOK && strictOK) {
            return true;
        }

        vscode.window.showInformationMessage("When working with the remote Git repository, the remote host fingerprint");

        if (checkHostIPIndex != -1 && !checkOK) {
            let s = lines[checkHostIPIndex];
            lines[checkHostIPIndex] = s.replace(new RegExp("CheckHostIP.*"), "CheckHostIP no");
        }
        if (strictHostsIndex != -1 && !strictOK) {
            let s = lines[strictHostsIndex];
            lines[strictHostsIndex] = s.replace(new RegExp("StrictHostKeyChecking.*"), "StrictHostKeyChecking accept-new");
        }
        if (checkHostIPIndex == -1) {
            lines.splice(foundIndex + 1, 0, "  CheckHostIP no");
        }
        
        if (strictHostsIndex == -1) {
            lines.splice(foundIndex + 1, 0, "  StrictHostKeyChecking accept-new");
        }
        const newContents = lines.join(os.EOL);
        fs.writeFileSync(defaultConfigLocation, newContents);

        return true;
    }

    return false;
}