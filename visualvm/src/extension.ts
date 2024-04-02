/*
 * Copyright (c) 2024, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as presets from './presets'; // must be imported first
import * as view from './view';
import * as visualvm from './visualvm';
import * as nodes from './nodes';
import * as monitoredProcesses from './monitoredProcesses';
import * as download from './download';
import * as logUtils from './logUtils';


export function activate(context: vscode.ExtensionContext) {
	logUtils.registerExtensionForLogging(context);
	logUtils.logInfo('[extension] Activating extension');
	
	presets.initialize(context); // must be initialized first
	view.initialize(context);
	visualvm.initialize(context);
	nodes.initialize(context);
	monitoredProcesses.initialize(context);
	download.initialize(context);

	logUtils.logInfo('[extension] Extension activated');
}
