/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as extest from 'vscode-extension-tester';

export async function runTestUI() {
	// run UI extension tests
	try {
		// download code and chromedriver
		let exTester : extest.ExTester = new extest.ExTester('test-resources', extest.ReleaseQuality.Stable, 'test-resources/extensions');
		await exTester.downloadCode();
		await exTester.downloadChromeDriver();
		
		if (process.env['EXTESTER_EXTENSION_LIST']) {
			const extension_list : string[] = process.env['EXTESTER_EXTENSION_LIST'].split(',');
			for (let extension of extension_list) {
				exTester.installFromMarketplace(extension);
			}
		}

		// Run tests
		await exTester.runTests('**/**.ui-test.js');
	} catch (err) {
		console.error('Failed to run tests', err);
		process.exit(1);
	}
}
