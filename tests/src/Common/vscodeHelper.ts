/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import { downloadAndUnzipVSCode, resolveCliArgsFromVSCodeExecutablePath } from "@vscode/test-electron";
import { includeInPreferences, resolveExtensions } from "./extensionHelper";
import * as cp from 'child_process';

/**
 * Downloads and unzips VSCode and does needed setup
 * @returns path to vscode test installation executable
 */
export async function prepareVSCode(): Promise<string> {
    // Install extensions
    const vscodeExecutablePath = await downloadAndUnzipVSCode('1.76.0');
    
    const proxyFull = process.env['http_proxy']
    if (proxyFull !== undefined && proxyFull.length > 0) {
        const proxyHost = proxyFull.slice(proxyFull.lastIndexOf('/') + 1, proxyFull.lastIndexOf(':'));
        const proxyPort = proxyFull.slice(proxyFull.lastIndexOf(':') + 1);
        includeInPreferences("java.jdt.ls.vmargs", `-Dhttp.proxyHost=${proxyHost} -Dhttp.proxyPort=${proxyPort} -Dhttps.proxyHost=${proxyHost} -Dhttps.proxyPort=${proxyPort}`);
    } else {
        includeInPreferences("java.jdt.ls.vmargs");
    }

    includeInPreferences("java.imports.gradle.wrapper.checksums", [
        {
            "sha256": "a8451eeda314d0568b5340498b36edf147a8f0d692c5ff58082d477abe9146e4",
            "allowed": true
        }
    ]);

    includeInPreferences("extensions.autoUpdate", false);

    process.env['netbeans.extra.options'] = '-J-Dnetbeans.networkProxy=IGNORE';

    return vscodeExecutablePath;
}

/**
 * Resolves ExtensionIDs to newest versions downloaded from Jenkins and install them into VSCode
 * @param vscodeExecutablePath path to VSCode installation
 * @param extensionList list of Extension IDs
 */
export async function prepareExtensions(vscodeExecutablePath: string, extensionList: string[]) {
    // TODO: remove previous Extensions..?
    const [cli, ...args] = resolveCliArgsFromVSCodeExecutablePath(vscodeExecutablePath);
    // download additional extensions
    if (process.env['MOCHA_EXTENSION_LIST']) {
        extensionList = extensionList.concat(process.env['MOCHA_EXTENSION_LIST'].split(','));
    }

    extensionList = await resolveExtensions(extensionList);

    for (const extensionId of extensionList) {
        cp.spawnSync(cli, [...args, '--install-extension', extensionId], {
            encoding: 'utf-8',
            stdio: 'inherit',
        });
    }
}