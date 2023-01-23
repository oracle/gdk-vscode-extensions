/*
 * Copyright (c) 2022, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as dialogs from './dialogs';

const defaultConfigLocation = path.join(os.homedir(), '.docker', 'config.json');

export function pullImage(imageId: string) {
    const terminal = dialogs.getGCNTerminal();
    terminal.show();
    terminal.sendText(`docker pull ${imageId}`);
}

export function login(registryName: string, userName: string, password: string) {
    const terminal = dialogs.getGCNTerminal();
    terminal.show();
    terminal.sendText(`docker login --username ${userName} --password "${password}" ${registryName}`);
}

export function isAuthenticated(registryName: string): boolean {
    if (fs.existsSync(defaultConfigLocation)) {
        const configurationString = fs.readFileSync(defaultConfigLocation).toString();
        const configuration = JSON.parse(configurationString);
        if (configuration.auths && configuration.auths[registryName]) {
            return true;
        }
    }
    return false;
}