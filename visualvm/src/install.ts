/*
 * Copyright (c) 2024, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as decompress from 'decompress';
import * as visualvm from './visualvm';
import * as commands from './commands';


export async function installZipArchive(zipFile: string, targetDir: string, name: string, deleteZipFile: boolean = true) {
    try {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Extracting ${name}...`
        }, async () => {
            try {
                await decompress(zipFile, targetDir, { strip: 1 });
            } catch (err) {
                vscode.window.showErrorMessage(`Failed to extract ${name}: ${err}`);
                throw(err);
            }
            if (deleteZipFile) {
                try {
                    fs.unlinkSync(zipFile);
                } catch (err) {
                    const msg = `Failed to delete downloaded ${name} archive ${zipFile}: ${err}`;
                    const openOption = 'Open File Location';
                    const selected = await vscode.window.showWarningMessage(msg, openOption);
                    if (selected === openOption) {
                        vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(zipFile));
                    }
                    throw(err);
                }
            }
        });
        await visualvm.select(targetDir);
    } catch (err) {
        console.log(`Failed to install ${zipFile} to ${targetDir}: ${err}`);
    }
}

export async function installDiskImage(dmgFile: string, name: string, _deleteDmgFile: boolean = true) {
    const msg = `${name} has been downloaded to the selected folder. Install it and use the ${commands.COMMAND_SELECT_INSTALLATION_NAME} action to start using it.`;
    const openOption = 'Open File Location';
    const selected = await vscode.window.showInformationMessage(msg, openOption);
    if (selected === openOption) {
        vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(dmgFile));
    }
}
