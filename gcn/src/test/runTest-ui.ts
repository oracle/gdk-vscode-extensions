/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as extest from 'vscode-extension-tester';

async function main() {
	// run UI extension tests
	try {
		// download code and chromedriver
		let exTester : extest.ExTester = new extest.ExTester();
		await exTester.downloadCode();
		await exTester.downloadChromeDriver();
		
		// Run tests
		await exTester.runTests('**/**.ui-test.js');
	} catch (err) {
		console.error('Failed to run tests', err);
		process.exit(1);
	}
}

main();
