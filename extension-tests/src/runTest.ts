/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as path from 'path';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as semver from 'semver';
import { globSync } from 'glob';
import Downloader from 'nodejs-file-downloader';
import { downloadJSON } from '../../common/lib/connections';
import { prepareVSCode, prepareVscodeAndExtensions } from './vscodeHelper';

import { runTests, downloadAndUnzipVSCode, resolveCliArgsFromVSCodeExecutablePath } from '@vscode/test-electron';
import { AbortController } from 'node-abort-controller';

const basePath = process.env['TEST_EXTENSION_DIR'] || process.cwd();
const downloadPath = path.resolve(basePath, 'downloadedExtensions');

/**
 * Prepares test data for test execution. Generates or copies sample projects to their appropriate locations,
 * so test suites can be run by the vscode instance. Sets up vscode instance in .vscode-test to contain the required
 * exetensions.
 * 
 * @param args testsuite glob patterns
 */
export async function prepareVscodeInstallation() : Promise<string> {
let vscodeExecutablePath;
if (!process.env['TEST_SKIP_EXTENSIONS']) {
	let extensionList : string[] = [
		'oracle-labs-graalvm.graalvm',
	];
	if ( process.env["MOCHA_EXTENSION_LIST"]) {
		extensionList.push(...extensionList.concat( process.env["MOCHA_EXTENSION_LIST"].split(",") ));
	} else if (fs.existsSync(path.resolve(basePath, '.test-extension-list'))) {
		extensionList.push(...fs.readFileSync(path.resolve(basePath, '.test-extension-list')).toString().split('\n').map(s => s.trim()).filter(s => s.length && !s.startsWith('#')));
	}
	vscodeExecutablePath = await prepareVscodeAndExtensions(extensionList);
} else {
	vscodeExecutablePath = await prepareVSCode();
}
return vscodeExecutablePath;
}

export async function runTest() {
	// BuildBot Abort controller fix
	// @ts-ignore
	global.AbortController = AbortController;

	try {
		// The folder containing the Extension Manifest package.json
		// Passed to `--extensionDevelopmentPath`
		const extensionDevelopmentPath = basePath;

		// The path to test runner
		// Passed to --extensionTestsPath
		const extensionTestsPath = path.resolve(extensionDevelopmentPath, 'out', 'test', 'suite', 'index');

		const testWorkspace = path.resolve(extensionDevelopmentPath, 'fixtures', 'base-oci-template');

		// Install NBLS extension
		const vscodeExecutablePath = await prepareVSCode();
		const [cli, ...args] = resolveCliArgsFromVSCodeExecutablePath(vscodeExecutablePath);

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
