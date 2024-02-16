/*
 * Copyright (c) 2024, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as view from './view';
import * as actions from './actions';
import * as visualvm from './visualvm';
import * as monitoredProcesses from './monitoredProcesses';
import * as nodes from './nodes';
import * as logUtils from '../../common/lib/logUtils';


export function activate(context: vscode.ExtensionContext) {
	logUtils.registerExtensionForLogging(context);
	logUtils.logInfo('[extension] Activating extension');
	
	view.initialize(context);
	actions.initialize(context);
	visualvm.initialize(context);
	monitoredProcesses.initialize(context);
	nodes.initialize(context);

	logUtils.logInfo('[extension] Extension activated');
}
