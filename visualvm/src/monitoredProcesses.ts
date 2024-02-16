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


export type OnChanged = (added: MonitoredProcess | undefined, removed: MonitoredProcess | undefined) => void;
export type OnPidChanged = () => void;

const ON_CHANGED_LISTENERS: OnChanged[] = [];
export function onChanged(listener: OnChanged) {
    ON_CHANGED_LISTENERS.push(listener);
}
function notifyChanged(added: MonitoredProcess | undefined, removed: MonitoredProcess | undefined) {
    for (const listener of ON_CHANGED_LISTENERS) {
        listener(added, removed);
    }
}

const MONITORED_PROCESSES: MonitoredProcess[] = [];
function addMonitored(process: MonitoredProcess) {
    logUtils.logInfo(`[monitoredProcess] Started tracking process ${process.displayName}@${process.id}`);
    MONITORED_PROCESSES.push(process);
    notifyChanged(process, undefined);
}
function removeMonitored(process: MonitoredProcess) {
    const index = MONITORED_PROCESSES.indexOf(process);
    if (index > -1) {
        logUtils.logInfo(`[monitoredProcess] Stopped tracking process ${process.displayName}@${process.id}`);
        MONITORED_PROCESSES.splice(index, 1);
        process.release();
        notifyChanged(undefined, process);
    }
}
function replaceMonitored(newProcess: MonitoredProcess, previousProcess: MonitoredProcess) {
    const index = MONITORED_PROCESSES.indexOf(previousProcess);
    if (index > -1) {
        logUtils.logInfo(`[monitoredProcess] Started tracking process ${newProcess.displayName}@${newProcess.id}`);
        logUtils.logInfo(`[monitoredProcess] Stopped tracking process ${previousProcess.displayName}@${previousProcess.id}`);
        MONITORED_PROCESSES.splice(index, 1, newProcess);
        previousProcess.release();
        notifyChanged(newProcess, previousProcess);
    }
}

export function initialize(context: vscode.ExtensionContext) {
    const configurationProvider = new ConfigurationProvider();
    context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('java8+', configurationProvider));
    context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('java+', configurationProvider));
    context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('java', configurationProvider));

    context.subscriptions.push(vscode.debug.onDidStartDebugSession(session => { debugSessionStarted(session); }));
    context.subscriptions.push(vscode.debug.onDidTerminateDebugSession(session => { debugSessionTerminated(session); }));

    // onChanged((added: MonitoredProcess | undefined, removed: MonitoredProcess | undefined) => {
    //     console.log('>>> --- ON CHANGED ---')
    //     console.log('>>> ADDED: ')
    //     console.log(added)
    //     if (added) {
    //         added.onPidChanged(() => {
    //             console.log('>>> --- ON PID CHANGED ---')
    //             console.log('>>> pid: ' + added.getPid())
    //         })
    //     }
    //     console.log('>>> REMOVED: ')
    //     console.log(removed)
    // });

    logUtils.logInfo('[monitoredProcess] Initialized');
}

export async function select(ignore?: MonitoredProcess[], replace?: MonitoredProcess) {
    logUtils.logInfo('[monitoredProcess] Selecting monitored process');
    const ignorePids: number[] | undefined = ignore ? [] : undefined;
    if (ignore && ignorePids) {
        for (const process of ignore) {
            const pid = process.getPid(false);
            if (pid !== undefined && pid !== null) {
                ignorePids.push(pid);
            }
        }
    }
    const selected = await runningProcesses.select(ignorePids);
    if (selected) {
        const monitoredProcess = new MonitoredProcess(selected.pid.toString(), displayName(selected.rest), selected.pid);
        if (replace) {
            logUtils.logInfo(`[monitoredProcess] Replacing original process ${replace.displayName}@${replace.id} by selected process ${monitoredProcess.displayName}@${monitoredProcess.id}`);
            replaceMonitored(monitoredProcess, replace);
        } else {
            logUtils.logInfo(`[monitoredProcess] Adding selected process ${monitoredProcess.displayName}@${monitoredProcess.id}`);
            addMonitored(monitoredProcess);
        }
    } else {
        logUtils.logInfo('[monitoredProcess] Selecting monitored process canceled');
    }
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
            removeMonitored(monitoredProcess);
            break;
        }
    }
}

export class MonitoredProcess {

    readonly id: string;
    readonly displayName: string;

    private pid: number | undefined | null = undefined;
    private session: vscode.DebugSession | undefined = undefined;

    constructor(id: string, displayName: string, pid?: number) {
        this.id = id;
        this.displayName = displayName;
        this.pid = pid;
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
                removeMonitored(this);
            }
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
                removeMonitored(this);
                // setTimeout(() => {
                //     removeMonitored(this);
                // }, 0);
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
            // TODO: display notification to select JDK / skip VisualVM support
            const jdkPath = await jdk.getPath();
            const jpsPath = jdkPath ? jdk.getJpsPath(jdkPath) : undefined;
            if (jpsPath) {
                runningProcesses.setJpsPath(jpsPath);
                // console.log('>>> ---- resolveDebugConfigurationWithSubstitutedVariables')
                const id = Date.now().toString();
                const name = displayName(folder?.name);
                const process = new MonitoredProcess(id, name);
                addMonitored(process);
                const vmArgs = `${parameters.vmArgId(id)} ${parameters.vmArgDisplayName(name)}`;
                if (!config.vmArgs) {
                    config.vmArgs = vmArgs;
                } else {
                    config.vmArgs = `${config.vmArgs} ${vmArgs}`;
                }
                // console.log(config)
            }
            resolve(config);
        });
	}

}
