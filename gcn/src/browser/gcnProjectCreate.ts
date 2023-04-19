/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */
 
import * as vscode from 'vscode';
import { handleNewGCNProject } from '../projectHandler';
import { 
    CreateOptions, 
    JavaVMType, 
    getJavaVersions, 
    initialize, 
    selectCreateOptions, 
    writeProjectContents 
} from '../common';


export async function createProject(context: vscode.ExtensionContext): Promise<void> {
    var options: CreateOptions | undefined;
    options = await initialize().then(async () => {
        let javaVMs = await getJavaVMs();
        return selectCreateOptions(javaVMs);
    });

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

    const targetLocation = await selectLocation(context, options);
    if (!targetLocation) {
        return;
    }
    return createProjectBase(options, targetLocation);    
}

export async function createProjectBase(options : CreateOptions, targetLocation : string): Promise<void> {

    let targetLocationUri = vscode.Uri.file(targetLocation);

    await vscode.workspace.fs.createDirectory(targetLocationUri);
    
    await writeProjectContents(options,fileHandler(targetLocationUri));

    handleNewGCNProject(targetLocationUri);
}

function fileHandler(locationUri:vscode.Uri){
    return async (pathName: any, bytes: any, _isBinary: any, isExecutable: any) => {
        const p : string = pathName.$as('string');
        const exe : boolean = isExecutable.$as('boolean');
        const data = bytes.$as(Int8Array).buffer;
        const view = new Uint8Array(data);

        const dir = vscode.Uri.joinPath(vscode.Uri.file(p),'..').fsPath;

        const dirUri = vscode.Uri.joinPath(locationUri, dir);
        //Create directory if not exists
        await vscode.workspace.fs.createDirectory(dirUri);
        // Write file to disk
        const fileUri = vscode.Uri.joinPath(locationUri, p);
        await vscode.workspace.fs.writeFile(fileUri, view);
        //TODO: writes a file to the specified location with the given permissions (handle executable files)

    };
}

async function selectLocation(context: vscode.ExtensionContext, options: CreateOptions) {
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

async function getJavaVMs(): Promise<JavaVMType[]> {
    const javaVMs: JavaVMType[] = getJavaVersions().map(version => {
                return  {name: `Java ${version}`, path: '', active: false};
            });
    return javaVMs;
}

