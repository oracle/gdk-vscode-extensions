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

const MICRONAUT_TOOLS_SELECTED_SUBPROJECT_COMMAND = 'extension.micronaut-tools.navigation.getSelectedSubproject';

// TODO: integrate with Micronaut Tools to only track sources of the selected GCN application module
export async function getSourceRoots(workspaceFolder?: vscode.WorkspaceFolder): Promise<string[] | undefined>  {
    if (!vscode.workspace.workspaceFolders?.length) { // No folder opened
        return [];
    }
    
    const workspaceFolders = [];
    for (const folder of vscode.workspace.workspaceFolders) {
        if (folder === workspaceFolder) {
            workspaceFolders.unshift(folder); // monitored folder should be first so its sources take precendece
        } else {
            workspaceFolders.push(folder);
        }
    }

    const commands = await vscode.commands.getCommands();
    const hasNblsProjectSourceRootsCommand = commands.includes(NBLS_GET_SOURCE_ROOTS_COMMAND);
    const jdtApi = vscode.extensions.getExtension(JDT_EXTENSION_ID)?.exports;
    if (!hasNblsProjectSourceRootsCommand && !jdtApi?.getProjectSettings) {
        // TODO: wait for NBLS/JDT if installed
        return undefined; // No Java support available
    }

    const hasNblsProjectInfoCommand = commands.includes(NBLS_PROJECT_INFO_COMMAND);
    const hasMicronautToolsSubprojectCommand = commands.includes(MICRONAUT_TOOLS_SELECTED_SUBPROJECT_COMMAND);

    const sourceRoots: string[] = [];
    const getUriSourceRoots = hasNblsProjectSourceRootsCommand ? getUriSourceRootsNbls : getUriSourceRootsJdt;
    for (const folder of workspaceFolders) {
        await getUriSourceRoots(sourceRoots, folder, folder.uri.toString(), hasNblsProjectInfoCommand, hasMicronautToolsSubprojectCommand, jdtApi);
    }
    return sourceRoots;
}

async function getUriSourceRootsNbls(sourceRoots: string[], folder: vscode.WorkspaceFolder, uri: string, hasNblsProjectInfoCommand: boolean, hasMicronautToolsSubprojectCommand: boolean) {
    const uriSourceRoots: string[] | undefined = await vscode.commands.executeCommand(NBLS_GET_SOURCE_ROOTS_COMMAND, uri);
    if (uriSourceRoots) {
        if (uriSourceRoots.length) { // found project source roots
            for (const uriSourceRoot of uriSourceRoots) {
                const sourceRoot = vscode.Uri.parse(uriSourceRoot).fsPath;
                if (!sourceRoots.includes(sourceRoot)) {
                    sourceRoots.push(sourceRoot);
                }
            }
        } else { // no project source roots found, may be a modular (GCN) project
            let selectedSubproject: string | undefined = undefined;
            if (hasMicronautToolsSubprojectCommand) { // modules selected in Micronaut Tools should be first so their sources take precendece
                const subprojectUri = await vscode.commands.executeCommand(MICRONAUT_TOOLS_SELECTED_SUBPROJECT_COMMAND, folder);
                if (subprojectUri instanceof vscode.Uri) { // folder tracked by Micronaut Tools and module selected 
                    selectedSubproject = subprojectUri.fsPath;
                }
            }
            if (hasNblsProjectInfoCommand) {
                const infos: any[] = await vscode.commands.executeCommand(NBLS_PROJECT_INFO_COMMAND, uri, { projectStructure: true });
                if (infos?.length && infos[0]) { // multimodule - most likely GCN
                    const subprojects = [];
                    for (const subproject of infos[0].subprojects) {
                        if (vscode.Uri.parse(subproject).fsPath === selectedSubproject) { // add source roots for module selected in Micronaut Tools first
                            subprojects.unshift(subproject);
                        } else {
                            subprojects.push(subproject);
                        }
                    }
                    for (const subproject of subprojects) {
                        await getUriSourceRootsNbls(sourceRoots, folder, subproject, false, false); // false prevents deep search (OK for GCN, may need to be enabled for other projects)
                    }
                }
            }
        }
    }
}

// TODO: add support for modules/subprojects
async function getUriSourceRootsJdt(sourceRoots: string[], _folder: vscode.WorkspaceFolder, uri: string, _hasNblsProjectInfoCommand: boolean, _hasMicronautToolsSubprojectCommand: boolean, api: any) {
    try {
        const settings = await api.getProjectSettings(uri, [ JDT_SETTINGS_SOURCE_PATHS ]);
        if (settings) {
            const uriSourceRoots = settings[JDT_SETTINGS_SOURCE_PATHS];
            if (uriSourceRoots) {
                for (const uriSourceRoot of uriSourceRoots) {
                    if (!sourceRoots.includes(uriSourceRoot)) {
                        sourceRoots.push(uriSourceRoot);
                    }
                }
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
    const hasMicronautToolsSubprojectCommand = commands.includes(MICRONAUT_TOOLS_SELECTED_SUBPROJECT_COMMAND);

    const packages: string[] = [];
    const getUriPackages = hasNblsProjectPackagesCommand ? getUriPackagesNbls : getUriPackagesJdt;
    for (const folder of workspaceFolders) {
        await getUriPackages(packages, folder, folder.uri.toString(), hasNblsProjectInfoCommand, hasMicronautToolsSubprojectCommand);
    }
    return packages;
}

async function getUriPackagesNbls(packages: string[], folder: vscode.WorkspaceFolder, uri: string, hasNblsProjectInfoCommand: boolean, hasMicronautToolsSubprojectCommand: boolean) {
    const uriPackages: string[] | undefined = await vscode.commands.executeCommand(NBLS_GET_PACKAGES_COMMAND, uri, true);
    if (uriPackages) {
        if (uriPackages.length) { // found project packages
            for (const uriPackage of uriPackages) {
                const wildcardPackage = uriPackage + '.*';
                if (!packages.includes(wildcardPackage)) {
                    packages.push(wildcardPackage);
                }
            }
        } else { // no project packages found, may be a modular (GCN) project
            if (hasMicronautToolsSubprojectCommand) { // include only packages of the module selected in Micronaut Tools
                const subprojectUri = await vscode.commands.executeCommand(MICRONAUT_TOOLS_SELECTED_SUBPROJECT_COMMAND, folder);
                if (subprojectUri instanceof vscode.Uri) { // folder tracked by Micronaut Tools and module selected 
                    await getUriPackagesNbls(packages, folder, subprojectUri.toString(), false, false); // false prevents deep search (OK for GCN, may need to be enabled for other projects)
                    // TODO: include dependency subprojects (oci -> lib)?
                    return;
                }
            }
            if (hasNblsProjectInfoCommand) { // include packages from all found modules
                const infos: any[] = await vscode.commands.executeCommand(NBLS_PROJECT_INFO_COMMAND, uri, { projectStructure: true });
                if (infos?.length && infos[0]) {
                    for (const subproject of infos[0].subprojects) { // multimodule - most likely GCN
                        await getUriPackagesNbls(packages, folder, subproject, false, false); // false prevents deep search (OK for GCN, may need to be enabled for other projects)
                    }
                }
            }
        }
    }
}

// TODO: add support for modules/subprojects
async function getUriPackagesJdt(packages: string[], _folder: vscode.WorkspaceFolder, uri: string) {
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
