/*
 * Copyright (c) 2024, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as decompress from 'decompress';
import * as visualvm from './visualvm';
import * as commands from './commands';
import * as logUtils from '../../common/lib/logUtils';


export async function installZipArchive(zipFile: string, targetDir: string, name: string, deleteZipFile: boolean = true) {
    logUtils.logInfo(`[install] Installing ${name} zip archive ${zipFile} to ${targetDir}`);
    try {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Extracting ${name}...`
        }, async () => {
            try {
                logUtils.logInfo(`[install] Extracting zip archive ${zipFile} to ${targetDir}`);
                await decompress(zipFile, targetDir, { strip: 1 });
            } catch (err) {
                logUtils.logError(`[install] Failed to extract zip archive ${zipFile} to ${targetDir}: ${err}`);
                vscode.window.showErrorMessage(`Failed to extract ${name}: ${err}`);
                throw(err);
            }
            // This is to prevent VisualVM startup failure - happens for identical .lastModified timestamps in different installation paths
            touchFile(path.join(targetDir, 'platform', '.lastModified'));
            touchFile(path.join(targetDir, 'visualvm', '.lastModified'));
            if (deleteZipFile) {
                try {
                    logUtils.logInfo(`[install] Deleting zip archive ${zipFile}`);
                    fs.unlinkSync(zipFile);
                } catch (err) {
                    logUtils.logWarning(`[install] Failed to delete zip archive ${zipFile}: ${err}`);
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
        logUtils.logError(`[install] Failed to install zip archive ${zipFile} to ${targetDir}: ${err}`);
    }
}

function touchFile(path: string): boolean {
    const date = new Date();
    try {
        logUtils.logInfo(`[install] Resetting times for ${path}`);
        fs.utimesSync(path, date, date);
        return true;
    } catch (err) {
        logUtils.logWarning(`[install] Failed to reset times for ${path}: ${err}`);
    }
    return false;
}

export async function installDiskImage(dmgFile: string, name: string, _deleteDmgFile: boolean = true) {
    logUtils.logInfo(`[install] Request to manually install ${name} disk image ${dmgFile}`);
    const msg = `${name} disk image has been downloaded to the selected folder. Install it and use the ${commands.COMMAND_SELECT_INSTALLATION_NAME} action to start using it.`;
    const openOption = 'Open File Location';
    const selected = await vscode.window.showInformationMessage(msg, openOption);
    if (selected === openOption) {
        vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(dmgFile));
    }
}
