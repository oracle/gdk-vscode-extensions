/*
 * Copyright (c) 2024, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as jdk from './jdk';
// import * as logUtils from '../../common/lib/logUtils';


const USE_JDK_PATH_FOR_STARTUP_KEY = 'visualvm.startup.useJdkPathForVisualvm';
const STARTUP_PARAMETERS_KEY = 'visualvm.startup.visualvmParameters';
const WINDOW_TO_FRONT_KEY = 'visualvm.behavior.visualvmWindowToFront';
const PRESELECT_VIEW_KEY = 'visualvm.behavior.preselectProcessView';

export function executable(executable: string): string {
    return executable.includes(' ') ? `"${executable}"` : executable;
}

export function perfMaxStringConstLength(): string {
    return '-J-XX:PerfMaxStringConstLength=6144'
}

export async function jdkHome(): Promise<string | undefined> {
    if (vscode.workspace.getConfiguration().get<boolean>(USE_JDK_PATH_FOR_STARTUP_KEY)) {
        const jdkPath = await jdk.getPath(true);
        if (!jdkPath) {
            throw new Error();
        }
        return `--jdkhome ${jdkPath}`;
    }
    return undefined;
}

export function windowToFront(): string {
    return '--window-to-front';
}

export function windowToFrontConditional(): string | undefined {
    if (vscode.workspace.getConfiguration().get<boolean>(WINDOW_TO_FRONT_KEY)) {
        return windowToFront();
    }
    return undefined;
}

export function userDefinedParameters(): string | undefined {
    return vscode.workspace.getConfiguration().get<string>(STARTUP_PARAMETERS_KEY);
}

export function openPid(pid: number): string {
    const view = vscode.workspace.getConfiguration().get<string>(PRESELECT_VIEW_KEY);
    function viewIndex(view: string | undefined): number {
        switch (view) {
            case 'Overview': return 1;
            case 'Monitor': return 2;
            case 'Threads': return 3;
            case 'Sampler': return 4;
            default: return 0;
        }
    }
    const index = viewIndex(view);
    const param = index ? `${pid}@${index}` : `${pid}`;
    return `--openpid ${param}`;
}

export function threadDump(pid: number): string {
    return `--threaddump ${pid.toString()}`;
}

export function heapDump(pid: number): string {
    return `--heapdump ${pid.toString()}`;
}



export function vmArgId(id: string): string {
    return `-Dvisualvm.id=#${id}`;
}

export function vmArgDisplayName(displayName: string): string {
    displayName = displayName.replace(/\s/g, '_');
    return `-Dvisualvm.display.name=${displayName}`;
}
