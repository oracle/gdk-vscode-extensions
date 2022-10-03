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


const defaultConfigLocation = path.join(os.homedir(), '.ssh', 'config');

export async function checkSshConfigured(provider: common.ConfigFileAuthenticationDetailsProvider, sshUrl: string): Promise<void> {
    const r = /ssh:\/\/([^/]+)\//.exec(sshUrl);
    if (r && r.length == 2) {
        const hostname = r[1];
        if (await initializeSshKeys(provider)) {
            const autoAccept = isAutoAcceptHostFingerprint();
            let success = autoAccept ? 1 : await addCloudKnownHosts(hostname, true);
            if (success == -1) {
                const disableHosts = await vscode.window.showWarningMessage(
                    "Do you want to disable SSH known_hosts checking for OCI infrastructure ?\n" +
                    "This is less secure than adding host keys to known_hosts. The change will affect only connections to SCM OCI services.",
                    "Yes", "No");
                if ("Yes" === disableHosts) {
                    if (addAutoAcceptHostFingerprintForCloud()) {
                        success = 0;
                    }
                }
            }
            if (success == -1) {
                vscode.window.showWarningMessage("SSH utilities required for host key management are not available. Some Git operations may fail. See https://code.visualstudio.com/docs/remote/troubleshooting#_installing-a-supported-ssh-client for the recommended software.");
            }
        }
    }
}

async function initializeSshKeys(provider: common.ConfigFileAuthenticationDetailsProvider): Promise<boolean> {
    const parsed = new ParsedKnownHosts();
    if (parsed.foundIndex < 0) {
        parsed.addHostSection();
    }
    const credentials = provider.getProfileCredentials();
    const configurations = credentials ? credentials.configurationsByProfile.get(credentials.currentProfile) : undefined;
    if (!configurations) {
        dialogs.showErrorMessage('Failed to get OCI profile configuration');
        return false;
    }
    let userName: string;
    let tenancyName: string | undefined;
    let identityFile: string | null | undefined;
    try {
        userName = (await ociUtils.getUser(provider, configurations.get('user'))).name;
        tenancyName = (await ociUtils.getTenancy(provider, configurations.get('tenancy'))).name;
        identityFile = configurations.get('key_file');
    } catch (err) {
        dialogs.showErrorMessage('Failed to read OCI profile configuration', err);
        return false;
    }
    if (!tenancyName || !identityFile) {
        dialogs.showErrorMessage('Failed to obtain user, tenancy, and/or identity file from OCI profile configuration');
        return false;
    }
    parsed.addOrUpdateIdentityFileDirective(identityFile);
    parsed.addOrUpdateUserDirective(userName, tenancyName);
    if (parsed.modified) {
        let ack = await vscode.window.showInformationMessage(`The keys for OCI are missing in SSH configuration. Do you allow to add them to SSH config file ?
                Various repository operations may fail if the SSH keys are not configured.`, "Yes", "No");
        if (ack !== "Yes") {
            return false;
        }
        const newContents = parsed.lines?.join(os.EOL);
        fs.writeFileSync(defaultConfigLocation, newContents);
    }
    return true;
}

async function sshUtilitiesPresent() : Promise<boolean> {
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

async function addCloudKnownHosts(hostname : string, ask : boolean) : Promise<number> {
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
    userIndex?: number;
    indentityFileIndex?: number;
    checkOK = false;
    strictOK = false;
    modified = false;

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
                } else if (/^\s*User/i.test(line)) {
                    this.userIndex = index;
                } else if (/^\s*IdentityFile/i.test(line)) {
                    this.indentityFileIndex = index;
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

    addHostSection() {
        const l : string[] = this.lines || [];
        let fi = this.foundIndex + 1;
        l.splice(fi, 0, "Host devops.scmservice.*.oci.oraclecloud.com");
        this.foundIndex = fi++;
        if (l.length > fi && l[fi].trim().length) {
            l.splice(fi, 0, "");
        }
        this.lines = l;
        this.modified = true;
    }

    addOrUpdateUserDirective(userName: string, tenancyName: string) {
        const l : string[] = this.lines || [];
        if (this.userIndex) {
            let s = l[this.userIndex];
            const text = `  User ${userName}@${tenancyName}`;
            if (text.trim() !== s.trim()) {
                l[this.userIndex] = text;
                this.lines = l;
                this.modified = true;
            }
        } else {
            let fi = this.foundIndex + 1;
            l.splice(fi, 0, `  User ${userName}@${tenancyName}`);
            this.userIndex = fi;
            this.lines = l;
            this.modified = true;
        }
    }

    addOrUpdateIdentityFileDirective(identityFile: string) {
        const l : string[] = this.lines || [];
        if (this.indentityFileIndex) {
            let s = l[this.indentityFileIndex];
            const text = `  IdentityFile ${identityFile}`;
            if (text.trim() !== s.trim()) {
                l[this.indentityFileIndex] = text;
                this.lines = l;
                this.modified = true;
            }
        } else {
            let fi = this.foundIndex + 1;
            l.splice(fi, 0, `  IdentityFile ${identityFile}`);
            this.indentityFileIndex = fi;
            this.lines = l;
            this.modified = true;
        }
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
        this.modified = true;
    }
}

function isAutoAcceptHostFingerprint() : boolean {
    const parsed = new ParsedKnownHosts();
    return parsed.isDisabled();
}

function addAutoAcceptHostFingerprintForCloud() : boolean {
    const parsed = new ParsedKnownHosts();
    if (parsed.foundIndex < 0) {
        return false;
    }
    if (parsed.isDisabled()) {
        return true;
    }
    
    parsed.addStrictAndCheckDirectives();
    if (parsed.modified) {
        const newContents = parsed.lines?.join(os.EOL);
        fs.writeFileSync(defaultConfigLocation, newContents);
    }

    return true;
}