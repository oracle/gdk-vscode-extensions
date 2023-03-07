import * as path from 'path';
import * as cp from 'child_process'

import { runTests, downloadAndUnzipVSCode, resolveCliArgsFromVSCodeExecutablePath } from '@vscode/test-electron';
import * as assert from 'assert';

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
		const vscodeExecutablePath = await downloadAndUnzipVSCode('1.75.1');
		console.log(vscodeExecutablePath);
		const [cli, ...args] = resolveCliArgsFromVSCodeExecutablePath(vscodeExecutablePath);

		let extensionList : string[] = [
			'asf.apache-netbeans-java',
			'redhat.java',
			'oracle-labs-graalvm.graalvm-pack',
			'oracle-labs-graalvm.graalvm',
			'vscjava.vscode-java-pack',
			'vscjava.vscode-java-debug'
			// Path to GCN VSIX
			//'C:/users/stevo/downloads/gcn-0.0.1-215.vsix'
		];

		// check if custom ASF NBLS extension is given
		if ( process.env["NBLS_VSIX_PATH"] ) {
			extensionList.push(process.env["NBLS_VSIX_PATH"]);
		} else {
			extensionList.push('asf.apache-netbeans-java');
		}
		// check for GCN Path
		if ( process.env["GCN_VSIX_PATH"]) {
			extensionList.push(process.env["GCN_VSIX_PATH"]);
		} else {
			assert.fail("Cannot find GCN VSIX path. Environment variable `GCN_VSIX_PATH` not set.");
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
