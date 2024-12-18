/*
 * Copyright (c) 2020, 2024, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as path from 'path';

export class WelcomePanel {

	public static currentPanel: WelcomePanel | undefined;
	public static readonly viewType: string = 'micronautWelcome';

	private static readonly webviewsFolder: string = 'webviews';

	private readonly _panel: vscode.WebviewPanel;
	private _disposables: vscode.Disposable[] = [];

	public static createOrShow(context: vscode.ExtensionContext) {
		// If we already have a panel, show it.
		if (WelcomePanel.currentPanel) {
			WelcomePanel.currentPanel._panel.reveal();
			return;
		}
		// Otherwise, create a new panel.
		WelcomePanel.currentPanel = new WelcomePanel(context);
	}

	private constructor(context: vscode.ExtensionContext) {
		this._panel = vscode.window.createWebviewPanel(WelcomePanel.viewType, 'Micronaut Tools',
			{ viewColumn: vscode.ViewColumn.One, preserveFocus: true },
			{
				enableCommandUris: true,
				enableScripts: true,
				localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, WelcomePanel.webviewsFolder))]
			}
		);
		this._panel.iconPath = {
			light: vscode.Uri.file(path.join(context.extensionPath, WelcomePanel.webviewsFolder, 'icons', 'micronaut_light.png')),
			dark: vscode.Uri.file(path.join(context.extensionPath, WelcomePanel.webviewsFolder, 'icons', 'micronaut_dark.png'))
		};

		// Set the webview's html content
		this.setHtml(context);

		// Listen for when the panel is disposed
		// This happens when the user closes the panel or when the panel is closed programatically
		this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

		// Update the content based on view changes
		this._panel.onDidChangeViewState(
			() => {
				if (this._panel.visible) {
					this.setHtml(context);
				}
			},
			null,
			this._disposables
		);

		// Handle messages from the webview
		this._panel.webview.onDidReceiveMessage(
			message => {
				if (message.command === 'showWelcomePage') {
					vscode.workspace.getConfiguration().update('micronaut-tools.showWelcomePage', message.value, true);
				}
			},
			undefined,
			this._disposables
		);
	}

	private setHtml(context: vscode.ExtensionContext) {
		const template = require('../webviews/welcome.handlebars');
		this._panel.webview.html = template({
			cspSource: this._panel.webview.cspSource,
			showWelcomePage: vscode.workspace.getConfiguration().get<boolean>('micronaut-tools.showWelcomePage') ? 'checked' : '',
			cssUri: this._panel.webview.asWebviewUri(vscode.Uri.file(path.join(context.extensionPath, WelcomePanel.webviewsFolder, 'styles', 'welcome.css'))),
			jsUri: this._panel.webview.asWebviewUri(vscode.Uri.file(path.join(context.extensionPath, WelcomePanel.webviewsFolder, 'scripts', 'welcome.js')))
		});
	}

	public dispose() {
		WelcomePanel.currentPanel = undefined;
		// Clean up our resources
		this._panel.dispose();
		while (this._disposables.length) {
			const x = this._disposables.pop();
			if (x) {
				x.dispose();
			}
		}
	}
}
