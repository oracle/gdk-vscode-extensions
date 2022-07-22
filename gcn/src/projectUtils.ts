/*
 * Copyright (c) 2022, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';

// TODO: implement for Maven/Gradle projects

export function getProjectDevbuildArtifact(folder: vscode.WorkspaceFolder): string | undefined {
    return `${folder.name.toLowerCase()}-0.1.jar`;
}

export function getProjectNativeExecutableArtifact(folder: vscode.WorkspaceFolder): string | undefined {
    return folder.name.toLowerCase();
}
