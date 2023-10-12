/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';

export function getMicronautHome(): string {
	let micronautHome: string = vscode.workspace.getConfiguration('micronaut').get('home') as string;
	if (micronautHome) {
		return micronautHome;
	}
	micronautHome = process.env['MICRONAUT_HOME'] as string;
	return micronautHome;
}

export function getMicronautLaunchURL(): string {
	let micronautLaunchURL: string = vscode.workspace.getConfiguration('micronaut').get('launchUrl') as string;
	if (!micronautLaunchURL) {
		micronautLaunchURL = process.env['MICRONAUT_LAUNCH_URL'] as string;
	}
	if (micronautLaunchURL) {
		if (!micronautLaunchURL.startsWith('https://') && !micronautLaunchURL.startsWith('http://')) {
			micronautLaunchURL = 'https://' + micronautLaunchURL;
		}
		if (micronautLaunchURL.endsWith('/')) {
			return micronautLaunchURL.slice(0, micronautLaunchURL.length - 1);
		}
	}
	return micronautLaunchURL;
}