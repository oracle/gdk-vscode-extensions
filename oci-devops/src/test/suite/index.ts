/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as path from 'path';
import * as Mocha from 'mocha';
import * as glob from 'glob';
import { setGlobalDispatcher, EnvHttpProxyAgent } from 'undici';
import * as vscode from 'vscode';

export async function run(): Promise<void> {
	let opts = {};

	console.log('Pre-Activating oci-devops extension...');
	const ext = vscode.extensions.getExtension("oracle-labs-graalvm.oci-devops");
	if (ext) {
		await ext.activate();
		let commandList = await vscode.commands.getCommands();
		if (!commandList.includes('oci.devops.deployToCloud_GlobalSync')) {
			console.log('OCI extension did not activate, tests are likely to fail');
		}
	}

	if (process.env['GLOBAL_AGENT_HTTP_PROXY']) {
		opts = {
			httpProxy: process.env['GLOBAL_AGENT_HTTP_PROXY'],
			httpsProxy: process.env['GLOBAL_AGENT_HTTP_PROXY'],
			noProxy: process.env['GLOBAL_AGENT_NO_PROXY']
		};
	}

	const dispatcher = new EnvHttpProxyAgent(opts);
	setGlobalDispatcher(dispatcher);

	await require('handlebars-loader');

	// Create the mocha test
	const mocha = new Mocha({
		ui: 'tdd',
		color: true,
		reporter: "mochawesome"
	});

	const testsRoot = path.resolve(__dirname, '..');
	

	const globPattern = process.env["TEST_GLOB_PATTERN"] ? process.env["TEST_GLOB_PATTERN"] : "**/*.test.js";
	console.log(globPattern);
	return new Promise((c, e) => {
		glob(globPattern, { cwd: testsRoot }, (err, files) => {
			if (err) {
				return e(err);
			}

			// Add files to the test suite
			files.forEach(f => mocha.addFile(path.resolve(testsRoot, f)));

			try {
				// Run the mocha test
				mocha.run(failures => {
					if (failures > 0) {
						e(new Error(`${failures} tests failed.`));
					} else {
						c();
					}
				});
			} catch (err) {
				console.error(err);
				e(err);
			}
		});
	});
}
