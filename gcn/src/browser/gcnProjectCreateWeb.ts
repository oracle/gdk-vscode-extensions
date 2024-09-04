/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */
 
import * as vscode from 'vscode';
import { handleNewGCNProject } from '../../../common/lib/dialogs';
import * as micronautTools from '../../../common/lib/micronautToolsIntegration';
import { 
    CreateOptions, 
    initialize, 
    selectCreateOptions, 
    writeProjectContents,
    FileHandler,
    CONFIGURATION_SECTION
} from '../common';


export async function createProject(context: vscode.ExtensionContext): Promise<void> {
    var options: CreateOptions | undefined;
    options = await initialize().then(async () => selectCreateOptions());

    if (!options) {
        return;
    }

    /*
    for debugging

    options = {
        applicationType : 'APPLICATION',
        language: 'JAVA',
        micronautVersion: { label: '3.7.0', serviceUrl: ''},
        buildTool: 'GRADLE',
        testFramework: 'JUNIT',

        basePackage: 'com.example',
        projectName: 'demo',
        javaVersion: 'JDK_11'
    };
    */

    const targetLocation = await selectLocation(options);
    if (!targetLocation) {
        return;
    }

    if (options.installMicronautTools === true) {
        if (!await micronautTools.installExtension()) {
            return; // An error message has been displayed, do not proceed with project creation until resolved
        }
    } else if (options.installMicronautTools === false) {
        await micronautTools.neverCheckExtensionInstalled(CONFIGURATION_SECTION);
    }

    return createProjectBase(context, options, targetLocation);
}

export async function createProjectBase(context: vscode.ExtensionContext, options : CreateOptions, targetLocation : string): Promise<void> {

    let targetLocationUri = vscode.Uri.file(targetLocation);

    await vscode.workspace.fs.createDirectory(targetLocationUri);
    
    await writeProjectContents(options,new WebFileHandler(targetLocationUri));

    handleNewGCNProject(context, targetLocationUri, "GDK");
}

async function selectLocation(options: CreateOptions) {
    const location: vscode.Uri[] | undefined = await vscode.window.showOpenDialog({
        defaultUri: vscode.Uri.file('/'),
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        title: 'Choose Project Directory',
        openLabel: 'Create Here'
    });
    if (location && location.length > 0) {
        let appName = options.basePackage;
        if (appName) {
            appName += '.' + options.projectName;
        } else {
            appName = options.projectName;
        }
        return vscode.Uri.joinPath(location[0],options.projectName).fsPath;
    } else {
        return undefined;
    }
}

/**
 * A browser implementation of FileHandler abstract class.
 */
class WebFileHandler extends FileHandler{

    constructor(locationUri:vscode.Uri){
        super(locationUri);
    }
    
    changeMode(_fileUri: vscode.Uri, _isExecutable: boolean):void {
        //TODO: writes a file to the specified location with the given permissions (handle executable files)
    }
}