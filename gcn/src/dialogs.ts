/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as logUtils from '../../common/lib/logUtils';


export async function openInBrowser(address: string): Promise<boolean> {
	return vscode.env.openExternal(vscode.Uri.parse(address));
}

export function getErrorMessage(message: string | undefined, err?: any): string {
	if (err) {   
        if (err.message) {
            message = message ? `${message}: ${err.message}` : err.message;
        } else if (err.toString()) {
            message = message ? `${message}: ${err.toString()}` : err.toString();
        }
    }
	if (!message) {
		message = 'Unknown error.';
	} else if (!message.endsWith('.')) {
        message = `${message}.`;
    }
    return message;
}

export function showErrorMessage(message: string | undefined, err?: any, ...items: string[]): Thenable<string | undefined> {
    const msg = getErrorMessage(message, err);
	logUtils.logError(msg);
    return vscode.window.showErrorMessage(msg, ...items);
}

export function showError(err?: any, ...items: string[]): Thenable<string | undefined> {
	return showErrorMessage(undefined, err, ...items);
}