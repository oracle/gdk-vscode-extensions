/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as workspaceFolders from './workspaceFolders';
import * as applications from './applications';
import * as symbols from './symbols';
import * as actions from './actions';
import * as targetAddress from './targetAddress';
import * as formatters from './formatters';
import * as management from './management/management';
import * as environmentEndpoint from './management/environmentEndpoint';
import * as healthEndpoint from './management/healthEndpoint';
import * as metricsEndpoint from './management/metricsEndpoint';
import * as loggersEndpoint from './management/loggersEndpoint';
import * as cachesEndpoint from './management/cachesEndpoint';


export type TreeChanged = (treeItem?: vscode.TreeItem, expand?: boolean) => void;

export class BaseNode extends vscode.TreeItem {

    parent: BaseNode | undefined;
    children: BaseNode[] | undefined | null;

    constructor(label: string, description: string | undefined, contextValue: string | undefined, children: BaseNode[] | undefined | null, expanded: boolean | undefined) {
        super(label);
        this.description = description;
        this.contextValue = contextValue;
        this.setChildren(children);
        if (!children || expanded === undefined) {
            this.collapsibleState = vscode.TreeItemCollapsibleState.None;
        } if (expanded === true) {
            this.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
        } else if (expanded === false) {
            this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
        }
    }

    public setChildren(children: BaseNode[] | undefined | null) {
        if (this.children) {
            for (const child of this.children) {
                child.parent = undefined;
            }
        }
        this.children = children;
        if (this.children) {
            for (const child of this.children) {
                child.parent = this;
            }
        }
    }

    public getChildren(): BaseNode[] | undefined {
        return this.children ? this.children : undefined;
    }

    public removeFromParent(treeChanged?: TreeChanged): boolean {
        const parent = this.parent;
        if (parent) {
            this.parent = undefined;
            if (parent.removeChild(this)) {
                if (treeChanged) {
                    treeChanged(parent);
                }
                return true;
            }
        }
        return false;
    }

    removeChild(child: BaseNode): boolean {
        if (this.children) {
            const idx = this.children.indexOf(child);
            if (idx >= 0) {
                this.children.splice(idx, 1);
                return true;
            }
        }
        return false;
    }

}

export class TextNode extends BaseNode {

    constructor(text: string, contextValue?: string) {
        super('', text, contextValue ? contextValue : 'textNode', undefined, undefined);
        this.tooltip = `${this.description}`;
    }

}

export class NoItemsNode extends TextNode {

    constructor(subject?: string) {
        super(subject ? vscode.l10n.t('No {0}', subject) : vscode.l10n.t('No items'));
    }

}

export class LoadingNode extends TextNode {

    constructor(subject?: string) {
        super(subject ? vscode.l10n.t('loading {0}...', subject) : vscode.l10n.t('loading...'));
    }

}

export abstract class SymbolNode<T extends symbols.Symbol> extends BaseNode {

    private readonly symbol: T;
    private readonly icon: string;
    private readonly baseContext: string;
    private readonly baseTooltip: string;

    protected constructor(name: string, detail: string | undefined, tooltip: string | undefined, icon: string, context: string, symbol: T) {
        super(name, detail, context, undefined, undefined);
        this.tooltip = tooltip;
        this.icon = icon;
        this.iconPath = new vscode.ThemeIcon(icon);
        this.symbol = symbol;
        this.baseContext = context;
        this.baseTooltip = tooltip || '';
        this.command = {
            title: actions.COMMAND_NAME_GO_TO_DEFINITION,
            command: actions.COMMAND_GO_TO_DEFINITION,
            arguments: [ this ]
        };
    }

    getSymbol(): T {
        return this.symbol;
    }

    setRuntimeStatus(disabledReasons: string[] | null | undefined) {
        if (disabledReasons === undefined) { // symbol not reported during runtime or app finished
            this.iconPath = new vscode.ThemeIcon(this.icon);
            this.contextValue = this.baseContext;
            this.tooltip = this.baseTooltip;
        } else if (disabledReasons === null) { // management feature not available (yet)
            this.iconPath = new vscode.ThemeIcon(this.icon);
            this.contextValue = this.baseContext + '.unknown.';
            this.tooltip = this.baseTooltip;
        } else if (!disabledReasons.length) { // symbol available during runtime
            this.iconPath = new vscode.ThemeIcon(this.icon, new vscode.ThemeColor('charts.green'));
            this.contextValue = this.baseContext + '.available.';
            this.tooltip = `${this.baseTooltip}\n\u2714 Available in the running application`;
        } else { // symbol disabled during runtime
            this.iconPath = new vscode.ThemeIcon(this.icon, new vscode.ThemeColor('charts.orange'));
            this.contextValue = this.baseContext + '.disabled.';
            this.tooltip = `${this.baseTooltip}\n\u2716 Disabled in the running application:`;
            for (const reason of disabledReasons) {
                this.tooltip += `\n \u25CF ${reason}`;
            }
        }
    }

}

export class BeanNode extends SymbolNode<symbols.Bean> {

    private static readonly CONTEXT = 'extension.micronaut-tools.navigation.BeanNode';
    private static readonly ICON = 'json';

    private constructor(name: string, detail: string | undefined, tooltip: string | undefined, bean: symbols.Bean) {
        super(name, detail, tooltip, BeanNode.ICON, BeanNode.CONTEXT, bean);
    }

    static create(bean: symbols.Bean) {
        return new BeanNode(bean.name, undefined, bean.description, bean);
    }

}

export class EndpointNode extends SymbolNode<symbols.Endpoint> {

    private static readonly CONTEXT = 'extension.micronaut-tools.navigation.EndpointNode';
    private static readonly ICON = 'link';

    private constructor(name: string, detail: string | undefined, tooltip: string | undefined, endpoint: symbols.Endpoint) {
        super(name, detail, tooltip, EndpointNode.ICON, `${EndpointNode.CONTEXT}.${endpoint.type}`, endpoint);
    }

    static create(endpoint: symbols.Endpoint) {
        return new EndpointNode(endpoint.name, endpoint.type.toString(), endpoint.description, endpoint);
    }

}

export class ApplicationFolderNode extends BaseNode {

    private static readonly BASE_CONTEXT = 'extension.micronaut-tools.navigation.ApplicationFolderNode';

    private readonly folderData: workspaceFolders.FolderData;

    constructor(folder: workspaceFolders.FolderData, _iconsFolder: vscode.Uri, treeChanged: TreeChanged) {
        super(folder.getWorkspaceFolder().name, undefined, ApplicationFolderNode.BASE_CONTEXT, [], true);
        const children: BaseNode[] = [
            new ApplicationAddressNode(folder.getApplication(), treeChanged),
            new ApplicationEnvironmentsNode(folder.getApplication(), treeChanged),
            new ApplicationMonitoringNode(folder.getApplication(), treeChanged),
            new ApplicationControlPanelNode(folder.getApplication(), treeChanged)
        ];
        if (folder.getApplication().getModule()) {
            children.unshift(new ApplicationModuleNode(folder.getApplication(), treeChanged));
        }
        this.setChildren(children);
        this.tooltip = folder.getWorkspaceFolder().uri.fsPath;
        this.folderData = folder;
        // this.iconPath = vscode.Uri.joinPath(iconsFolder, 'micronaut.png');

        this.updateIcon();
        this.updateContext();

        const application = this.folderData.getApplication();
        application.onAddressChanged(() => {
            this.updateIcon();
            this.updateContext();
            treeChanged(this);
        });
        application.onStateChanged(() => {
            this.updateIcon();
            this.updateContext();
            treeChanged(this);
        });
        application.getManagement().onFeaturesAvailableChanged((refreshAvailable, serverStopAvailable) => {
            this.updateContext(refreshAvailable, serverStopAvailable);
            treeChanged(this);
        });
    }

    getFolderData(): workspaceFolders.FolderData {
        return this.folderData;
    }

    getAddress() {
        return this.folderData.getApplication().getAddress();
    }

    private updateIcon() {
        const application = this.folderData.getApplication();
        const local = application.isLocal();
        const state = application.getState().toString();
        switch (state) {
            case applications.State.CONNECTING_LAUNCH:
            case applications.State.CONNECTING_ATTACH:
                this.iconPath = new vscode.ThemeIcon('loading~spin'); break;
            case applications.State.CONNECTED_LAUNCH:
            case applications.State.CONNECTED_ATTACH:
                this.iconPath = new vscode.ThemeIcon(local ? 'circle-large-filled' : 'circle-large', new vscode.ThemeColor('charts.green')); break;
            case applications.State.DISCONNECTING_LAUNCH:
            case applications.State.DISCONNECTING_ATTACH:
                this.iconPath = new vscode.ThemeIcon('loading~spin'); break;
            default:
                this.iconPath = new vscode.ThemeIcon(local ? 'circle-large-filled' : 'circle-large');
        }

    }

    private updateContext(refreshAvailable?: boolean, serverStopAvailable?: boolean) {
        const application = this.folderData.getApplication();
        const location = targetAddress.isLocal(application.getAddress()) ? 'local' : 'remote';
        const state = application.getState().toString();
        let contextValue = `${ApplicationFolderNode.BASE_CONTEXT}.${location}.${state}.`;
        if (refreshAvailable) {
            contextValue += 'refreshable.';
        }
        if (serverStopAvailable) {
            contextValue += 'serverStoppable.';
        }
        this.contextValue = contextValue;
    }

}

export class ApplicationModuleNode extends BaseNode {

    private static readonly BASE_CONTEXT = 'extension.micronaut-tools.navigation.ApplicationModuleNode';

    private readonly application: applications.Application;

    constructor(application: applications.Application, treeChanged: TreeChanged) {
        super('Subproject:', application.getModule() || 'application', ApplicationModuleNode.BASE_CONTEXT, null, undefined);
        this.tooltip = 'Subproject of the GCN application';
        this.application = application;

        this.updateContext(this.application.getState());
        this.application.onStateChanged(state => {
            this.updateContext(state);
            treeChanged(this);
        });
        this.application.onModuleChanged(module => {
            this.description = module;
            treeChanged(this);
        });
    }

    editModule() {
        this.application.editModule();
    }

    private updateContext(state: applications.State) {
        this.contextValue = `${ApplicationModuleNode.BASE_CONTEXT}.${state}.`;
    }

}

export class ApplicationAddressNode extends BaseNode {

    private static readonly BASE_CONTEXT = 'extension.micronaut-tools.navigation.ApplicationAddressNode';

    private readonly application: applications.Application;

    constructor(application: applications.Application, treeChanged: TreeChanged) {
        super('Address:', '...', ApplicationAddressNode.BASE_CONTEXT, null, undefined);
        this.application = application;

        this.updateContext(this.application.getState());
        this.application.onStateChanged(state => {
            this.updateAddress();
            this.updateContext(state);
            treeChanged(this);
        });
        this.updateAddress(application.getAddress());
        this.application.onAddressChanged(address => {
            this.updateAddress(address);
            treeChanged(this);
        });
    }

    editAddress() {
        this.application.editAddress();
    }

    private updateContext(state: applications.State) {
        this.contextValue = `${ApplicationAddressNode.BASE_CONTEXT}.${state}.`;
    }

    private updateAddress(address?: string)  {
        address = address || this.application.getAddress();
        this.description = address;
        if (this.application.getState() === applications.State.IDLE) {
            if (this.application.isLocal()) {
                this.tooltip = 'Address to launch local or connect to externally started local/remote application';
            } else {
                this.tooltip = 'Address to connect to externally started local/remote application';
            }
        } else {
            this.tooltip = `Address of the running application`;
        }
    }

}

export class ApplicationEnvironmentsNode extends BaseNode {

    private static readonly BASE_CONTEXT = 'extension.micronaut-tools.navigation.ApplicationEnvironmentsNode';

    private readonly application: applications.Application;

    constructor(application: applications.Application, treeChanged: TreeChanged) {
        super('Environments:', '...', ApplicationEnvironmentsNode.BASE_CONTEXT, null, undefined);
        this.tooltip = 'Application environments';
        this.application = application;

        this.application.onStateChanged(() => {
            this.update();
            treeChanged(this);
        });
        this.application.onDefinedEnvironmentsChanged(() => {
            this.update();
            treeChanged(this);
        });
        
        const environment = this.application.getManagement().getEnvironmentEndpoint();
        environment.onAvailableChanged(() => {
            this.update();
            treeChanged(this);
        });
        environment.onUpdated(data => {
            this.update(data);
            treeChanged(this);
        });

        this.update();
    }

    configureEnvironments() {
        this.application.configureDefinedEnvironments();
    }

    editEnvironments() {
        this.application.editDefinedEnvironments();
    }

    private update(data?: any) {
        const environment = this.application.getManagement().getEnvironmentEndpoint();
        switch (this.application.getState()) {
            case applications.State.CONNECTED_LAUNCH:
            case applications.State.CONNECTED_ATTACH:
                switch (environment.isAvailable()) {
                    case true:
                        if (data) {
                            const activeEnvironments = environmentEndpoint.activeEnvironments(data);
                            this.description = activeEnvironments?.length ? activeEnvironments.join(',') : 'default';
                            this.tooltip = 'Environments active in the running application';
                            this.contextValue = ApplicationEnvironmentsNode.BASE_CONTEXT + '.available.';
                        }
                        break;
                    case false:
                        this.description = 'unknown';
                        this.tooltip = 'Cannot determine environments active in the running application';
                        this.contextValue = ApplicationEnvironmentsNode.BASE_CONTEXT + '.unavailable.';
                        break;
                    default:
                        this.description = '...';
                        this.tooltip = 'Determining environments active in the running application...';
                        this.contextValue = ApplicationEnvironmentsNode.BASE_CONTEXT + '.updating.';
                }
                break;
            case applications.State.CONNECTING_LAUNCH:
            case applications.State.CONNECTING_ATTACH:
            case applications.State.DISCONNECTING_LAUNCH:
            case applications.State.DISCONNECTING_ATTACH:
                this.description = '...';
                this.tooltip = 'Determining environments active in the running application...';
                this.contextValue = ApplicationEnvironmentsNode.BASE_CONTEXT + '.updating.';
                break;
            default:
                const definedEnvironments = this.application.getDefinedEnvironments();
                if (definedEnvironments?.length) {
                    this.description = definedEnvironments.join(',');
                } else {
                    this.description = 'inherited';
                }
                this.tooltip = 'Environments to be active in the launched application';
                this.contextValue = ApplicationEnvironmentsNode.BASE_CONTEXT + '.idle.';
        }
    }

}

export class ApplicationMonitoringNode extends BaseNode {

    private static readonly BASE_CONTEXT = 'extension.micronaut-tools.navigation.ApplicationMonitoringNode';

    private readonly application: applications.Application;

    constructor(application: applications.Application, treeChanged: TreeChanged) {
        super('Monitoring & Management:', '...', ApplicationMonitoringNode.BASE_CONTEXT, null, undefined);
        this.application = application;

        this.application.onStateChanged(() => {
            this.update();
            treeChanged(this);
        });
        
        const management = this.application.getManagement();
        management.onEnabledChanged(() => {
            this.update();
            treeChanged(this);
        });
        management.onAvailableChanged(() => {
            this.update();
            treeChanged(this);
        });

        this.update();
    }
    
    toggleEnabled() {
        const management = this.application.getManagement();
        management.setEnabled(!management.isEnabled());
    }

    private update() {
        const management = this.application.getManagement();
        switch (this.application.getState()) {
            case applications.State.CONNECTED_LAUNCH:
            case applications.State.CONNECTED_ATTACH:
                switch (management.isAvailable()) {
                    case true:
                        this.description = 'available';
                        this.tooltip = 'Monitoring and management capabilities available in the running application:';
                        if (management.getBeansEndpoint().isAvailable()) {
                            this.tooltip += `\n \u25CF Beans endpoint (${management.getBeansEndpoint().relativeAddress})`;
                        }
                        if (management.getCachesEndpoint().isAvailable()) {
                            this.tooltip += `\n \u25CF Caches endpoint (${management.getCachesEndpoint().relativeAddress})`;
                        }
                        if (management.getEnvironmentEndpoint().isAvailable()) {
                            this.tooltip += `\n \u25CF Environment endpoint (${management.getEnvironmentEndpoint().relativeAddress})`;
                        }
                        if (management.getHealthEndpoint().isAvailable()) {
                            this.tooltip += `\n \u25CF Health endpoint (${management.getHealthEndpoint().relativeAddress})`;
                        }
                        if (management.getLoggersEndpoint().isAvailable()) {
                            this.tooltip += `\n \u25CF Loggers endpoint (${management.getLoggersEndpoint().relativeAddress})`;
                        }
                        if (management.getMetricsEndpoint().isAvailable()) {
                            this.tooltip += `\n \u25CF Metrics endpoint (${management.getMetricsEndpoint().relativeAddress})`;
                        }
                        if (management.getRefreshEndpoint().isAvailable()) {
                            this.tooltip += `\n \u25CF Refresh endpoint (${management.getRoutesEndpoint().relativeAddress})`;
                        }
                        if (management.getRoutesEndpoint().isAvailable()) {
                            this.tooltip += `\n \u25CF Routes endpoint (${management.getRoutesEndpoint().relativeAddress})`;
                        }
                        if (management.getServerStopEndpoint().isAvailable()) {
                            this.tooltip += `\n \u25CF Server stop endpoint (${management.getServerStopEndpoint().relativeAddress})`;
                        }
                        this.contextValue = ApplicationMonitoringNode.BASE_CONTEXT + '.available.';
                        break;
                    case false:
                        this.description = 'not available';
                        this.tooltip = 'Monitoring and management capabilities not available in the running application';
                        this.contextValue = ApplicationMonitoringNode.BASE_CONTEXT + '.unavailable.';
                        break;
                    default:
                        this.description = '...';
                        this.tooltip = 'Determining monitoring and management capabilities of the running application...';
                        this.contextValue = ApplicationMonitoringNode.BASE_CONTEXT + '.updating.';
                }
                break;
            case applications.State.CONNECTING_LAUNCH:
            case applications.State.CONNECTING_ATTACH:
            case applications.State.DISCONNECTING_LAUNCH:
            case applications.State.DISCONNECTING_ATTACH:
                this.description = '...';
                this.tooltip = 'Determining monitoring and management capabilities of the running application...';
                this.contextValue = ApplicationMonitoringNode.BASE_CONTEXT + '.updating.';
                break;
            default:
                this.description = management.isEnabled() ? 'enabled' : 'inherited';
                this.tooltip = 'Monitoring and management capabilities for the launched application';
                this.contextValue = ApplicationMonitoringNode.BASE_CONTEXT + '.idle.';
        }
    }

}

export class ApplicationControlPanelNode extends BaseNode {

    private static readonly BASE_CONTEXT = 'extension.micronaut-tools.navigation.ApplicationControlPanelNode';

    private readonly application: applications.Application;

    constructor(application: applications.Application, treeChanged: TreeChanged) {
        super('Micronaut Control Panel:', '...', ApplicationControlPanelNode.BASE_CONTEXT, null, undefined);
        this.application = application;

        this.application.onStateChanged(() => {
            this.update();
            treeChanged(this);
        });
        
        const controlPanel = this.application.getControlPanel();
        controlPanel.onEnabledChanged(() => {
            this.update();
            treeChanged(this);
        });
        controlPanel.onAvailableChanged(() => {
            this.update();
            treeChanged(this);
        });

        this.update();
    }

    getAddress() {
        return this.application.getControlPanel().getAddress();
    }

    toggleEnabled() {
        const controlPanel = this.application.getControlPanel();
        controlPanel.setEnabled(!controlPanel.isEnabled());
    }

    private update() {
        const controlPanel = this.application.getControlPanel();
        switch (this.application.getState()) {
            case applications.State.CONNECTED_LAUNCH:
            case applications.State.CONNECTED_ATTACH:
                switch (controlPanel.isAvailable()) {
                    case true:
                        this.description = 'available';
                        this.tooltip = 'Micronaut Control Panel available in the running application';
                        this.contextValue = ApplicationControlPanelNode.BASE_CONTEXT + '.available.';
                        break;
                    case false:
                        this.description = 'not available';
                        this.tooltip = 'Micronaut Control Panel not available in the running application';
                        this.contextValue = ApplicationControlPanelNode.BASE_CONTEXT + '.unavailable.';
                        break;
                    default:
                        this.description = '...';
                        this.tooltip = 'Determining Micronaut Control Panel availability in the running application...';
                        this.contextValue = ApplicationControlPanelNode.BASE_CONTEXT + '.updating.';
                }
                break;
            case applications.State.CONNECTING_LAUNCH:
            case applications.State.CONNECTING_ATTACH:
            case applications.State.DISCONNECTING_LAUNCH:
            case applications.State.DISCONNECTING_ATTACH:
                this.description = '...';
                this.tooltip = 'Determining Micronaut Control Panel availability in the running application...';
                this.contextValue = ApplicationControlPanelNode.BASE_CONTEXT + '.updating.';
                break;
            default:
                this.description = controlPanel.isEnabled() ? 'enabled' : 'inherited';
                this.tooltip = 'Micronaut Control Panel availability for the launched application';
                this.contextValue = ApplicationControlPanelNode.BASE_CONTEXT + '.idle.';
        }
    }

}

export class BeansFolderNode extends BaseNode {

    private static readonly CONTEXT = 'extension.micronaut-tools.navigation.BeansFolderNode';
    private static readonly SUBJECT = vscode.l10n.t('beans');

    private readonly folderData: workspaceFolders.FolderData;

    constructor(folder: workspaceFolders.FolderData, treeChanged: TreeChanged) {
        super(folder.getWorkspaceFolder().name, undefined, BeansFolderNode.CONTEXT, [ new LoadingNode(BeansFolderNode.SUBJECT) ], true);
        this.tooltip = folder.getWorkspaceFolder().uri.fsPath;
        this.folderData = folder;
        folder.onUpdated((kind: string[], beans: symbols.Bean[], _endpoints: symbols.Endpoint[]) => {
            if (symbols.isBeanKind(kind)) {
                this.reloadSymbol(beans, this.folderData.getApplication().getManagement().getBeansEndpoint().getRuntimeBeans() || [], treeChanged);
            }
        });
        // let lastRuntimeCount: number = 0;
        this.folderData.getApplication().getManagement().getBeansEndpoint().onBeansResolved(beans => {
            // if (beans.length !== lastRuntimeCount) {
            //     lastRuntimeCount = beans.length;
                this.updateRuntimeStatus(beans, this.getChildren() || [], treeChanged);
            // }
        });
    }

    private reloadSymbol(beans: symbols.Bean[], runtimeBeans: symbols.Bean[] | null | undefined, treeChanged: TreeChanged) {
        const children: BaseNode[] = [];
        for (const bean of beans) {
            const beanNode = BeanNode.create(bean);
            children.push(beanNode);
        }
        if (children.length) {
            this.updateRuntimeStatus(runtimeBeans, children, undefined);
        } else {
            children.push(new NoItemsNode(BeansFolderNode.SUBJECT));
        }
        this.setChildren(children);
        treeChanged(this);
    }

    private updateRuntimeStatus(runtimeBeans: symbols.Bean[] | null | undefined, children: BaseNode[], treeChanged: TreeChanged | undefined) {
        if (children.length) {
            const runtimeBeansMap: any = {};
            if (runtimeBeans) {
                for (const runtimeBean of runtimeBeans) {
                    runtimeBeansMap[runtimeBean.name] = (runtimeBean as any).disabledReasons || [];
                }
            }
            for (const child of children) {
                if (child instanceof BeanNode) {
                    const status: string[] | null | undefined = runtimeBeans ? runtimeBeansMap[child.getSymbol().name] : runtimeBeans;
                    (child as BeanNode).setRuntimeStatus(status);
                }
            }
            if (treeChanged) {
                treeChanged(this);
            }
        }
    }

    getFolderData(): workspaceFolders.FolderData {
        return this.folderData;
    }

}

export class EndpointsFolderNode extends BaseNode {

    private static readonly CONTEXT = 'extension.micronaut-tools.navigation.EndpointsFolderNode';
    private static readonly SUBJECT = vscode.l10n.t('endpoints');

    private readonly folderData: workspaceFolders.FolderData;

    constructor(folder: workspaceFolders.FolderData, treeChanged: TreeChanged) {
        super(folder.getWorkspaceFolder().name, undefined, EndpointsFolderNode.CONTEXT, [ new LoadingNode(EndpointsFolderNode.SUBJECT) ], true);
        this.tooltip = folder.getWorkspaceFolder().uri.fsPath;
        this.folderData = folder;
        folder.onUpdated((kind: string[], _beans: symbols.Bean[], endpoints: symbols.Endpoint[]) => {
            if (symbols.isEndpointKind(kind)) {
                this.reloadSymbol(endpoints, this.folderData.getApplication().getManagement().getRoutesEndpoint().getRuntimeEndpoints() || [], treeChanged);
            }
        });
        this.folderData.getApplication().onStateChanged(state => {
            this.updateRuntimeStatus(applications.isConnected(state) ? null : undefined, this.getChildren() || [], treeChanged);
            // if (state === applications.State.CONNECTED_LAUNCH || state === applications.State.CONNECTED_ATTACH) { // connected
            //     setTimeout(() => {
            //         if (!this.folderData.getApplication().getManagement().getRoutesEndpoint().isAvailable()) {
            //             this.reloadRuntimeSymbol(null, this.getChildren() || [], treeChanged);
            //         }
            //     }, 150);
            // } else if (previousState === applications.State.CONNECTED_LAUNCH || previousState === applications.State.CONNECTED_ATTACH) { // disconnected
            //     this.reloadRuntimeSymbol(undefined, this.getChildren() || [], treeChanged);
            // }
        });
        // this.folderData.getApplication().getManagement().getRoutesEndpoint().onAvailableChanged(available => {
        //     console.log('>>> ENDPOINTS AVAILABLE: ' + available)
        // });
        // let lastRuntimeCount: number = 0;
        this.folderData.getApplication().getManagement().getRoutesEndpoint().onEndpointsResolved(endpoints => {
            // if (endpoints.length > 0 || lastRuntimeCount !== 0) {
            //     lastRuntimeCount = endpoints.length;
            if (endpoints) {
                this.updateRuntimeStatus(endpoints, this.getChildren() || [], treeChanged);
            }
            // }
        });
    }

    private reloadSymbol(endpoints: symbols.Endpoint[], runtimeEndpoints: symbols.Endpoint[] | null | undefined, treeChanged: TreeChanged) {
        const children: BaseNode[] = [];
        for (const endpoint of endpoints) {
            const beanNode = EndpointNode.create(endpoint);
            children.push(beanNode);
        }
        if (children.length) {
            this.updateRuntimeStatus(runtimeEndpoints, children, undefined);
        } else {
            children.push(new NoItemsNode(EndpointsFolderNode.SUBJECT));
        }
        this.setChildren(children);
        treeChanged(this);
    }

    private updateRuntimeStatus(runtimeEndpoints: symbols.Endpoint[] | null | undefined, children: BaseNode[], treeChanged: TreeChanged | undefined) {
        if (children.length) {
            const runtimeEndpointsMap: any = {};
            if (runtimeEndpoints) {
                for (const runtimeEndpoint of runtimeEndpoints) {
                    runtimeEndpointsMap[EndpointsFolderNode.endpointID(runtimeEndpoint)] = true;
                }
            }
            for (const child of children) {
                if (child instanceof EndpointNode) {
                    const status: string[] | null | undefined = runtimeEndpoints ? runtimeEndpointsMap[EndpointsFolderNode.endpointID(child.getSymbol())] : runtimeEndpoints;
                    (child as EndpointNode).setRuntimeStatus(status);
                }
            }
            if (treeChanged) {
                treeChanged(this);
            }
        }
    }

    getFolderData(): workspaceFolders.FolderData {
        return this.folderData;
    }

    static endpointID(endpoint: symbols.Endpoint): string {
        return `${endpoint.name}|${endpoint.type.toString()}`;
    }

}

export class ManagementFolderNode extends BaseNode {

    private static readonly CONTEXT = 'extension.micronaut-tools.navigation.ManagementFolderNode';

    // private readonly folderData: workspaceFolders.FolderData;

    constructor(folder: workspaceFolders.FolderData, treeChanged: TreeChanged) {
        super(folder.getWorkspaceFolder().name, undefined, ManagementFolderNode.CONTEXT, [], true);
        this.tooltip = folder.getWorkspaceFolder().uri.fsPath;
        // this.folderData = folder;

        const management = folder.getApplication().getManagement();
        const monitoringNode = new MonitoringNode(management, treeChanged);
        const managementNode = new ManagementNode(management, treeChanged);
        this.setChildren([ monitoringNode, managementNode ]);
    }

    // getFolderData(): workspaceFolders.FolderData {
    //     return this.folderData;
    // }

}

export class MonitoringNode extends BaseNode {

    private static readonly CONTEXT = 'extension.micronaut-tools.navigation.MonitoringNode';

    constructor(management: management.Management, treeChanged: TreeChanged) {
        super('Monitoring', undefined, MonitoringNode.CONTEXT, [], true);
        this.tooltip = 'Application monitoring';

        const uptimeNode = new MonitoringUptimeNode(management.getMetricsEndpoint(), treeChanged);
        const cpuNode = new MonitoringCpuNode(management.getMetricsEndpoint(), treeChanged);
        const heapNode = new MonitoringHeapNode(management.getMetricsEndpoint(), treeChanged);
        const nonheapNode = new MonitoringNonHeapNode(management.getMetricsEndpoint(), treeChanged);
        const diskSpaceNode = new MonitoringDiskSpaceNode(management.getHealthEndpoint(), treeChanged);
        this.setChildren([ uptimeNode, cpuNode, heapNode, nonheapNode, diskSpaceNode ]);
    }

}

export class MonitoringCpuNode extends BaseNode {

    private static readonly CONTEXT = 'extension.micronaut-tools.navigation.MonitoringCpuNode';

    constructor(endpoint: metricsEndpoint.MetricsEndpoint, treeChanged: TreeChanged) {
        super('CPU:', 'n/a', MonitoringCpuNode.CONTEXT, null, undefined);
        this.tooltip = 'Cpu';
        endpoint.onAvailableChanged(available => {
            switch (available) {
                case false:
                    this.description = 'n/a';
                    // this.tooltip = 'Process uptime: data not available';
                    treeChanged(this);
                    break;
                case undefined:
                    this.description = '...';
                    // this.tooltip = 'Process uptime: waiting for data...';
                    treeChanged(this);
            }
        })
        endpoint.onUpdated(data => {
            const processCpu = Number.parseFloat(data[metricsEndpoint.PROCESS_CPU].measurements[0].value);
            const systemCpu = Number.parseFloat(data[metricsEndpoint.SYSTEM_CPU].measurements[0].value);
            this.description = `${formatters.formatPercent(processCpu)} process, ${formatters.formatPercent(systemCpu)} system`;
            // this.tooltip = `Disk space: ${free.toLocaleString()} B free of ${total.toLocaleString()} B total`;
            treeChanged(this);
        });
    }

}

export class MonitoringHeapNode extends BaseNode {

    private static readonly CONTEXT = 'extension.micronaut-tools.navigation.MonitoringHeapNode';

    constructor(endpoint: metricsEndpoint.MetricsEndpoint, treeChanged: TreeChanged) {
        super('Heap:', 'n/a', MonitoringHeapNode.CONTEXT, null, undefined);
        this.tooltip = 'Heap';
        endpoint.onAvailableChanged(available => {
            switch (available) {
                case false:
                    this.description = 'n/a';
                    // this.tooltip = 'Process uptime: data not available';
                    treeChanged(this);
                    break;
                case undefined:
                    this.description = '...';
                    // this.tooltip = 'Process uptime: waiting for data...';
                    treeChanged(this);
            }
        })
        endpoint.onUpdated(data => {
            const heapUsed = Number.parseInt(data[metricsEndpoint.MEMORY_USED_HEAP].measurements[0].value);
            const heapMax = Number.parseInt(data[metricsEndpoint.MEMORY_MAX_HEAP].measurements[0].value);
            this.description = `${formatters.formatBytes(heapUsed)} used, ${formatters.formatBytes(heapMax)} max`;
            // this.tooltip = `Disk space: ${free.toLocaleString()} B free of ${total.toLocaleString()} B total`;
            treeChanged(this);
        });
    }

}

export class MonitoringNonHeapNode extends BaseNode {

    private static readonly CONTEXT = 'extension.micronaut-tools.navigation.MonitoringNonHeapNode';

    constructor(endpoint: metricsEndpoint.MetricsEndpoint, treeChanged: TreeChanged) {
        super('Non Heap:', 'n/a', MonitoringNonHeapNode.CONTEXT, null, undefined);
        this.tooltip = 'Non heap';
        endpoint.onAvailableChanged(available => {
            switch (available) {
                case false:
                    this.description = 'n/a';
                    // this.tooltip = 'Process uptime: data not available';
                    treeChanged(this);
                    break;
                case undefined:
                    this.description = '...';
                    // this.tooltip = 'Process uptime: waiting for data...';
                    treeChanged(this);
            }
        })
        endpoint.onUpdated(data => {
            const heapUsed = Number.parseInt(data[metricsEndpoint.MEMORY_USED_NONHEAP].measurements[0].value);
            const heapMax = Number.parseInt(data[metricsEndpoint.MEMORY_MAX_NONHEAP].measurements[0].value);
            this.description = `${formatters.formatBytes(heapUsed)} used, ${formatters.formatBytes(heapMax)} max`;
            // this.tooltip = `Disk space: ${free.toLocaleString()} B free of ${total.toLocaleString()} B total`;
            treeChanged(this);
        });
    }

}

export class MonitoringUptimeNode extends BaseNode {

    private static readonly CONTEXT = 'extension.micronaut-tools.navigation.MonitoringUptimeNode';

    constructor(endpoint: metricsEndpoint.MetricsEndpoint, treeChanged: TreeChanged) {
        super('Uptime:', 'n/a', MonitoringUptimeNode.CONTEXT, null, undefined);
        this.tooltip = 'Process uptime';
        endpoint.onAvailableChanged(available => {
            switch (available) {
                case false:
                    this.description = 'n/a';
                    // this.tooltip = 'Process uptime: data not available';
                    treeChanged(this);
                    break;
                case undefined:
                    this.description = '...';
                    // this.tooltip = 'Process uptime: waiting for data...';
                    treeChanged(this);
            }
        })
        endpoint.onUpdated(data => {
            const uptime = Number.parseInt(data[metricsEndpoint.PROCESS_UPTIME].measurements[0].value);
            this.description = `${formatters.formatTime(uptime)}`;
            // this.tooltip = `Disk space: ${free.toLocaleString()} B free of ${total.toLocaleString()} B total`;
            treeChanged(this);
        });
    }

}

export class MonitoringDiskSpaceNode extends BaseNode {

    private static readonly CONTEXT = 'extension.micronaut-tools.navigation.MonitoringDiskSpaceNode';

    constructor(endpoint: healthEndpoint.HealthEndpoint, treeChanged: TreeChanged) {
        super('Disk:', 'n/a', MonitoringDiskSpaceNode.CONTEXT, null, undefined);
        this.tooltip = 'Disk space';
        endpoint.onAvailableChanged(available => {
            switch (available) {
                case false:
                    this.description = 'n/a';
                    // this.tooltip = 'Disk space: data not available';
                    treeChanged(this);
                    break;
                case undefined:
                    this.description = '...';
                    // this.tooltip = 'Disk space: waiting for data...';
                    treeChanged(this);
            }
        })
        endpoint.onUpdated(data => {
            if (data.details?.diskSpace) {
                if (data.details.diskSpace.details.error) {
                    this.description = 'low free space (below threshold)';
                } else {
                    const free = Number.parseInt(data.details.diskSpace.details.free);
                    const total = Number.parseInt(data.details.diskSpace.details.total);
                    this.description = `${formatters.formatBytes(free)} free, ${formatters.formatBytes(total)} total`;
                }
                // this.tooltip = `Disk space: ${free.toLocaleString()} B free of ${total.toLocaleString()} B total`;
            } else {
                this.description = 'n/a';
            }
            treeChanged(this);
        });
    }

}

export class ManagementNode extends BaseNode {

    private static readonly CONTEXT = 'extension.micronaut-tools.navigation.ManagementNode';

    constructor(management: management.Management, treeChanged: TreeChanged) {
        super('Management', undefined, ManagementNode.CONTEXT, [], false);
        this.tooltip = 'Application management';

        const loggersNode = new ManagementLoggersNode(management.getLoggersEndpoint(), treeChanged);
        const cachesNode = new ManagementCachesNode(management.getCachesEndpoint(), treeChanged);
        this.setChildren([ loggersNode, cachesNode ]);
    }

}

export class ManagementLoggersNode extends BaseNode {

    private static readonly BASE_CONTEXT = 'extension.micronaut-tools.navigation.ManagementLoggersNode';

    private readonly endpoint: loggersEndpoint.LoggersEndpoint;

    constructor(endpoint: loggersEndpoint.LoggersEndpoint, treeChanged: TreeChanged) {
        super('Loggers:', 'n/a', ManagementLoggersNode.BASE_CONTEXT, null, undefined);
        this.tooltip = 'Application loggers';
        this.endpoint = endpoint;
        endpoint.onAvailableChanged(available => {
            switch (available) {
                case true:
                    this.contextValue = `${ManagementLoggersNode.BASE_CONTEXT}.available.`;
                    break;
                case false:
                    this.description = 'n/a';
                    this.tooltip = 'Application loggers';
                    this.contextValue = ManagementLoggersNode.BASE_CONTEXT;
                    break;
                case undefined:
                    this.description = '...';
                    this.tooltip = 'Application loggers';
                    this.contextValue = ManagementLoggersNode.BASE_CONTEXT;
            }
            treeChanged(this);
        })
        endpoint.onUpdated(data => {
            const configured = loggersEndpoint.getConfigured(data);
            this.description = `${configured.length.toLocaleString()} configured`;
            if (configured.length) {
                this.tooltip = 'Configured loggers:';
                for (const logger of configured) {
                    this.tooltip += `\n \u25CF ${logger.name}: ${logger.configuredLevel}`;
                }
            } else {
                this.tooltip = 'No loggers configured';
            }
            treeChanged(this);
        });
    }

    updateLoggers() {
        this.endpoint.update();
    }

     editLoggers() {
        this.endpoint.editLoggers();
    }

}

export class ManagementCachesNode extends BaseNode {

    private static readonly BASE_CONTEXT = 'extension.micronaut-tools.navigation.ManagementCachesNode';

    private readonly endpoint: cachesEndpoint.CachesEndpoint;

    constructor(endpoint: cachesEndpoint.CachesEndpoint, treeChanged: TreeChanged) {
        super('Caches:', 'n/a', ManagementCachesNode.BASE_CONTEXT, null, undefined);
        this.tooltip = 'Application caches';
        this.endpoint = endpoint;
        endpoint.onAvailableChanged(available => {
            switch (available) {
                case true:
                    // this.contextValue = `${ManagementCachesNode.BASE_CONTEXT}.available.`;
                    this.contextValue = ManagementCachesNode.BASE_CONTEXT;
                    break;
                case false:
                    this.description = 'n/a';
                    this.tooltip = 'Application caches';
                    this.contextValue = ManagementCachesNode.BASE_CONTEXT;
                    break;
                case undefined:
                    this.description = '...';
                    this.tooltip = 'Application caches';
                    this.contextValue = ManagementCachesNode.BASE_CONTEXT;
            }
            treeChanged(this);
        })
        endpoint.onUpdated(data => {
            const caches = cachesEndpoint.getNames(data);
            this.description = `${caches.length.toLocaleString()} available`;
            if (caches.length) {
                this.tooltip = 'Available caches:';
                for (const cache of caches) {
                    this.tooltip += `\n \u25CF ${cache}`;
                }
                this.contextValue = `${ManagementCachesNode.BASE_CONTEXT}.available.`;
            } else {
                this.tooltip = 'No caches available';
                this.contextValue = ManagementCachesNode.BASE_CONTEXT;
            }
            treeChanged(this);
        });
    }

    updateCaches() {
        this.endpoint.update();
    }

    clearCaches() {
        this.endpoint.clearCaches();
    }

}
