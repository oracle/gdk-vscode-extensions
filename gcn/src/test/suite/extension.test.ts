import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import { logError } from '../../logUtils';
// import * as myExtension from '../../extension';

import * as projectUtils from '../../projectUtils';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	// Checking if the workspace has OCI project inside 
	test('Contains OCI Project', async () => {
		
		let wf = vscode.workspace.workspaceFolders;
		
		if (!wf?.length) {
			assert.throws(()=>logError("Extension host did not load any workspace fodlers!") );
		} else {
			const projectFolder = await projectUtils.getProjectFolder(wf[0]);
			console.log(projectFolder);
			/// decide based on projectFolder.projectType
		}

	});
});
