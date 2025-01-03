/*
 * Copyright (c) 2020, 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import path = require('path');
import * as fs from 'fs';
import * as vscode from 'vscode';

const GET_PROJECT_INFO = 'nbls.project.info';

export async function getGdkProjects(): Promise<vscode.WorkspaceFolder[]> {
    const gdkProjects: vscode.WorkspaceFolder[] = [];
    try {
        for (let folder of vscode.workspace.workspaceFolders || []) {
            const infos: any[] = await vscode.commands.executeCommand(GET_PROJECT_INFO, folder.uri.toString(), { projectStructure: true });
            if (infos?.length && infos[0]) {
                for(const sub of infos[0].subprojects) {
                    const u = vscode.Uri.parse(sub)?.fsPath;
                    if (!u) {
                        continue;
                    }
                    const resPath = path.join(u, 'src', 'main', 'resources');
                    if (fs.existsSync(path.join(resPath,  'application-oraclecloud.yml')) ||
                        fs.existsSync(path.join(resPath,  'application-oraclecloud.properties')) ||
                        fs.existsSync(path.join(resPath, 'application-ec2.yml')) ||
                        fs.existsSync(path.join(resPath, 'application-ec2.properties'))) {
                        gdkProjects.push(folder);
                        break;
                    }
                }
            }
        }
    } catch(_err) {
        // When NBLS restarts error can happen
    }
     
    return gdkProjects;
}