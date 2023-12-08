/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as logUtils from '../../../common/lib/logUtils';
import * as projectUtils from './projectUtils';
import * as workspaceFolders from './workspaceFolders';
import * as targetAddress from './targetAddress';
import * as hosts from './hosts';
import * as applicationModules from './applicationModules';
import * as management from './management/management';
import * as controlPanel from './management/controlPanel';


const SUPPORTED_CONFIG_FILES = [
    '.properties',   // Java properties
    '.json',         // JavaScript JSON
    '.yml',          // Yaml -- org.yaml:snakeyaml required
    '.yaml',         // Yaml -- org.yaml:snakeyaml required
    '.toml',         // Toml -- io.micronaut.toml:micronaut-toml required
    '.groovy',       // Groovy -- io.micronaut.groovy:micronaut-runtime-groovy required
    '.conf'          // Hocon -- io.micronaut.kotlin:micronaut-kotlin-runtime required
];

export enum State {
    IDLE = 'idle',
    CONNECTING_LAUNCH = 'connecting-launch',
    CONNECTING_ATTACH = 'connecting-attach',
    CONNECTED_LAUNCH = 'connected-launch',
    CONNECTED_ATTACH = 'connected-attach',
    DISCONNECTING_LAUNCH = 'disconnecting-launch',
    DISCONNECTING_ATTACH = 'disconnecting-attach'
}
export function isConnected(state: State) {
    return state === State.CONNECTED_LAUNCH || state === State.CONNECTED_ATTACH;
}

export type OnStateChanged = (state: State, previousState: State) => void;
export type OnAliveTick = (counter: number) => void;
export type OnAddressChanged = (address: string) => void;
export type OnDefinedEnvironmentsChanged = (definedEnvironments: string[] | undefined) => void;

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
    private definedEnvironments: string[] | undefined;

    private projectInfo: projectUtils.ProjectInfo | null | undefined;
    private applicationModule: applicationModules.SelectedModule;

    private management: management.Management;
    private controlPanel: controlPanel.ControlPanel;

    constructor(folder: vscode.WorkspaceFolder) {
        this.folder = folder;
        this.applicationModule = applicationModules.forApplication(this);
        this.management = management.forApplication(this);
        this.controlPanel = controlPanel.forApplication(this);

        this.refreshModules();
    }

    getFolder(): vscode.WorkspaceFolder {
        return this.folder;
    }

    private refreshModules() {
        projectUtils.waitForProjectInfoAvailable().then(() => {
            projectUtils.getProjectInfo(this.folder.uri).then(projectInfo => {
                this.projectInfo = projectInfo;
                this.applicationModule.update(projectInfo);
            });
        }).catch(err => {
            this.projectInfo = null;
            vscode.window.showErrorMessage(err);
        });
    }
    
    getSelectedModule(): applicationModules.SelectedModule {
        return this.applicationModule;
    }

    selectModule() {
        if (this.projectInfo === undefined) {
            vscode.window.showWarningMessage('Project inspection not ready yet, try again later.');
        } else if (this.projectInfo === null) {
            vscode.window.showErrorMessage('Project inspection not available.');
        } else {
            this.applicationModule.select(this.projectInfo);
        }
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
            valueSelection: selection,
            prompt: 'Leave blank for default.'
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

    getDefinedEnvironments(): string[] | undefined {
        return this.definedEnvironments;
    }

    async configureDefinedEnvironments() {
        const folderPath = this.applicationModule.getUri()?.fsPath;
        if (folderPath) {
            const resourcesPath = path.join(folderPath, 'src', 'main', 'resources');
            this.readConfigurationFiles(resourcesPath).then(allFiles => {
                this.getConfigurationFiles(allFiles, this.definedEnvironments).then(async files => {
                    const preferredExt = this.getPreferredExtension(allFiles[1]);
                    const items: (vscode.QuickPickItem & { file: string, createForEnvironment: string | undefined })[] = [];
                    for (let i = 0; i < files.length; i++) {
                        const create = files[i][1] === '---';
                        const icon = create ? '$(new-file)' : '$(file)';
                        const action = create ? 'Create' : 'Edit';
                        const file = `${files[i][0]}${create ? preferredExt : files[i][1]}`;
                        const environment = this.definedEnvironments?.length ? `'${this.definedEnvironments[i]}'` : 'default';
                        items.push({
                            label: `${icon} ${action} ${file}`,
                            detail: `${action} ${create ? 'new' : 'existing'} configuration file for the ${environment} environment`,
                            file: file,
                            createForEnvironment: create ? environment : undefined
                        });
                    }
                    const selected = items.length === 1 ? items[0] : await vscode.window.showQuickPick(items, {
                        title: 'Configure Environment Properties',
                        placeHolder: 'Select action'
                    });
                    if (selected) {
                        const createForEnvironment = items.length === 1 ? selected.createForEnvironment : undefined;
                        this.openFile(resourcesPath, selected.file, createForEnvironment);
                    }
                })
            }).catch(err => {
                console.log(err);
            });
        }
    }

    private async openFile(resourcesPath: string, file: string, createForEnvironment?: string) {
        if (createForEnvironment) {
            const createOption = 'Create File';
            const cancelOption = 'Cancel';
            const selectedOption = await vscode.window.showInformationMessage(`Create new configuration file ${file} for the ${createForEnvironment} environment?`, createOption, cancelOption);
            if (selectedOption !== createOption) {
                return;
            }
        }
        const configFile = path.join(resourcesPath, file);
        if (!fs.existsSync(configFile)) {
            try {
                fs.closeSync(fs.openSync(configFile, 'a'));
            } catch (err) {
                console.log(err);
                return;
            }
        }
        vscode.workspace.openTextDocument(configFile).then(document => vscode.window.showTextDocument(document));
    }

    private async getConfigurationFiles(allConfigFiles: string[][], environments: string[] | undefined): Promise<string[][]> {
        const fileNames = allConfigFiles[0];
        const fileExts = allConfigFiles[1];
        const configFiles: string[][] = [];
        if (environments?.length) {
            for (const environment of environments) {
                const fileName = `application-${environment}`; // TODO: lowercase?
                const idx = fileNames.indexOf(fileName);
                const fileExt = idx >= 0 ? fileExts[idx] : '---';
                configFiles.push([fileName, fileExt]);
            }
        } else {
            const fileName = 'application';
            const idx = fileNames.indexOf(fileName);
            const fileExt = idx >= 0 ? fileExts[idx] : '---';
            configFiles.push([fileName, fileExt]);
        }
        return configFiles;
    }

    private async readConfigurationFiles(resourcesPath: string): Promise<string[][]> {
        return new Promise((resolve, reject) => {
            fs.readdir(resourcesPath, (err, files) => {
                if (err) {
                    reject(err);
                } else {
                    const fileNames: string[] = [];
                    const fileExts: string[] = [];
                    for (const file of files) {
                        if (file.startsWith('application.') || file.startsWith('application-')) {
                            const ext = path.extname(file).toLowerCase();
                            // console.log('>>> ' + ext + ' --- ' + file)
                            if (SUPPORTED_CONFIG_FILES.includes(ext)) {
                                const name = file.slice(0, -ext.length);
                                // console.log('... file ' + file + ' --- name ' + name)
                                fileNames.push(name);
                                fileExts.push(ext);
                            }
                        }
                    }
                    resolve([fileNames, fileExts]);
                }
            });
        });
    }

    private getPreferredExtension(exts: string[]): string {
        const allExtensions = this.allExtensions(exts);
        if (allExtensions.length === 1) {
            return allExtensions[0];
        } else if (allExtensions.length > 1) {
            for (const supportedExt of SUPPORTED_CONFIG_FILES) {
                if (allExtensions.includes(supportedExt)) {
                    return supportedExt;
                }
            }
        }
        return SUPPORTED_CONFIG_FILES[0];
    }

    private allExtensions(exts: string[]): string[] {
        const extensions: any = {};
        for (const ext of exts) {
            extensions[ext] = true;
        }
        return Object.keys(extensions);
    }

    async editDefinedEnvironments() {
        // const projectInfo: any = await vscode.commands.executeCommand(PROJECT_INFO, this.folder.uri.toString());
        // console.log(projectInfo)
        vscode.window.showInputBox({
            title: 'Edit Application Environments',
            placeHolder: vscode.l10n.t('Provide comma-separated environments (like \'dev,test\')'),
            value: this.definedEnvironments?.join(','),
            prompt: 'Leave blank to inherit from context.'
        }).then(address => {
            if (address !== undefined) {
                address = address.replace(/\s/g, '');
                const environments = address ? address.split(',') : [];
                if (environments.length || !this.controlPanel.isEnabled()) {
                    this.setDefinedEnvironments(environments);
                } else {
                    const defineDevOption = 'Define Environments';
                    const disableCpOption = 'Disable Control Panel';
                    const cancelOption = 'Cancel';
                    vscode.window.showWarningMessage('Micronaut Control Panel requires at least one defined environment. How to proceed?', defineDevOption, disableCpOption, cancelOption).then(selectedOption => {
                        if (selectedOption === defineDevOption) {
                            this.editDefinedEnvironments();
                        } else if (selectedOption === disableCpOption) {
                            this.controlPanel.setEnabled(false);
                            this.setDefinedEnvironments(environments);
                        }
                    });
                }
            }
        });
    }

    setDefinedEnvironments(definedEnvironments: string[] | undefined) {
        this.definedEnvironments = definedEnvironments;
        this.notifyDefinedEvironmentsChanged(this.definedEnvironments);
    }

    getState(): State {
        return this.state;
    }

    setState(state: State) {
        const previousState = this.state;
        this.state = state;
        this.notifyStateChanged(previousState);
    }

    isConnected() {
        return isConnected(this.state);
    }

    startDebugSession(runMode: projectUtils.RunMode) {
        if (this.state === State.IDLE) {
            const moduleUri = this.applicationModule.getUri();
            const buildSystem = this.projectInfo?.buildSystem;
            if (!moduleUri || !buildSystem) {
                vscode.window.showErrorMessage('Cannot run this project.');
                return;
            }
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
                // TODO: timeout connecting if starting fails?
                projectUtils.runModule(runMode, moduleUri, buildSystem).catch(err => {
                    logUtils.logError(err);
                    console.log(err);
                    this.cleanupDebugSession();
                    vscode.window.showErrorMessage('Failed to start project: ' + err);
                });
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
            this.cleanupDebugSession();
        }
    }

    private cleanupDebugSession() {
        this.debugSession = undefined;
        this.setState(State.IDLE);
        this.host?.stopMonitoring();
        this.host = undefined;
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

        if (this.definedEnvironments?.length) {
            const definedEnvironments = this.definedEnvironments.join(',');
            vmArgs.push(`-Dmicronaut.environments=${definedEnvironments}`);
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
    private readonly onDefinedEnvironmentsChangedListeners: OnDefinedEnvironmentsChanged[] = [];

    onStateChanged(listener: OnStateChanged) {
        this.onStateChangedListeners.push(listener);
    }

    onAliveTick(listener: OnAliveTick) {
        this.onAliveTickListeners.push(listener);
    }

    onAddressChanged(listener: OnAddressChanged) {
        this.onAddressChangedListeners.push(listener);
    }

    onDefinedEnvironmentsChanged(listener: OnDefinedEnvironmentsChanged) {
        this.onDefinedEnvironmentsChangedListeners.push(listener);
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

    private notifyDefinedEvironmentsChanged(definedEnvironments: string[] | undefined) {
        for (const listener of this.onDefinedEnvironmentsChangedListeners) {
            listener(definedEnvironments);
        }
    }

}

class RunCustomizer implements vscode.DebugConfigurationProvider {

    resolveDebugConfigurationWithSubstitutedVariables?(folder: vscode.WorkspaceFolder | undefined, config: vscode.DebugConfiguration, _token?: vscode.CancellationToken): vscode.ProviderResult<vscode.DebugConfiguration> {
        return new Promise<vscode.DebugConfiguration>(resolve => {
            workspaceFolders.getFolderData().then(folderData => {
                for (const data of folderData) {
                    if (data.getWorkspaceFolder() === folder) {
                        // console.log(config)
                        const vmArgs = data.getApplication().buildVmArgs();
                        // console.log('VMARGS existing ' + config.vmArgs)
                        // console.log('VMARGS updated ' + vmArgs)
                        if (vmArgs) {
                            if (!config.vmArgs) {
                                config.vmArgs = vmArgs;
                            } else {
                                config.vmArgs = `${config.vmArgs} ${vmArgs}`;
                            }
                        }
                        // console.log('>>> CONFIG:')
                        // console.log(config)
                        // resolve(config);
                        break;
                    }
                }
                resolve(config);
            });
        });
    }

}
