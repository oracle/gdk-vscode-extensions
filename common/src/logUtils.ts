/*
 * Copyright (c) 2022, 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';

let LOG_OUTPUT: vscode.LogOutputChannel;
export function registerExtensionForLogging(context: vscode.ExtensionContext) {
    if (!LOG_OUTPUT) {
        LOG_OUTPUT = vscode.window.createOutputChannel(context.extension.packageJSON.displayName, { log: true });
    }
}

export function logTrace(record: string) {
    if (!LOG_OUTPUT) { throw new Error("Extension isn't registered for logging."); }
    LOG_OUTPUT.trace(record);
}

export function logDebug(record: string) {
    if (!LOG_OUTPUT) { throw new Error("Extension isn't registered for logging."); }
    LOG_OUTPUT.debug(record);
}

export function logInfo(record: string) {
    if (!LOG_OUTPUT) { throw new Error("Extension isn't registered for logging."); }
    LOG_OUTPUT.info(record);
}

export function logWarning(record: string) {
    if (!LOG_OUTPUT) { throw new Error("Extension isn't registered for logging."); }
    LOG_OUTPUT.warn(record);
}

export function logError(record: string) {
    if (!LOG_OUTPUT) { throw new Error("Extension isn't registered for logging."); }
    LOG_OUTPUT.error(record);
}

export function logAndThrow(record: string, errFnc?: (err: Error) => Error) {
    if (!LOG_OUTPUT) { throw new Error("Extension isn't registered for logging."); }
    LOG_OUTPUT.error(record);
    const err = new Error(record);
    throw errFnc ? errFnc(err) : err;
}
