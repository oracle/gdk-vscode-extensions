/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as logUtils from '../../../common/lib/logUtils';
import * as nodes from './nodes';
import * as applications from './applications';
import * as symbols from './symbols';
import * as targetAddress from './targetAddress';


export const COMMAND_RUN_APPLICATION = 'extension.micronaut-tools.navigation.runApplication';
export const COMMAND_RUN_DEV_APPLICATION = 'extension.micronaut-tools.navigation.runDevApplication';
export const COMMAND_DEBUG_APPLICATION = 'extension.micronaut-tools.navigation.debugApplication';
export const COMMAND_CONNECT_APPLICATION = 'extension.micronaut-tools.navigation.connectApplication';
export const COMMAND_DISCONNECT_APPLICATION = 'extension.micronaut-tools.navigation.disconnectApplication';
export const COMMAND_CANCEL_CONNECT_APPLICATION = 'extension.micronaut-tools.navigation.cancelConnectApplication';
export const COMMAND_STOP_APPLICATION = 'extension.micronaut-tools.navigation.stopApplication';
export const COMMAND_EDIT_ADDRESS = 'extension.micronaut-tools.navigation.editAddress';
export const COMMAND_CONFIGURE_ENVIRONMENTS = 'extension.micronaut-tools.navigation.configureEnvironments';
export const COMMAND_EDIT_ENVIRONMENTS = 'extension.micronaut-tools.navigation.editEnvironments';
export const COMMAND_GO_TO_DEFINITION = 'extension.micronaut-tools.navigation.goToDefinition';
export const COMMAND_NAME_GO_TO_DEFINITION = vscode.l10n.t('Go to Symbol');
export const COMMAND_OPEN_IN_BROWSER = 'extension.micronaut-tools.navigation.openInBrowser';
export const COMMAND_NAME_OPEN_IN_BROWSER = vscode.l10n.t('Open in Browser');
export const COMMAND_OPEN_APPLICATION_IN_BROWSER = 'extension.micronaut-tools.navigation.openApplicationInBrowser';
export const COMMAND_EDIT_MANAGEMENT = 'extension.micronaut-tools.navigation.editManagement';
export const COMMAND_OPEN_CONTROL_PANEL_IN_BROWSER = 'extension.micronaut-tools.navigation.openControlPanelInBrowser';
export const COMMAND_EDIT_CONTROL_PANEL = 'extension.micronaut-tools.navigation.editControlPanel';
export const COMMAND_REFRESH_SERVER = 'extension.micronaut-tools.navigation.refreshServer';
export const COMMAND_STOP_SERVER = 'extension.micronaut-tools.navigation.stopServer';
export const COMMAND_UPDATE_LOGGERS = 'extension.micronaut-tools.navigation.updateLoggers';
export const COMMAND_EDIT_LOGGERS = 'extension.micronaut-tools.navigation.editLoggers';
export const COMMAND_CLEAR_CACHES = 'extension.micronaut-tools.navigation.clearCaches';

export function initialize(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.commands.registerCommand(COMMAND_RUN_APPLICATION, (node: nodes.ApplicationFolderNode) => {
        if (node) {
            const application = node.getFolderData().getApplication();
            application.startDebugSession(applications.RunMode.RUN);
        }
	}));
    context.subscriptions.push(vscode.commands.registerCommand(COMMAND_RUN_DEV_APPLICATION, (node: nodes.ApplicationFolderNode) => {
        if (node) {
            const application = node.getFolderData().getApplication();
            application.startDebugSession(applications.RunMode.RUN_DEV);
        }
	}));
    context.subscriptions.push(vscode.commands.registerCommand(COMMAND_DEBUG_APPLICATION, (node: nodes.ApplicationFolderNode) => {
        if (node) {
            const application = node.getFolderData().getApplication();
            application.startDebugSession(applications.RunMode.DEBUG);
        }
	}));
    context.subscriptions.push(vscode.commands.registerCommand(COMMAND_CONNECT_APPLICATION, (node: nodes.ApplicationFolderNode) => {
        if (node) {
            const application = node.getFolderData().getApplication();
            application.connectToRunning();
        }
	}));
    context.subscriptions.push(vscode.commands.registerCommand(COMMAND_DISCONNECT_APPLICATION, (node: nodes.ApplicationFolderNode) => {
        if (node) {
            const application = node.getFolderData().getApplication();
            application.disconnectFromRunning();
        }
	}));
    context.subscriptions.push(vscode.commands.registerCommand(COMMAND_CANCEL_CONNECT_APPLICATION, (node: nodes.ApplicationFolderNode) => {
        if (node) {
            const application = node.getFolderData().getApplication();
            application.cancelConnecting();
        }
	}));
    context.subscriptions.push(vscode.commands.registerCommand(COMMAND_STOP_APPLICATION, (node: nodes.ApplicationFolderNode) => {
        if (node) {
            const application = node.getFolderData().getApplication();
            application.stopDebugSession();
        }
	}));
    context.subscriptions.push(vscode.commands.registerCommand(COMMAND_EDIT_ADDRESS, (node: nodes.ApplicationAddressNode) => {
        if (node) {
            node.editAddress();
        }
	}));
    context.subscriptions.push(vscode.commands.registerCommand(COMMAND_CONFIGURE_ENVIRONMENTS, (node: nodes.ApplicationEnvironmentsNode) => {
        if (node) {
            node.configureEnvironments();
        }
	}));
    context.subscriptions.push(vscode.commands.registerCommand(COMMAND_EDIT_ENVIRONMENTS, (node: nodes.ApplicationEnvironmentsNode) => {
        if (node) {
            node.editEnvironments();
        }
	}));
    context.subscriptions.push(vscode.commands.registerCommand(COMMAND_GO_TO_DEFINITION, (node: nodes.SymbolNode<symbols.Symbol>) => {
        if (node) {
		    const symbol = node.getSymbol();
            revealInEditor(symbol);
        }
	}));
    context.subscriptions.push(vscode.commands.registerCommand(COMMAND_OPEN_IN_BROWSER, (nodeOrSymbol: nodes.EndpointNode | symbols.Endpoint) => {
        if (nodeOrSymbol instanceof nodes.EndpointNode) {
            const symbol = nodeOrSymbol.getSymbol();
            openSymbolInBrowser(symbol);
        } else if (nodeOrSymbol instanceof symbols.Endpoint) {
            openSymbolInBrowser(nodeOrSymbol);
        }
	}));
    context.subscriptions.push(vscode.commands.registerCommand(COMMAND_OPEN_APPLICATION_IN_BROWSER, (node: nodes.ApplicationFolderNode) => {
        if (node) {
            openInBrowser(node.getAddress());
        }
	}));
    context.subscriptions.push(vscode.commands.registerCommand(COMMAND_EDIT_MANAGEMENT, (node: nodes.ApplicationMonitoringNode) => {
        if (node) {
            node.toggleEnabled();
        }
	}));
    context.subscriptions.push(vscode.commands.registerCommand(COMMAND_OPEN_CONTROL_PANEL_IN_BROWSER, (node: nodes.ApplicationControlPanelNode) => {
        if (node) {
            openInBrowser(node.getAddress());
        }
	}));
    context.subscriptions.push(vscode.commands.registerCommand(COMMAND_EDIT_CONTROL_PANEL, (node: nodes.ApplicationControlPanelNode) => {
        if (node) {
            node.toggleEnabled();
        }
	}));
    context.subscriptions.push(vscode.commands.registerCommand(COMMAND_REFRESH_SERVER, (node: nodes.ApplicationFolderNode) => {
        if (node) {
            const application = node.getFolderData().getApplication();
            application.getManagement().getRefreshEndpoint().refresh();
        }
	}));
    context.subscriptions.push(vscode.commands.registerCommand(COMMAND_STOP_SERVER, (node: nodes.ApplicationFolderNode) => {
        if (node) {
            const application = node.getFolderData().getApplication();
            application.getManagement().getServerStopEndpoint().stopServer();
        }
	}));
    context.subscriptions.push(vscode.commands.registerCommand(COMMAND_UPDATE_LOGGERS, (node: nodes.ManagementLoggersNode) => {
        if (node) {
            node.updateLoggers();
        }
	}));
    context.subscriptions.push(vscode.commands.registerCommand(COMMAND_EDIT_LOGGERS, (node: nodes.ManagementLoggersNode) => {
        if (node) {
            node.editLoggers();
        }
	}));
    context.subscriptions.push(vscode.commands.registerCommand(COMMAND_CLEAR_CACHES, (node: nodes.ManagementCachesNode) => {
        if (node) {
            node.clearCaches();
        }
	}));
    logUtils.logInfo('[actions] Initialized');
}

async function revealInEditor(symbol: symbols.Symbol): Promise<vscode.TextEditor> {
    return vscode.window.showTextDocument(symbol.uri, {
        preview: false,
        selection: new vscode.Range(symbol.startPos, symbol.endPos)
    });
}

async function openSymbolInBrowser(symbol: symbols.Endpoint): Promise<boolean> {
    const address = await targetAddress.getEndpointAddress(symbol, COMMAND_NAME_OPEN_IN_BROWSER);
    if (address) {
        return openInBrowser(address);
    } else {
        return false;
    }
}

async function openInBrowser(address: string): Promise<boolean> {
    const uri = vscode.Uri.parse(address);
    return vscode.env.openExternal(uri);
}
