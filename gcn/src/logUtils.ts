/*
 * Copyright (c) 2022, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';


const GCN_OUTPUT = 'OCI Services';

let LOG_OUTPUT: vscode.OutputChannel | undefined;

// Initialize the Output immediately to be always visible
getOutput();

export function logError(record: string) {
    getOutput().appendLine(`[error - ${new Date().toISOString()}] ${record}`);
}

function getOutput(): vscode.OutputChannel {
    if (!LOG_OUTPUT) {
        LOG_OUTPUT = vscode.window.createOutputChannel(GCN_OUTPUT);
    }
    return LOG_OUTPUT;
}
