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
import * as os from 'os';
import * as which from 'which';
import * as common from 'oci-common';
import * as dialogs from '../dialogs';
import * as ociUtils from './ociUtils';
import { logError, logInfo } from '../logUtils';

// Windows 'chmod' equivalent
const icacls_exe = 'icacls';

const defaultConfigDiretory = path.join(os.homedir(), '.ssh');
const defaultConfigLocation = path.join(defaultConfigDiretory, 'config');

export async function checkSshConfigured(provider: common.ConfigFileAuthenticationDetailsProvider, sshUrl: string): Promise<boolean> {
    const r = /ssh:\/\/([^/]+)\//.exec(sshUrl);
    if (r && r.length === 2) {
        const hostname = r[1];
        logInfo(`[ssh] checking configuration for host ${hostname}`);
        if (await initializeSshKeys(provider)) {
            const autoAccept = isAutoAcceptHostFingerprint();
            logInfo(`[ssh] host fingerprint auto-accept: ${autoAccept}`);
            let success = autoAccept ? 1 : await addCloudKnownHosts(hostname, true);
            if (success === -1) {
                const disableHosts = await vscode.window.showWarningMessage(
                    "Do you want to disable SSH known_hosts checking for OCI infrastructure ?\n" +
                    "This is less secure than adding host keys to known_hosts. The change will affect only connections to SCM OCI services.",
                    "Yes", "No");
                if ("Yes" === disableHosts) {
                    logInfo(`[ssh] user selected disable-hosts`);
                    if (addAutoAcceptHostFingerprintForCloud()) {
                        success = 0;
                    }
                } else {
                    logInfo(`[ssh] user rejected to disable host-hosts`);
                    return false;
                }
            }
            if (success === -1) {
                logInfo(`[ssh] SSH utilities not available`);
                vscode.window.showWarningMessage("SSH utilities required for host key management are not available. Some Git operations may fail. See https://code.visualstudio.com/docs/remote/troubleshooting#_installing-a-supported-ssh-client for the recommended software.");
                return false;
            }
            return success > 0;
        } else {
            return false;
        }
    } else {
        return false;
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
    try {
        await checkPrivateKeyFileAndConfig(identityFile);
    } catch (err : any) {
        logError(dialogs.getErrorMessage(`[ssh] Permission check failed, identity file ${identityFile}`, err));
        return false;
    }
    parsed.addOrUpdateIdentityFileDirective(identityFile);
    parsed.addOrUpdateUserDirective(userName, tenancyName);
    if (parsed.modified) {
        let ack = await vscode.window.showInformationMessage(`The keys for OCI are missing in SSH configuration. Do you allow to add them to SSH config file ?
                Various repository operations may fail if the SSH keys are not configured.`, "Yes", "No");
        if (ack !== "Yes" || !parsed.lines) {
            return false;
        }
        try {
            writeSshConfigContents(parsed.lines.join(os.EOL));
        } catch (err : any) {
            dialogs.showErrorMessage('Error writing SSH configuration', err);
            return false;
        }
    }
    return true;
}

function writeSshConfigContents(newContents : string) {
    logInfo(`Writing SSH config`);
    fs.mkdirSync(path.dirname(defaultConfigLocation), {
        recursive: true,
        // owner: read-write-execute, group+others: 0
        mode: 0o700
    });
    fs.writeFileSync(defaultConfigLocation, newContents);
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
    const hostsLocation = path.join(defaultConfigDiretory, 'known_hosts');
    if (fs.existsSync(hostsLocation)) {
        try {
            // attemp to find host's key in the known_hosts file
            await outputOf(`ssh-keygen -f ${hostsLocation} -F ${hostname}`);
            logInfo(`[ssh] Hostkey found for host ${hostname}`);
            return 1;
        } catch(e) {}
    }
    let keys;
    logInfo(`[ssh] Generating host key for ${hostname}`);
    const cmdString = `ssh-keyscan ${hostname}`;
    try {
        keys = (await outputOf(cmdString)).split(os.EOL).filter(s => s.startsWith(hostname));
    } catch (e) {
        let msg = (e as any)?.message as string || "Unknown failure";
        let i = msg.indexOf(cmdString);
        if (i >= 0) {
            msg = msg.substring(i + cmdString.length + 1).trim();
        }
        dialogs.showErrorMessage(`Fetching SSH host key for ${hostname} failed: ${msg}`, e);
        return 0;
    }
    if (keys.length === 0) {
        dialogs.showErrorMessage(`Could not automatically obtain SSH host key for ${hostname}.`);
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
                logError(`User rejected fingerprint for host ${hostname}`);
                return 0;
            }
        } catch(e) {
            dialogs.showErrorMessage(`Could not automatically obtain SSH host key for ${hostname}.`, e);
            return 0;
        }
    }
    try {
        fs.appendFileSync(hostsLocation, hostLine);
    } catch (err: any) {
        dialogs.showError("Could not update SSH known hosts", err);
        return 0;
    }
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
            let r = /\s*IdentityFile\s+\"?([^"]+)\"?\s*?/.exec(s);
            if (!r || r.length !== 2 || r[1] !== identityFile) {
                l[this.indentityFileIndex] = `  IdentityFile "${identityFile}"`;
                this.lines = l;
                this.modified = true;
            }
        } else {
            let fi = this.foundIndex + 1;
            l.splice(fi, 0, `  IdentityFile "${identityFile}"`);
            this.indentityFileIndex = fi;
            this.lines = l;
            this.modified = true;
        }
    }

    addStrictAndCheckDirectives() {
        const l : string[] = this.lines || [];
        if (this.checkHostIPIndex && !this.checkOK) {
            let s = l[this.checkHostIPIndex];
            logInfo(`Changing CheckHostIP directive to "no"`);
            l[this.checkHostIPIndex] = s.replace(new RegExp("CheckHostIP.*"), "CheckHostIP no");
            this.checkOK = true;
        }
        if (this.strictHostsIndex && !this.strictOK) {
            let s = l[this.strictHostsIndex];
            logInfo(`Changing StrictHostKeyChecking directive to "accept-new"`);
            l[this.strictHostsIndex] = s.replace(new RegExp("StrictHostKeyChecking.*"), "StrictHostKeyChecking accept-new");
            this.strictOK = true;
        }
        let fi = this.foundIndex + 1;
        if (!this.checkHostIPIndex) {
            logInfo(`[ssh] Adding CheckHostIP no`);
            l.splice(fi, 0, "  CheckHostIP no");
            this.checkHostIPIndex = fi++;
            this.checkOK = true;
        }
        
        if (!this.strictHostsIndex) {
            logInfo(`[ssh] Adding StrictHostKeyChecking accept-new`);
            l.splice(fi, 0, "  StrictHostKeyChecking accept-new");
            this.strictHostsIndex = fi++;
            this.strictOK = true;
        }
        this.lines = l;
        this.modified = true;
    }
}

function isAutoAcceptHostFingerprint() : boolean {
    try {
        const parsed = new ParsedKnownHosts();
        return parsed.isDisabled();
    } catch (err) {
        // do not bother user with error message, as this is used from different places.
        logError(`[ssh] ${dialogs.getErrorMessage('Error parsing SSH config', err)}`);
    }
    return false;
}

function addAutoAcceptHostFingerprintForCloud() : boolean {
    let parsed;
    try {
        parsed = new ParsedKnownHosts();
        if (parsed.foundIndex < 0) {
            logInfo(`[ssh] Adding host section for oci.oraclecloud`);
            parsed.addHostSection();
        }
        
        if (parsed.isDisabled()) {
            logInfo(`[ssh] oci.oraclecloud checking already disabled`);
            return true;
        }
    } catch (err) {
        dialogs.showErrorMessage('Error parsing SSH config for oci.oraclecloud configuration', err);
        return false;
    }
    try {
        parsed.addStrictAndCheckDirectives();
        if (parsed.modified && parsed.lines) {
            writeSshConfigContents(parsed.lines.join(os.EOL));
        }
    } catch (err) {
        dialogs.showErrorMessage('Error writing SSH config file', err);
        return false;
    }
    return true;
}

/**
 * Checks that the private key + other SSL/SSH configuration files have correct permissions. Warns the user if not and 
 * waits for the reply, optionally corrects the permissions. Throws when the corrective action fails.
 * @param privateKey private key filename
 * @throws when permission modification fails
 */
export async function checkPrivateKeyFileAndConfig(privateKey : string) : Promise<void> {
    const bad = checkSshConfigOrPrivateKeyExposed(privateKey);
    if (!bad.size) {
        // all good!
        return;
    }
    const filelist = Array.from(bad.values()).join(',');
    let response = await vscode.window.showWarningMessage(`Some of SSL-related files are not secured and can be read by others: ${filelist}. SSL operations may fail because of insecure host configuration. 
        Do you want to fix the permissions ?`, "Yes", "No");
    if (response === 'Yes') {
        for (let f of bad.keys()) {
            makeFileOwnerReadable(f);
        }
    }
}

/**
 * Checks SSH/SSL-related files for insecure file permisions. Returns map of filename > description of files that have
 * incorrect permissions. Empty map means everything is OK. Checks ssh config (~/.ssh/config), known hosts (~/.ssh/known_hosts) and
 * the private key file itself. 
 * @param privateKey private key filename
 * @returns Map of files with broken permissions.
 */
export function checkSshConfigOrPrivateKeyExposed(privateKey : string) : Map<string, string> {
    let r : Map<string, string> = new Map<string, string>();

    let cfg = path.join(defaultConfigDiretory, 'config');
    if (isFileReadableByOthers(cfg)) {
        r.set(cfg, 'SSH Config (config)');
    }
    if (privateKey && isFileReadableByOthers(privateKey)) {
        r.set(privateKey, `Private key (${privateKey})`);
    }
    return r;
}

/**
 * Checks that the file is readable by others than the user. On UNIX, checks that g/o has r(x) bit set.
 * On Windows, checks that non-admin/system principal has (inherited?) ACL that allows to read.
 * @param filename 
 */
function isFileReadableByOthers(filename : string) : boolean {
    if (!fs.existsSync(filename)) {
        logInfo(`[ssh] checking permissions for ${filename}: does not exist`);
        return false;
    }
    if (process.platform === 'win32') {
        const matchDomain = process.env['USERDOMAIN'];
        const matchUser = process.env['USERNAME'] || process.env['LOGNAME'];

        logInfo(`[ssh] Checking Windows permissions on ${filename}. Current user: "${matchUser}", domain: "${matchDomain}"`);

        const out = cp.execSync(`${icacls_exe} "${filename}"`).toString();
        const lines : string[] = out.split('\n');
        if (lines.length > 0 && lines[0].startsWith(filename)) {
            lines[0] = lines[0].slice(filename.length + 1);
        }
        logInfo(`[ssh] Permissions detected: ${out}`);
        /**
         * Example ACL listing:
         * -----------------
            e.txt NT AUTHORITY\Authenticated Users:(DENY)(RX)
                MSEDGEWIN10\IEUser:(F)
                BUILTIN\Administrators:(I)(F)
                NT AUTHORITY\SYSTEM:(I)(F)
                BUILTIN\Users:(I)(RX)
                NT AUTHORITY\Authenticated Users:(I)(M)
         * -----------------
         */
        // process lines:
        const principalRe = / *([^\\:]+)\\([^\\:]+):(.*)/i;
        const accessRe = /(\(deny\))?.*(\([^)]+\))?\(([^)]+)\)/i;
        for (let l of lines) {
            const res = principalRe.exec(l);
            if (!res) {
                continue;
            }
            const domain = res[1];
            const user = res[2];
            const principal = `${res[1]}\\${res[2]}`;
            const perms = res[3];
            // ignore system or administrator principals
            logInfo(`[ssh] permissions: principal "${principal}", user "${user}", domain "${domain}, perms = "${perms}"`);
            if (principal === 'BUILTIN\\Administrators' || principal === 'NT AUTHORITY\\SYSTEM') {
                continue;
            }

            const acc = accessRe.exec(perms);
            if (!acc || !acc[3]) {
                continue;
            }
            const flags : string[] = acc[3].split(',');
            if (acc[1]) {
                // deny entry takes precedence, if matches the user, so can't deny-to-all, since that would affect
                // the owner regardless of other ACLs. Denying specific users does not prevent the access for some
                // newly created principals, so we can safely ignore the ACL completely.
                continue;
            }
            if (flags.includes('R') ||
                flags.includes('RX') || // implies R
                flags.includes('F') ||  // implies WRX
                flags.includes('M')) {  // implies WR
                
                if ((matchDomain && domain !== matchDomain) || (user !== matchUser)) {
                    // permission given to another user
                    logInfo(`[ssh] bad permissions on ${filename}: ${l}`);
                    return true;
                }
            }
            logInfo(`[ssh] ${filename} OK`);
            return false;
        }
    } else { /* Linux, MacOS */ 
        // any permission bits for group or other are not allowed
        logInfo(`[ssh] Checking UNIX permissions on ${filename}.`);
        const perms = fs.statSync(filename).mode;
        if (perms & 0o077) {
            logInfo(`[ssh] bad permissions on ${filename}: ${perms.toString(8)}`);
            return true;
        } else {
            logInfo(`[ssh] ${filename} OK`);
            return false;
        }
    }
    return false;
}

/**
 * Makes the thing readable just by the owner. On UNIXes, resets bits for group/other, on Windows, 
 * disables inheritance, resets all permissions and adds just F for the current user. Throws on error.
 * @param filename filename to change permissions for
 */
function makeFileOwnerReadable(filename : string) : void {
    if (!fs.existsSync(filename)) {
        return;
    }
    logInfo(`[ssh] Resetting permissions on ${filename}`);
    try {
        if (process.platform === 'win32') {
            const username = process.env['USERNAME'] || process.env['LOGNAME'];
            // reset all permisions
            logInfo(`[ssh] executing: ${icacls_exe} "${filename}" /reset`);
            cp.execSync(`${icacls_exe} "${filename}" /reset`);
            // remove inheritance: stupid command cannot do more operations 
            logInfo(`[ssh] executing: ${icacls_exe} "${filename}" /inheritance:r`);
            cp.execSync(`${icacls_exe} "${filename}" /inheritance:r`);
            // grang full control to the current user
            logInfo(`[ssh] executing: ${icacls_exe} "${filename}" /grant:r ${username}:(F)`);
            cp.execSync(`${icacls_exe} "${filename}" /grant:r ${username}:(F)`);
        } else { /* Linux, MacOS */ 
            // any permission bits for group or other are not allowed
            const d = fs.statSync(filename).isDirectory();
            logInfo(`[ssh] executing: chmod ${d ? 0o700 : 0o600} ${filename}`);
            fs.chmodSync(filename, d ? 0o700 : 0o600);
        }
    } catch (e : any) {
        dialogs.showErrorMessage(`Error changing permissions on ${filename}`, e);
        // rethrow to fail the operation
        throw e;
    }
}
