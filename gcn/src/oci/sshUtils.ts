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
import * as dialogs from '../dialogs';
import * as ociUtils from './ociUtils';


let sshKeyInitInProgress = false;

const defaultConfigLocation = path.join(os.homedir(), '.ssh', 'config');

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
                        dialogs.showErrorMessage('Failed to read OCI configuration', err);
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
        dialogs.showErrorMessage(`Fetching SSH host key for ${hostname} failed: ${msg}`);
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

class ParsedKnownHosts {
    lines?: string[];
    foundIndex: number = -1;
    checkHostIPIndex?: number;
    strictHostsIndex?: number;
    checkOK = false;
    strictOK = false;

    constructor() {
        const fileExists = fs.existsSync(defaultConfigLocation);
        if (!fileExists) {
            return;
        }
        const content = fs.readFileSync(defaultConfigLocation);
        const contentStr = content.toString();
        this.lines = contentStr.split(os.EOL);

        for (let index = 0; index < this.lines.length; index++) {
            const line = this.lines[index];
            if (/^Host devops.scmservice\..*\.oci.oraclecloud.com/i.test(line)) {
                this.foundIndex = index;
                continue;
            }
            if (this.foundIndex > -1) {
                if (/^\s*CheckHostIP/i.test(line)) {
                    this.checkHostIPIndex = index;
                    this.checkOK = /^\s*CheckHostIP(\s*=\s*|\s+)(no)/i.test(line);
                } else if (/^\s*StrictHostKeyChecking/i.test(line)) {
                    this.strictHostsIndex = index;
                    this.strictOK = /^\s*StrictHostKeyChecking(\s*=\s*|\s+)(accept-new|no|off)/i.test(line);
                } else if (/^(Host|Match)/i.test(line)) {
                    // terminate at the next host
                    break;
                }
            }
        }
    }

    isDisabled() : boolean {
        return this.strictOK && this.checkOK;
    }

    addStrictAndCheckDirectives() {
        const l : string[] = this.lines || [];
        if (this.checkHostIPIndex && !this.checkOK) {
            let s = l[this.checkHostIPIndex];
            l[this.checkHostIPIndex] = s.replace(new RegExp("CheckHostIP.*"), "CheckHostIP no");
            this.checkOK = true;
        }
        if (this.strictHostsIndex && !this.strictOK) {
            let s = l[this.strictHostsIndex];
            l[this.strictHostsIndex] = s.replace(new RegExp("StrictHostKeyChecking.*"), "StrictHostKeyChecking accept-new");
            this.strictOK = true;
        }
        let fi = this.foundIndex + 1;
        if (!this.checkHostIPIndex) {
            l.splice(fi, 0, "  CheckHostIP no");
            this.checkHostIPIndex = fi++;
            this.checkOK = true;
        }
        
        if (!this.strictHostsIndex) {
            l.splice(fi, 0, "  StrictHostKeyChecking accept-new");
            this.strictHostsIndex = fi++;
            this.strictOK = true;
        }
        this.lines = l;
    }
}

export function isAutoAcceptHostFingerprint() : boolean {
    const parsed = new ParsedKnownHosts();
    return parsed.isDisabled();
}

export async function addAutoAcceptHostFingerprintForCloud() : Promise<boolean> {
    const parsed = new ParsedKnownHosts();
    if (!parsed.foundIndex) {
        return false;
    }
    if (parsed.isDisabled()) {
        return true;
    }
    
    parsed.addStrictAndCheckDirectives();
    const newContents = parsed.lines?.join(os.EOL);
    fs.writeFileSync(defaultConfigLocation, newContents);

    return true;
}