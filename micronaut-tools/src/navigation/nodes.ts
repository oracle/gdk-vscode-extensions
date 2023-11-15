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
import * as management from './management/management';
import * as healthEndpoint from './management/healthEndpoint';
import * as metricsEndpoint from './management/metricsEndpoint';
import * as loggersEndpoint from './management/loggersEndpoint';
import * as formatters from './formatters';


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

    protected constructor(name: string, detail: string | undefined, tooltip: string | undefined, icon: string, context: string, symbol: T) {
        super(name, detail, context, undefined, undefined);
        this.tooltip = tooltip;
        this.icon = icon;
        this.iconPath = new vscode.ThemeIcon(icon);
        this.symbol = symbol;
        this.baseContext = context;
        this.command = {
            title: actions.COMMAND_NAME_GO_TO_DEFINITION,
            command: actions.COMMAND_GO_TO_DEFINITION,
            arguments: [ this ]
        };
    }

    getSymbol(): T {
        return this.symbol;
    }

    setRuntimeStatus(status: boolean | undefined) {
        switch (status) {
            case true:
                this.iconPath = new vscode.ThemeIcon(this.icon, new vscode.ThemeColor('charts.green'));
                this.contextValue = this.baseContext + '.available.';
                break;
            case false:
                this.iconPath = new vscode.ThemeIcon(this.icon, new vscode.ThemeColor('charts.red'));
                this.contextValue = this.baseContext;
                break;
            default:
                this.iconPath = new vscode.ThemeIcon(this.icon);
                this.contextValue = this.baseContext;
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
        super(folder.getWorkspaceFolder().name, undefined, ApplicationFolderNode.BASE_CONTEXT, [ new ApplicationAddressNode(folder.getApplication(), treeChanged), new ApplicationMonitoringNode(folder.getApplication(), treeChanged), new ApplicationControlPanelNode(folder.getApplication(), treeChanged)/*, new ApplicationPropertiesNode(vscode.Uri.file('application.properties'), treeChanged)*/ ], true);
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

export class ApplicationAddressNode extends BaseNode {

    private static readonly BASE_CONTEXT = 'extension.micronaut-tools.navigation.ApplicationAddressNode';

    private readonly application: applications.Application;

    constructor(application: applications.Application, treeChanged: TreeChanged) {
        super('Address:', application.getAddress(), ApplicationAddressNode.BASE_CONTEXT, null, undefined);
        this.tooltip = 'Address of a local or remote application';
        this.application = application;

        this.updateContext(this.application.getState());
        this.application.onStateChanged(state => {
            this.updateContext(state);
            treeChanged(this);
        });
        this.application.onAddressChanged(address => {
            this.description = address;
            treeChanged(this);
        });
    }

    editAddress() {
        this.application.editAddress();
    }

    private updateContext(state: applications.State) {
        this.contextValue = `${ApplicationAddressNode.BASE_CONTEXT}.${state}.`;
    }

}

export class ApplicationMonitoringNode extends BaseNode {

    private static readonly BASE_CONTEXT = 'extension.micronaut-tools.navigation.ApplicationMonitoringNode';

    private readonly application: applications.Application;

    constructor(application: applications.Application, treeChanged: TreeChanged) {
        super('Monitoring & Management:', '...', ApplicationMonitoringNode.BASE_CONTEXT, null, undefined);
        this.tooltip = 'Enable to display the runtime status and services of the application';
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
                        this.contextValue = ApplicationMonitoringNode.BASE_CONTEXT + '.available.';
                        break;
                    case false:
                        this.description = 'not available';
                        this.contextValue = ApplicationMonitoringNode.BASE_CONTEXT + '.unavailable.';
                        break;
                    default:
                        this.description = '...';
                        this.contextValue = ApplicationMonitoringNode.BASE_CONTEXT + '.updating.';
                }
                break;
            case applications.State.CONNECTING_LAUNCH:
            case applications.State.CONNECTING_ATTACH:
            case applications.State.DISCONNECTING_LAUNCH:
            case applications.State.DISCONNECTING_ATTACH:
                this.description = '...';
                this.contextValue = ApplicationMonitoringNode.BASE_CONTEXT + '.updating.';
                break;
            default:
                this.description = management.isEnabled() ? 'enabled' : 'inherited';
                this.contextValue = ApplicationMonitoringNode.BASE_CONTEXT + '.idle.';
        }
    }

}

export class ApplicationControlPanelNode extends BaseNode {

    private static readonly BASE_CONTEXT = 'extension.micronaut-tools.navigation.ApplicationControlPanelNode';

    private readonly application: applications.Application;

    constructor(application: applications.Application, treeChanged: TreeChanged) {
        super('Micronaut Control Panel:', '...', ApplicationControlPanelNode.BASE_CONTEXT, null, undefined);
        this.tooltip = 'Enable to have the Micronaut Control Panel available for the application';
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
                        this.contextValue = ApplicationControlPanelNode.BASE_CONTEXT + '.available.';
                        break;
                    case false:
                        this.description = 'not available';
                        this.contextValue = ApplicationControlPanelNode.BASE_CONTEXT + '.unavailable.';
                        break;
                    default:
                        this.description = '...';
                        this.contextValue = ApplicationControlPanelNode.BASE_CONTEXT + '.updating.';
                }
                break;
            case applications.State.CONNECTING_LAUNCH:
            case applications.State.CONNECTING_ATTACH:
            case applications.State.DISCONNECTING_LAUNCH:
            case applications.State.DISCONNECTING_ATTACH:
                this.description = '...';
                this.contextValue = ApplicationControlPanelNode.BASE_CONTEXT + '.updating.';
                break;
            default:
                this.description = controlPanel.isEnabled() ? 'enabled' : 'inherited';
                this.contextValue = ApplicationControlPanelNode.BASE_CONTEXT + '.idle.';
        }
    }

}

export class ApplicationPropertiesNode extends BaseNode {

    private static readonly BASE_CONTEXT = 'extension.micronaut-tools.navigation.ApplicationPropertiesNode';

    private readonly file: vscode.Uri;

    constructor(file: vscode.Uri, _treeChanged: TreeChanged) {
        super('properties:', file.path, ApplicationPropertiesNode.BASE_CONTEXT, null, undefined);
        // this.tooltip = 'Address of a local or remote application';
        // this.iconPath = new vscode.ThemeIcon('location');
        this.file = file;

        // this.updateContext(this.application.getState());
        // this.application.onStateChanged(state => {
        //     this.updateContext(state);
        // });
        // this.application.onAddressChanged(address => {
        //     this.description = address;
        //     treeChanged(this);
        // });
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
                this.reloadSymbol(beans, treeChanged);
            }
        });
        let lastRuntimeCount: number = 0;
        folder.onRuntimeUpdated((kind: string[], beans: symbols.Bean[], _endpoints: symbols.Endpoint[]) => {
            if (symbols.isBeanKind(kind) && beans.length !== lastRuntimeCount) {
                lastRuntimeCount = beans.length;
                this.reloadRuntimeSymbol(beans, treeChanged);
            }
        });
    }

    private reloadSymbol(beans: symbols.Bean[], treeChanged: TreeChanged) {
        const children: BaseNode[] = [];
        for (const bean of beans) {
            const beanNode = BeanNode.create(bean);
            children.push(beanNode);
        }
        if (!children.length) {
            children.push(new NoItemsNode(BeansFolderNode.SUBJECT));
        }
        this.setChildren(children);
        treeChanged(this);
    }

    private reloadRuntimeSymbol(beans: symbols.Bean[], treeChanged: TreeChanged) {
        const beansMap: any = {};
        for (const bean of beans) {
            beansMap[bean.name] = true;
        }
        const children = this.getChildren();
        if (children) {
            for (const child of children) {
                if (child instanceof BeanNode) {
                    (child as BeanNode).setRuntimeStatus(beansMap[child.getSymbol().name]);
                }
            }
        }
        treeChanged(this);
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
                this.reloadSymbol(endpoints, treeChanged);
            }
        });
        let lastRuntimeCount: number = 0;
        folder.onRuntimeUpdated((kind: string[], _beans: symbols.Bean[], endpoints: symbols.Endpoint[]) => {
            if (symbols.isEndpointKind(kind) && endpoints.length !== lastRuntimeCount) {
                lastRuntimeCount = endpoints.length;
                this.reloadRuntimeSymbol(endpoints, treeChanged);
            }
        });
    }

    private reloadSymbol(endpoints: symbols.Endpoint[], treeChanged: TreeChanged) {
        const children: BaseNode[] = [];
        for (const endpoint of endpoints) {
            const beanNode = EndpointNode.create(endpoint);
            children.push(beanNode);
        }
        if (!children.length) {
            children.push(new NoItemsNode(EndpointsFolderNode.SUBJECT));
        }
        this.setChildren(children);
        treeChanged(this);
    }

    private reloadRuntimeSymbol(endpoints: symbols.Endpoint[], treeChanged: TreeChanged) {
        const endpointsMap: any = {};
        for (const endpoint of endpoints) {
            endpointsMap[EndpointsFolderNode.endpointID(endpoint)] = true;
        }
        const children = this.getChildren();
        if (children) {
            for (const child of children) {
                if (child instanceof EndpointNode) {
                    (child as EndpointNode).setRuntimeStatus(endpointsMap[EndpointsFolderNode.endpointID(child.getSymbol())]);
                }
            }
        }
        treeChanged(this);
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
        super('Monitoring', undefined, MonitoringNode.CONTEXT, [], false);
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
            const free = Number.parseInt(data.details.diskSpace.details.free);
            const total = Number.parseInt(data.details.diskSpace.details.total);
            this.description = `${formatters.formatBytes(free)} free, ${formatters.formatBytes(total)} total`;
            // this.tooltip = `Disk space: ${free.toLocaleString()} B free of ${total.toLocaleString()} B total`;
            treeChanged(this);
        });
    }

}

export class ManagementNode extends BaseNode {

    private static readonly CONTEXT = 'extension.micronaut-tools.navigation.ManagementNode';

    constructor(management: management.Management, treeChanged: TreeChanged) {
        super('Management', undefined, ManagementNode.CONTEXT, [], true);
        this.tooltip = 'Application management';

        const loggersNode = new ManagementLoggersNode(management.getLoggersEndpoint(), treeChanged);
        this.setChildren([ loggersNode ]);
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
                    this.tooltip += `\n \u25CF ${logger.name}: ${logger.configuredLevel}`
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
