/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as logUtils from '../../../common/lib/logUtils';
import * as workspaceFolders from './workspaceFolders';
import * as targetAddress from './targetAddress';
import * as hosts from './hosts';
// import * as rest from './rest';
import * as management from './management/management';
import * as controlPanel from './management/controlPanel';


export enum RunMode {
    RUN = 'java.project.run',
    RUN_DEV = 'java.project.run',
    DEBUG = 'java.project.debug'
}

export enum State {
    IDLE = 'idle',
    CONNECTING_LAUNCH = 'connecting-launch',
    CONNECTING_ATTACH = 'connecting-attach',
    CONNECTED_LAUNCH = 'connected-launch',
    CONNECTED_ATTACH = 'connected-attach',
    DISCONNECTING_LAUNCH = 'disconnecting-launch',
    DISCONNECTING_ATTACH = 'disconnecting-attach'
}

export type OnStateChanged = (state: State, previousState: State) => void;
export type OnAliveTick = (counter: number) => void;
export type OnAddressChanged = (address: string) => void;

export function initialize(context: vscode.ExtensionContext) {
    const runCustomizer = new RunCustomizer();
    context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('java+', runCustomizer));
    context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('java8+', runCustomizer));
    context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('java', runCustomizer));

    context.subscriptions.push(vscode.debug.onDidStartDebugSession((session: vscode.DebugSession) => {
        workspaceFolders.getFolderData().then(folderData => {
            for (const data of folderData) {
                if (data.getWorkspaceFolder() === session.workspaceFolder) {
                    data.getApplication().registerDebugSession(session);
                    break;
                }
            }
        });
    }));
    context.subscriptions.push(vscode.debug.onDidTerminateDebugSession((session: vscode.DebugSession) => {
        workspaceFolders.getFolderData().then(folderData => {
            for (const data of folderData) {
                if (data.getWorkspaceFolder() === session.workspaceFolder) {
                    data.getApplication().unregisterDebugSession(session);
                    break;
                }
            }
        });
    }));
    logUtils.logInfo('[applications] Initialized');
}

export class Application {

    private static readonly LOCAL_HEARTBEAT_RATE = 1000;
    private static readonly LOCAL_HEARTBEAT_TIMEOUT = 1000;
    private static readonly LOCAL_HEARTBEAT_TIMEOUT_LAUNCH = 300;
    private static readonly REMOTE_HEARTBEAT_RATE = 3000;
    private static readonly REMOTE_HEARTBEAT_TIMEOUT = 5000;

    private folder: vscode.WorkspaceFolder;
    private state: State = State.IDLE;
    private debugSession: vscode.DebugSession | undefined;
    private host: hosts.Host | undefined;

    private management: management.Management;
    private controlPanel: controlPanel.ControlPanel;

    constructor(folder: vscode.WorkspaceFolder) {
        this.folder = folder;
        this.management = management.forApplication(this);
        this.controlPanel = controlPanel.forApplication(this);
    }

    getFolder(): vscode.WorkspaceFolder {
        return this.folder;
    }

    getAddress(): string {
        return targetAddress.getBaseAddress(this.folder.uri);
    }

    getPlainAddress(): string {
        return targetAddress.getPlainAddress(this.getAddress());
    }

    async editAddress(preselectPort: boolean = false) {
        const address = this.getAddress();
        const selection: [number, number] | undefined = preselectPort ? [address.lastIndexOf(':') + 1, address.length] : undefined;
        vscode.window.showInputBox({
            title: 'Edit Application Address',
            placeHolder: vscode.l10n.t('Provide address of the application ({0})', targetAddress.SETTING_TARGET_ADDRESS_DEFAULT),
            value: address,
            valueSelection: selection
        }).then(address => {
            if (address !== undefined) {
                this.setAddress(address);
            }
        });
    }

    setAddress(address: string) {
        address = targetAddress.normalizeAddress(address);
        targetAddress.saveAddress(this.folder.uri, address).then(() => {
            this.notifyAddressChanged(address);
        });
    }

    isLocal(): boolean {
        return targetAddress.isLocal(this.getAddress());
    }

    isSSL(): boolean {
        return targetAddress.getProtocol(this.getAddress()) === 'https';
    }

    getPort(): number {
        return targetAddress.getPort(this.getAddress());
    }

    getState(): State {
        return this.state;
    }

    setState(state: State) {
        const previousState = this.state;
        this.state = state;
        this.notifyStateChanged(previousState);

        // if (state === State.CONNECTED_ATTACH || state === State.CONNECTED_LAUNCH) {
        //     // const address = `https://${this.getPlainAddress()}/stop`;
        //     const address = `${this.getAddress()}/stop`;
        //     console.log('>>> GET for ' + address)
        //     rest.getData(address).then(response => {
        //         console.log('>>> RESPONSE')
        //         console.log(response)
        //     }).catch(err => {
        //         console.log('>>> ERROR')
        //         console.log(err)
        //     });
        // }
    }

    startDebugSession(runMode: RunMode) {
        if (this.state === State.IDLE) {
            this.setState(State.CONNECTING_LAUNCH);
            const address = this.getPlainAddress();
            const host = hosts.forAddress(address);
            host.isReachable(Application.LOCAL_HEARTBEAT_TIMEOUT_LAUNCH).then(async reachable => {
                if (reachable) {
                    const changePortOption = 'Change Port';
                    const startOption = 'Start Anyway';
                    const cancelOption = 'Cancel';
                    const selected = await vscode.window.showWarningMessage(`Another process is already running on ${address}.`, changePortOption, startOption, cancelOption);
                    if (selected !== startOption) {
                        this.setState(State.IDLE);
                        if (selected === changePortOption) {
                            this.editAddress(true);
                        }
                        return;
                    }
                }
                vscode.commands.executeCommand(runMode, this.folder.uri);
            });
        }
    }

    stopDebugSession() {
        if (this.debugSession) {
            this.setState(State.DISCONNECTING_LAUNCH);
            vscode.debug.stopDebugging(this.debugSession);
        }
    }

    registerDebugSession(session: vscode.DebugSession) {
        if (this.state === State.IDLE || this.state === State.CONNECTING_LAUNCH) {
            if (this.state !== State.CONNECTING_LAUNCH) {
                this.setState(State.CONNECTING_LAUNCH);
            }
            this.host = hosts.forAddress(this.getPlainAddress());
            this.host.onReachable(count => {
                if (count === 1) {
                    this.setState(State.CONNECTED_LAUNCH);
                }
                this.notifyAliveTick(count);
            });
            this.host.onUnreachable(() => {
                if (this.state === State.CONNECTED_LAUNCH) {
                    this.setState(State.CONNECTING_LAUNCH);
                }
                // TODO: ask to terminate DebugSession if count > N?
            });
            this.host.startMonitoring(Application.LOCAL_HEARTBEAT_RATE, Application.LOCAL_HEARTBEAT_TIMEOUT);
            this.debugSession = session;
        }
    }

    unregisterDebugSession(session: vscode.DebugSession) {
        if (this.debugSession === session) {
            this.debugSession = undefined;
            this.setState(State.IDLE);
            this.host?.stopMonitoring();
            this.host = undefined;
        }
    }

    getDebugSession(): vscode.DebugSession | undefined {
        return this.debugSession;
    }

    connectToRunning() {
        if (this.state === State.IDLE) {
            this.setState(State.CONNECTING_ATTACH);
            this.host = hosts.forAddress(this.getPlainAddress());
            this.host.onReachable(count => {
                if (count === 1) {
                    this.setState(State.CONNECTED_ATTACH);
                }
                this.notifyAliveTick(count);
            });
            this.host.onUnreachable(() => {
                if (this.state === State.CONNECTED_ATTACH) {
                    this.setState(State.CONNECTING_ATTACH);
                }
                // TODO: ask to terminate DebugSession if count > N?
            });
            const isLocal = this.isLocal();
            const rate = isLocal ? Application.LOCAL_HEARTBEAT_RATE : Application.REMOTE_HEARTBEAT_RATE;
            const timeout = isLocal ? Application.LOCAL_HEARTBEAT_TIMEOUT : Application.REMOTE_HEARTBEAT_TIMEOUT;
            this.host.startMonitoring(rate, timeout);
        }
    }

    disconnectFromRunning() {
        if (this.state === State.CONNECTED_ATTACH) {
            this.setState(State.DISCONNECTING_ATTACH);
            this.host?.stopMonitoring();
            this.host = undefined;
            this.setState(State.IDLE);
        }
    }

    cancelConnecting() {
        if (this.state === State.CONNECTING_ATTACH) {
            this.setState(State.DISCONNECTING_ATTACH);
            this.host?.stopMonitoring();
            this.host = undefined;
            this.setState(State.IDLE);
        }
    }

    buildVmArgs(): string | undefined {
        const vmArgs: string[] = [];

        if (this.isSSL()) {
            vmArgs.push(`-Dmicronaut.ssl.enabled=true -Dmicronaut.server.ssl.buildSelfSigned=true -Dmicronaut.server.ssl.port=${this.getPort()}`);
        } else {
            vmArgs.push(`-Dmicronaut.server.port=${this.getPort()}`);
        }

        const managementVmArgs = this.management.buildVmArgs();
        if (managementVmArgs) {
            vmArgs.push(managementVmArgs);
        }

        const controlPanelVmArgs = this.controlPanel.buildVmArgs();
        if (controlPanelVmArgs) {
            vmArgs.push(controlPanelVmArgs);
        }

        return vmArgs.length ? vmArgs.join(' ') : undefined;
    }

    getManagement(): management.Management {
        return this.management;
    }

    getControlPanel(): controlPanel.ControlPanel {
        return this.controlPanel;
    }

    private readonly onStateChangedListeners: OnStateChanged[] = [];
    private readonly onAliveTickListeners: OnAliveTick[] = [];
    private readonly onAddressChangedListeners: OnAddressChanged[] = [];

    onStateChanged(listener: OnStateChanged) {
        this.onStateChangedListeners.push(listener);
    }

    onAliveTick(listener: OnAliveTick) {
        this.onAliveTickListeners.push(listener);
    }

    onAddressChanged(listener: OnAddressChanged) {
        this.onAddressChangedListeners.push(listener);
    }

    private notifyStateChanged(previousState: State) {
        for (const listener of this.onStateChangedListeners) {
            listener(this.state, previousState);
        }
    }

    private notifyAliveTick(count: number) {
        for (const listener of this.onAliveTickListeners) {
            listener(count);
        }
    }

    private notifyAddressChanged(address: string) {
        for (const listener of this.onAddressChangedListeners) {
            listener(address);
        }
    }

}

class RunCustomizer implements vscode.DebugConfigurationProvider {

    resolveDebugConfiguration(folder: vscode.WorkspaceFolder | undefined, config: vscode.DebugConfiguration, _token?: vscode.CancellationToken): vscode.ProviderResult<vscode.DebugConfiguration> {
        return new Promise<vscode.DebugConfiguration>(resolve => {
            workspaceFolders.getFolderData().then(folderData => {
                for (const data of folderData) {
                    if (data.getWorkspaceFolder() === folder) {
                        const vmArgs = data.getApplication().buildVmArgs();
                        if (vmArgs) {
                            if (!config.vmArgs) {
                                config.vmArgs = vmArgs;
                            } else {
                                config.vmArgs = `${config.vmArgs} ${vmArgs}`;
                            }
                        }
                        console.log('>>> CONFIG:')
                        console.log(config)
                        // resolve(config);
                        break;
                    }
                }
                resolve(config);
            });
        });
    }

    // resolveDebugConfigurationWithSubstitutedVariables?(_folder: vscode.WorkspaceFolder | undefined, config: vscode.DebugConfiguration, _token?: vscode.CancellationToken): vscode.ProviderResult<vscode.DebugConfiguration> {
    //     return new Promise<vscode.DebugConfiguration>(resolve => {
    //         if (handleProjectProcess) {
    //             const displayName: string = defineDisplayName();
    //             const attach: string = attachVisualVM();
    //             const vmArgs = `${displayName} ${attach}`;
    //             if (!config.vmArgs) {
    //                 config.vmArgs = vmArgs;
    //             } else {
    //                 config.vmArgs = `${config.vmArgs} ${vmArgs}`;
    //             }
    //         }
    //         resolve(config);
    //     });
    // }

}
