/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */
 
import * as vscode from 'vscode';


export async function createProject(context: vscode.ExtensionContext): Promise<void> {
    await vscode.window.showInformationMessage("Hello Web 😊");
    return Promise.resolve();    
}
