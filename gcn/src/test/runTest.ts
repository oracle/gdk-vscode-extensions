/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as path from 'path';
import * as cp from 'child_process';

import { runTests, downloadAndUnzipVSCode, resolveCliArgsFromVSCodeExecutablePath } from '@vscode/test-electron';

async function main() {
	try {
		// The folder containing the Extension Manifest package.json
		// Passed to `--extensionDevelopmentPath`
		const extensionDevelopmentPath = path.resolve(__dirname, '../../');

		// The path to test runner
		// Passed to --extensionTestsPath
		const extensionTestsPath = path.resolve(__dirname, './suite/index');

		const testWorkspace = path.resolve(__dirname, '../../fixtures/base-oci-template');

		// Install NBLS extension
		const vscodeExecutablePath = await downloadAndUnzipVSCode('1.76.0');
		console.log(vscodeExecutablePath);
		const [cli, ...args] = resolveCliArgsFromVSCodeExecutablePath(vscodeExecutablePath);

		let extensionList : string[] = [
			'oracle-labs-graalvm.graalvm-pack',
			'oracle-labs-graalvm.graalvm',
		];

		// check for GCN Path
		if ( process.env["GCN_VSIX_PATH"]) {
			extensionList.push(process.env["GCN_VSIX_PATH"] as string);
		}

		for (let extensionId of extensionList) {
			cp.spawnSync(cli, [...args, '--install-extension', extensionId], {
				encoding: 'utf-8',
				stdio: 'inherit'
			});
		}

		// Download VS Code, unzip it and run the integration test
		await runTests({
			vscodeExecutablePath,
			extensionDevelopmentPath,
			extensionTestsPath: extensionTestsPath,
			launchArgs: [testWorkspace]
		});
	} catch (err) {
		console.error('Failed to run tests', err);
		process.exit(1);
	}
}

main();
