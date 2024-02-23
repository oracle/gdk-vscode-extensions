/*
 * Copyright (c) 2024, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';


const NBLS_GET_SOURCE_ROOTS_COMMAND = 'nbls.java.get.project.source.roots';
const NBLS_GET_PACKAGES_COMMAND = 'nbls.java.get.project.packages';
const NBLS_PROJECT_INFO_COMMAND = 'nbls.project.info';

const JDT_EXTENSION_ID = 'redhat.java';
const JDT_SETTINGS_SOURCE_PATHS = 'org.eclipse.jdt.ls.core.sourcePaths';
const JDT_GET_PACKAGE_DATA = 'java.getPackageData';
const JDT_EXECUTE_WORKSPACE_COMMAND = 'java.execute.workspaceCommand';

// TODO: integrate with Micronaut Tools to only track sources of the selected GCN application module
export async function getSourceRoots(workspaceFolder?: vscode.WorkspaceFolder): Promise<string[] | undefined>  {
    const workspaceFolders = workspaceFolder ? [ workspaceFolder ] : vscode.workspace.workspaceFolders;
    if (!workspaceFolders?.length) { // No folder opened
        return [];
    }

    const commands = await vscode.commands.getCommands();
    const hasNblsProjectSourceRootsCommand = commands.includes(NBLS_GET_SOURCE_ROOTS_COMMAND);
    const jdtApi = vscode.extensions.getExtension(JDT_EXTENSION_ID)?.exports;
    if (!hasNblsProjectSourceRootsCommand && !jdtApi?.getProjectSettings) {
        // TODO: wait for NBLS/JDT if installed
        return undefined; // No Java support available
    }

    const hasNblsProjectInfoCommand = commands.includes(NBLS_PROJECT_INFO_COMMAND);

    const sourceRoots: string[] = [];
    const getUriSourceRoots = hasNblsProjectSourceRootsCommand ? getUriSourceRootsNbls : getUriSourceRootsJdt;
    for (const folder of workspaceFolders) {
        await getUriSourceRoots(sourceRoots, folder.uri.toString(), hasNblsProjectInfoCommand, jdtApi);
    }
    return sourceRoots;
}

async function getUriSourceRootsNbls(sourceRoots: string[], uri: string, hasNblsProjectInfoCommand: boolean) {
    const uriSourceRoots: string[] | undefined = await vscode.commands.executeCommand(NBLS_GET_SOURCE_ROOTS_COMMAND, uri);
    if (uriSourceRoots) {
        if (uriSourceRoots.length) { // found project packages
            for (const uriSourceRoot of uriSourceRoots) {
                const sourceRoot = vscode.Uri.parse(uriSourceRoot).fsPath;
                if (!sourceRoots.includes(sourceRoot)) {
                    sourceRoots.push(sourceRoot);
                }
            }
        } else if (hasNblsProjectInfoCommand) { // no project packages found, may be a modular (GCN) project
            const infos: any[] = await vscode.commands.executeCommand(NBLS_PROJECT_INFO_COMMAND, uri, { projectStructure: true });
            if (infos?.length && infos[0]) {
                for (const subproject of infos[0].subprojects) { // multimodule - most likely GCN
                    await getUriSourceRootsNbls(sourceRoots, subproject, false); // false prevents deep search (OK for GCN, may need to be enabled for other projects)
                }
            }
        }
    }
}

async function getUriSourceRootsJdt(sourceRoots: string[], uri: string, _hasNblsProjectInfoCommand: boolean, api: any) {
    try {
        const settings = await api.getProjectSettings(uri, [ JDT_SETTINGS_SOURCE_PATHS ]);
        if (settings) {
            const uriSourceRoots = settings[JDT_SETTINGS_SOURCE_PATHS];
            if (uriSourceRoots) {
                // if (uriSourceRoots.length) { // found project packages
                    for (const uriSourceRoot of uriSourceRoots) {
                        if (!sourceRoots.includes(uriSourceRoot)) {
                            sourceRoots.push(uriSourceRoot);
                        }
                    }
                // } else if (hasNblsProjectInfoCommand) { // no project packages found, may be a modular (GCN) project
                //     const infos: any[] = await vscode.commands.executeCommand(NBLS_PROJECT_INFO_COMMAND, uri, { projectStructure: true });
                //     if (infos?.length && infos[0]) {
                //         for (const subproject of infos[0].subprojects) { // multimodule - most likely GCN
                //             await getUriSourceRootsNbls(sourceRoots, subproject, false); // false prevents deep search (OK for GCN, may need to be enabled for other projects)
                //         }
                //     }
                // }
            }
        }
    } catch (err) {
        // <project_folder>-parent does not exist
    }
}

// TODO: integrate with Micronaut Tools to only track packages of the selected GCN application module
export async function getPackages(workspaceFolder?: vscode.WorkspaceFolder): Promise<string[] | undefined> {
    const workspaceFolders = workspaceFolder ? [ workspaceFolder ] : vscode.workspace.workspaceFolders;
    if (!workspaceFolders?.length) { // No folder opened
        return [];
    }
    
    const commands = await vscode.commands.getCommands();
    const hasNblsProjectPackagesCommand = commands.includes(NBLS_GET_PACKAGES_COMMAND);
    const hasJdtWorkspaceCommand = commands.includes(JDT_EXECUTE_WORKSPACE_COMMAND);
    if (!hasNblsProjectPackagesCommand && !hasJdtWorkspaceCommand) {
        // TODO: wait for NBLS/JDT if installed
        return undefined; // No Java support available
    }
    
    const hasNblsProjectInfoCommand = commands.includes(NBLS_PROJECT_INFO_COMMAND);

    const packages: string[] = [];
    const getUriPackages = hasNblsProjectPackagesCommand ? getUriPackagesNbls : getUriPackagesJdt;
    for (const folder of workspaceFolders) {
        await getUriPackages(packages, folder.uri.toString(), hasNblsProjectInfoCommand);
    }
    return packages;
}

async function getUriPackagesNbls(packages: string[], uri: string, hasNblsProjectInfoCommand: boolean) {
    const uriPackages: string[] | undefined = await vscode.commands.executeCommand(NBLS_GET_PACKAGES_COMMAND, uri, true);
    if (uriPackages) {
        if (uriPackages.length) { // found project packages
            for (const uriPackage of uriPackages) {
                const wildcardPackage = uriPackage + '.*';
                if (!packages.includes(wildcardPackage)) {
                    packages.push(wildcardPackage);
                }
            }
        } else if (hasNblsProjectInfoCommand) { // no project packages found, may be a modular (GCN) project
            const infos: any[] = await vscode.commands.executeCommand(NBLS_PROJECT_INFO_COMMAND, uri, { projectStructure: true });
            if (infos?.length && infos[0]) {
                for (const subproject of infos[0].subprojects) { // multimodule - most likely GCN
                    await getUriPackagesNbls(packages, subproject, false); // false prevents deep search (OK for GCN, may need to be enabled for other projects)
                }
            }
        }
    }
}

async function getUriPackagesJdt(packages: string[], uri: string) {
    const projectEntries = await getPackageDataJdt({ kind: 2, projectUri: uri });
    for (const projectEntry of projectEntries) {
        if (projectEntry.entryKind === 1) { // source root
            const packageRoots = await getPackageDataJdt({ kind: 3, projectUri: uri, rootPath: projectEntry.path, isHierarchicalView: false });
            for (const packageRoot of packageRoots) {
                if (packageRoot.kind === 4) { // package root
                    const wildcardPackage = packageRoot.name + '.*';
                    if (!packages.includes(wildcardPackage)) {
                        packages.push(wildcardPackage);
                    }
                }
            }
        }
    }
}

async function getPackageDataJdt(params: { [key: string]: any }): Promise<any[]> {
    return await vscode.commands.executeCommand(JDT_EXECUTE_WORKSPACE_COMMAND, JDT_GET_PACKAGE_DATA, params) || [];
}
