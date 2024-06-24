/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import path from 'path';
import Mocha from 'mocha';
import * as vscode from 'vscode';


export async function run(): Promise<void> {
	console.log('Pre-Activating K8s extension...');
  const ext = vscode.extensions.getExtension("ms-kubernetes-tools.vscode-kubernetes-tools");
	if (ext) {
		await ext.activate();
    await new Promise((resolve) => setTimeout(resolve, 1000));
	}

  // Create the mocha test
  const mocha = new Mocha({
    ui: 'tdd',
    color: true,
    reporter: 'mochawesome',
    reporterOptions: {
      reportDir: path.join(process.cwd(), 'mochawesome-report-generator'),
      // disable overwrite to generate many JSON reports
      overwrite: true,
      // do not generate intermediate HTML reports
      html: true,
      // generate intermediate JSON reports
      json: true,
    }
  });

  return new Promise((c, e) => {
    mocha.addFile(path.join(__dirname, 'generate.test.js'));

    try {
      // Run the mocha test
      mocha.run((failures) => {
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
}
