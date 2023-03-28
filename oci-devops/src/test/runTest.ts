import * as path from 'path';
import * as cp from 'child_process';
import * as fs from 'fs';

import { runTests, downloadAndUnzipVSCode, resolveCliArgsFromVSCodeExecutablePath } from '@vscode/test-electron';

const EXTENSION_URL : string = "https://ci-builds.apache.org/job/Netbeans/job/netbeans-vscode/lastSuccessfulBuild/artifact/java/java.lsp.server/build/"
const EXTENSION_PREFIX : string = "apache-netbeans-java-";
const STORE_EXT_DIR : string = "./ASF-NBLS-Extension";

/**
 * Retrieves the latest version of ASF NBLS extension
 * @returns 
 */
async function getNBLSExtensionVersion() : Promise<string> {
    let extensionUrl = EXTENSION_URL;

    // Check if the URL is inside env-var
    if (process.env["ASF_NBLS_VSIX_URL"]) {
        extensionUrl = process.env["ASF_NBLS_VSIX_URL"];
    }

    // Fetch the page
    const response = await fetch(extensionUrl);
    const data = await response.text()
    
    // extract version number
    let version : string = data.split(EXTENSION_PREFIX)[1].split(".vsix")[0]
    return version;
}

/**
 * Downloads ASF NBLS extension with given version number and writes it to disc
 * @param version 
 * @returns 
 */
async function downloadNBSExtension(version : string) : Promise<void> {
    // check if the extension already exists
    const extensionFilename : string = EXTENSION_PREFIX + version + ".vsix";
    if (!fs.existsSync(STORE_EXT_DIR)) {
        fs.mkdirSync(STORE_EXT_DIR, {recursive:true});
    }
    if (fs.existsSync(STORE_EXT_DIR+"/"+extensionFilename)) {
        console.log("Latest version of ASF NBLS extension already exists");
        return;
    }

    console.log("Downloading extension " + extensionFilename);
    const response = await fetch(EXTENSION_URL + extensionFilename);
    const blobFile = await response.blob();

    const buffer = Buffer.from(await blobFile.arrayBuffer());

    fs.writeFileSync(STORE_EXT_DIR+"/"+extensionFilename, buffer);
}


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
			'redhat.java',
			'oracle-labs-graalvm.graalvm-pack',
			'oracle-labs-graalvm.graalvm',
			'vscjava.vscode-java-pack',
			'vscjava.vscode-java-debug',
			'ms-kubernetes-tools.vscode-kubernetes-tools'
		];

		// check if custom ASF NBLS extension is given
		if ( process.env["NBLS_VSIX_PATH"] ) {
			extensionList.push(process.env["NBLS_VSIX_PATH"] as string);
		} else {
			const NBLSVersion = await getNBLSExtensionVersion();
			await downloadNBSExtension(NBLSVersion);
			extensionList.push(STORE_EXT_DIR + "/" + EXTENSION_PREFIX + NBLSVersion + ".vsix");
		}
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
