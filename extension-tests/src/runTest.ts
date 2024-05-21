/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as path from 'path';
import * as cp from 'child_process';

import { runTests, downloadAndUnzipVSCode, resolveCliArgsFromVSCodeExecutablePath } from '@vscode/test-electron';
import { AbortController } from 'node-abort-controller';

export async function runTest() {
	// BuildBot Abort controller fix
	// @ts-ignore
	global.AbortController = AbortController;

	try {
		// The folder containing the Extension Manifest package.json
		// Passed to `--extensionDevelopmentPath`
		const extensionDevelopmentPath = process.env['TEST_EXTENSION_DIR'] || path.resolve(__dirname, '../../');

		// The path to test runner
		// Passed to --extensionTestsPath
		const extensionTestsPath = path.resolve(extensionDevelopmentPath, 'out', 'test', 'suite', 'index');

		const testWorkspace = path.resolve(extensionDevelopmentPath, 'fixtures', 'base-oci-template');

		// Install NBLS extension
		const vscodeExecutablePath = await downloadAndUnzipVSCode('1.84.0');
		const [cli, ...args] = resolveCliArgsFromVSCodeExecutablePath(vscodeExecutablePath);

		let extensionList : string[] = [
			'oracle-labs-graalvm.graalvm',
		];

		// download additional extensions
		if ( process.env["MOCHA_EXTENSION_LIST"]) {
			extensionList = extensionList.concat( process.env["MOCHA_EXTENSION_LIST"].split(",") );
		}
		console.log(`Installling extensions ${extensionList} into vscode at ${vscodeExecutablePath}}`);
		for (let extensionId of extensionList) {
			cp.spawnSync(cli, [...args, '--install-extension', extensionId], {
				encoding: 'utf-8',
				stdio: 'inherit'
			});
		}
		let restArgs = process.argv.slice(process.argv.indexOf('--runTest') + 1);
		let pattern = process.env['TEST_GLOB_PATTERN'];
		if (restArgs.length) {
			// support just one glob pattern
			pattern = restArgs[0];
		}
		// Download VS Code, unzip it and run the integration test
		await runTests({
			vscodeExecutablePath,
			extensionDevelopmentPath,
			extensionTestsPath: extensionTestsPath,
			launchArgs: [testWorkspace],
			extensionTestsEnv: {
				"TEST_GLOB_PATTERN": pattern,
				"TEST_VSCODE_EXTENSION" : "true"
			}
		});
	} catch (err) {
		console.error('Failed to run tests', err);
		process.exit(1);
	}
}