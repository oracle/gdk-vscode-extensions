/*
 * Copyright (c) 2024, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as process from 'process';
import * as jdk from './jdk';
import * as parameters from './parameters';
import * as runningProcesses from './runningProcesses';
import * as logUtils from '../../common/lib/logUtils';


export const AUTO_SELECT_PROJECT_PROCESS_KEY = 'visualvm-integration.integration.automaticallySelectProjectProcess';
export const CUSTOMIZE_PROJECT_PROCESS_DISPLAYNAME_KEY = 'visualvm-integration.integration.customizeDisplayNameForProjectProcess';

export type OnChanged = (added: MonitoredProcess | undefined, removed: MonitoredProcess | undefined, target: any | undefined) => void;
export type OnPidChanged = () => void;

const ON_CHANGED_LISTENERS: OnChanged[] = [];
export function onChanged(listener: OnChanged) {
    ON_CHANGED_LISTENERS.push(listener);
}
function notifyChanged(added: MonitoredProcess | undefined, removed: MonitoredProcess | undefined, target?: any) {
    for (const listener of ON_CHANGED_LISTENERS) {
        listener(added, removed, target);
    }
}

export function initialize(context: vscode.ExtensionContext) {
    const configurationProvider = new ConfigurationProvider();
    context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('java8+', configurationProvider));
    context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('java+', configurationProvider));
    context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('java', configurationProvider));

    context.subscriptions.push(vscode.debug.onDidStartDebugSession(session => { debugSessionStarted(session); }));
    context.subscriptions.push(vscode.debug.onDidTerminateDebugSession(session => { debugSessionTerminated(session); }));

    logUtils.logInfo('[monitoredProcess] Initialized');
}

const MONITORED_PROCESSES: MonitoredProcess[] = [];

export function add(running: runningProcesses.RunningProcess, target?: any): MonitoredProcess | undefined {
    logUtils.logInfo(`[monitoredProcess] Adding running process ${running.displayName}@${running.pid}`);
    const monitoredRunning = getPids();
    if (!monitoredRunning.includes(running.pid)) {
        const monitoredProcess = new MonitoredProcess(running.pid.toString(), running.displayName, undefined, running.pid);
        return addMonitored(monitoredProcess, target);
    } else {
        logUtils.logWarning(`[monitoredProcess] Process already tracked: ${running.displayName}@${running.pid}`);
        return undefined;
    }
}

function addMonitored(monitored: MonitoredProcess, target?: any): MonitoredProcess {
    logUtils.logInfo(`[monitoredProcess] Started tracking process ${monitored.displayName}@${monitored.id}`);
    MONITORED_PROCESSES.push(monitored);
    notifyChanged(monitored, undefined, target);
    return monitored;
}

export function remove(monitored: MonitoredProcess, target?: any): MonitoredProcess | undefined {
    logUtils.logInfo(`[monitoredProcess] Removing monitored process ${monitored.displayName}@${monitored.id}`);
    const index = MONITORED_PROCESSES.indexOf(monitored);
    if (index > -1) {
        logUtils.logInfo(`[monitoredProcess] Stopped tracking process ${monitored.displayName}@${monitored.id}`);
        MONITORED_PROCESSES.splice(index, 1);
        monitored.release();
        notifyChanged(undefined, monitored, target);
        return monitored;
    } else {
        logUtils.logWarning(`[monitoredProcess] Process not tracked: ${monitored.displayName}@${monitored.id}`);
        return undefined;
    }
}

export function getPids(): number[] {
    const pids: number[] = [];
    for (const process of MONITORED_PROCESSES) {
        const pid = process.getPid();
        if (pid !== undefined && pid !== null) {
            pids.push(pid);
        }
    }
    return pids;
}

function debugSessionStarted(session: vscode.DebugSession) {
    const vmArgs = session.configuration.vmArgs;
    if (vmArgs) {
        for (const monitoredProcess of MONITORED_PROCESSES) {
            const id = parameters.vmArgId(monitoredProcess.id);
            if (vmArgs.includes(id)) {
                logUtils.logInfo(`[monitoredProcess] Session started for process ${monitoredProcess.displayName}@${monitoredProcess.id}`);
                monitoredProcess.sessionStarted(session);
                break;
            }
        }
    }
}

function debugSessionTerminated(session: vscode.DebugSession) {
    for (const monitoredProcess of MONITORED_PROCESSES) {
        if (monitoredProcess.isSession(session)) {
            logUtils.logInfo(`[monitoredProcess] Session terminated for process ${monitoredProcess.displayName}@${monitoredProcess.id}`);
            remove(monitoredProcess);
            break;
        }
    }
}

export class MonitoredProcess {

    readonly id: string;
    readonly displayName: string;
    readonly workspaceFolder: vscode.WorkspaceFolder | undefined;

    readonly isManuallySelected: boolean;

    private pid: number | undefined | null = undefined;
    private session: vscode.DebugSession | undefined = undefined;

    constructor(id: string, displayName: string, workspaceFolder?: vscode.WorkspaceFolder, pid?: number) {
        this.id = id;
        this.displayName = displayName;
        this.workspaceFolder = workspaceFolder;
        this.pid = pid;
        this.isManuallySelected = pid !== undefined;
    }

    isSession(session: vscode.DebugSession) {
        return this.session === session;
    }

    sessionStarted(session: vscode.DebugSession) {
        this.session = session;
        if (this.pid === undefined) {
            const onFound = (pid: number) => {
                this.pid = pid;
                this.notifyPidChanged();
                logUtils.logInfo(`[monitoredProcess] Found running process ${this.displayName}@${this.id}: pid=${pid}`);
            };
            const onTimeout = () => {
                logUtils.logInfo(`[monitoredProcess] Timed out waiting for process ${this.displayName}@${this.id}`);
                remove(this);
            };
            runningProcesses.searchByParameter(parameters.vmArgId(this.id), onFound, onTimeout);
        }
    }

    getPid(interactive: boolean = true): number | undefined | null { // undefined - not discovered yet, null - terminated
        if (this.pid) {
            try {
                process.kill(this.pid, 0);
            } catch (err) {
                logUtils.logInfo(`[monitoredProcess] Detected terminated process ${this.displayName}@${this.id}`);
                this.release();
                if (interactive) {
                    vscode.window.showWarningMessage(`Process ${this.displayName} already terminated.`);
                }
                // Must be delayed to not break iterating MONITORED_PROCESSES[].getPid() 
                setTimeout(() => { remove(this); }, 0);
            }
        }
        return this.pid;
    }

    release() {
        if (this.pid !== null) {
            logUtils.logInfo(`[monitoredProcess] Releasing process ${this.displayName}@${this.id}`);
            if (this.pid === undefined) {
                runningProcesses.stopSearching(parameters.vmArgId(this.id));
            }
            this.pid = null;
            this.notifyPidChanged();
            this.ON_PID_CHANGED_LISTENERS.length = 0;
        }
        this.session = undefined;
    }

    private ON_PID_CHANGED_LISTENERS: OnPidChanged[] = [];
    onPidChanged(listener: OnPidChanged) {
        this.ON_PID_CHANGED_LISTENERS.push(listener);
    }
    private notifyPidChanged() {
        for (const listener of this.ON_PID_CHANGED_LISTENERS) {
            listener();
        }
    }

}

function displayName(displayName: string | undefined): string {
    return displayName = displayName || 'VS Code Project';
}

class ConfigurationProvider implements vscode.DebugConfigurationProvider {

    resolveDebugConfiguration/*WithSubstitutedVariables?*/(folder: vscode.WorkspaceFolder | undefined, config: vscode.DebugConfiguration, _token?: vscode.CancellationToken): vscode.ProviderResult<vscode.DebugConfiguration> {
        return new Promise(async resolve => {
            const name = displayName(folder?.name);
            const vmArgs: string[] = [];
            if (vscode.workspace.getConfiguration().get<boolean>(CUSTOMIZE_PROJECT_PROCESS_DISPLAYNAME_KEY)) {
                vmArgs.push(parameters.vmArgDisplayName(name));
            }
            if (vscode.workspace.getConfiguration().get<boolean>(AUTO_SELECT_PROJECT_PROCESS_KEY)) {
                // TODO: display notification to select JDK / skip VisualVM support?
                const jdkPath = await jdk.getPath();
                const jpsPath = jdkPath ? jdk.getJpsPath(jdkPath) : undefined;
                if (jpsPath) {
                    runningProcesses.setJpsPath(jpsPath);
                    const id = Date.now().toString();
                    const process = new MonitoredProcess(id, name, folder);
                    addMonitored(process);
                    vmArgs.push(parameters.vmArgId(id));
                }
            }
            if (vmArgs) {
                if (!config.vmArgs) {
                    config.vmArgs = vmArgs.join(' ');
                } else {
                    config.vmArgs = `${config.vmArgs} ${vmArgs.join(' ')}`;
                }
            }
            resolve(config);
        });
	}

}
