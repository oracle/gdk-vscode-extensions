/*
 * Copyright (c) 2024, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as view from './view';
import * as installation from './installation';
import * as logUtils from '../../common/lib/logUtils';


export const COMMAND_SELECT_INSTALLATION = 'visualvm.selectInstallation';
export const NAME_SELECT_INSTALLATION = 'Select Local VisualVM Installation';
export const COMMAND_MOVE_VIEW = 'visualvm.moveView';
export const NAME_MOVE_VIEW = 'Move VisualVM View';

export function initialize(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.commands.registerCommand(COMMAND_SELECT_INSTALLATION, () => {
        installation.select();
	}));
    context.subscriptions.push(vscode.commands.registerCommand(COMMAND_MOVE_VIEW, (viewId?: string) => {
        view.move(viewId);
	}));
    logUtils.logInfo('[actions] Initialized');
}
