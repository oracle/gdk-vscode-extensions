/*
 * Copyright (c) 2024, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as process from 'process';


export function findLauncher(): string | undefined {
    const execPath = process.execPath;
    let launcherPath: string | undefined = undefined;
    
    if (process.platform === 'darwin') {
        const CONTENTS_HANDLE = '/Contents';
        const idx = execPath.indexOf(`${CONTENTS_HANDLE}/Frameworks/`);
        if (idx > -1) {
            launcherPath = `${execPath.substring(0, idx + CONTENTS_HANDLE.length)}/Resources/app/bin/code`;
        }
    } else {
        const execDir = path.resolve(execPath, '..');
        launcherPath = path.join(execDir, 'bin', 'code');
        if (process.platform === 'win32') {
            launcherPath = `${launcherPath}.cmd`;
        }
    }
    
    if (launcherPath && fs.existsSync(launcherPath)) {
        if (launcherPath.indexOf(' ') > -1) {
            launcherPath = `"${launcherPath}"`;
        }
        return launcherPath;
    }

    return undefined;
}
