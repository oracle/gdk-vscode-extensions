/*
 * Copyright (c) 2022, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
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
                        userName = (await ociUtils.getUser(provider))?.user.name;
                        tenancyName = (await ociUtils.getTenancy(provider)).tenancy.name;
                        identityFile = common.ConfigFileReader.parseDefault(null).get('key_file');
                    } catch (err) {
                        // TODO: handle errors
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