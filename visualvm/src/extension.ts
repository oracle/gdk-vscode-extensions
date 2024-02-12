/*
 * Copyright (c) 2024, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as logUtils from '../../common/lib/logUtils';
import * as view from './view';
import * as actions from './actions';
import * as installation from './installation';


export function activate(context: vscode.ExtensionContext) {
	logUtils.registerExtensionForLogging(context);
	logUtils.logInfo('[extension] Activating extension');
	
	view.initialize(context);
	actions.initialize(context);
	installation.initialize(context);

	logUtils.logInfo('[extension] Extension activated');
}
