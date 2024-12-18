/*
 * Copyright (c) 2023, 2024, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import Mocha from 'mocha';
import * as path from 'path';
import { findFiles } from '../../Common/helpers';
import { setGlobalDispatcher, EnvHttpProxyAgent } from 'undici';
import * as vscode from 'vscode';


export async function run(): Promise<void> {
	console.log('Pre-Activating oci-devops extension...');
  const ext2 = vscode.extensions.getExtension("ms-kubernetes-tools.vscode-kubernetes-tools");
  try {
    ext2?.activate();
  } catch (e : any) {}
	const ext = vscode.extensions.getExtension("oracle-labs-graalvm.oci-devops");
	if (ext) {
		await ext.activate();
		let commandList = await vscode.commands.getCommands();
		if (!commandList.includes('oci.devops.deployToCloud_GlobalSync')) {
			console.log('OCI extension did not activate, tests are likely to fail');
		}
	}

  let opts = {};
  if (process.env['GLOBAL_AGENT_HTTP_PROXY']) {
    opts = {
      httpProxy: process.env['GLOBAL_AGENT_HTTP_PROXY'],
      httpsProxy: process.env['GLOBAL_AGENT_HTTP_PROXY'],
      noProxy: process.env['GLOBAL_AGENT_NO_PROXY']
    };
  }

  await require('handlebars-loader');
  const dispatcher = new EnvHttpProxyAgent(opts);
  setGlobalDispatcher(dispatcher);

  await new Promise((resolve) => setTimeout(resolve, 3000));

  // Create the mocha test
  const mocha = new Mocha({
    ui: 'tdd',
    color: true,
    reporter: 'mochawesome',
    reporterOptions: {
      // disable overwrite to generate many JSON reports
      overwrite: false,
      // do not generate intermediate HTML reports
      html: true,
      // generate intermediate JSON reports
      json: true,
    },
  });
  
  // tests env variable comes from `runTest` commandline launcher. 
  // testPatterns is used in launch.json to directly launch this test runner, so the
  // expansion to test cases must be done here.
  // TODO: unify
  process.env['tests']?.split(';').forEach((file) => mocha.addFile(file));
  let pat = process.env['testPatterns'];
  if (pat) {
    let files = findFiles(__dirname, ...pat.split(';'));
    for (let d in files) {
      files[d].forEach((file) => 
        mocha.addFile(path.join(d, file))
      );
    }
  }

  return new Promise((resolve, reject) => {
    try {
      // Run the mocha test
      mocha.run((failures) => {
        if (failures > 0) {
          reject(new Error(`${failures} tests failed.`));
        } else {
          resolve();
        }
      });
    } catch (err) {
      console.error(err);
      reject(err);
    }
  });
}
