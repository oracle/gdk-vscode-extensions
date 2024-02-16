/*
 * Copyright (c) 2024, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as visualvm from './visualvm';
import * as parameters from './parameters';
import * as configurations from './configurations';
import * as monitoredProcesses from './monitoredProcesses';
import * as logUtils from '../../common/lib/logUtils';


const CONFIGURABLE_NODES_KEY = 'visualvm.configurableNodes';

const COMMAND_CONFIGURE_SETTING = 'visualvm.configureSetting';
const COMMAND_OPEN_PROCESS = 'visualvm.showProcess';
const COMMAND_THREADDUMP_TAKE = 'visualvm.threadDumpTake';
const COMMAND_HEAPDUMP_TAKE = 'visualvm.heapDumpTake';

export function initialize(context: vscode.ExtensionContext) {
    const configurableNodes = [
        WhenStartedNode.CONTEXT,
        CpuSamplerFilterNode.CONTEXT,
        CpuSamplerSamplingRateNode.CONTEXT,
        MemorySamplerSamplingRateNode.CONTEXT,
        JfrSettingsNode.CONTEXT
    ];
    vscode.commands.executeCommand('setContext', CONFIGURABLE_NODES_KEY, configurableNodes);

    context.subscriptions.push(vscode.commands.registerCommand(COMMAND_CONFIGURE_SETTING, (node: ConfigurableNode) => {
        node.configure();
	}));
    context.subscriptions.push(vscode.commands.registerCommand(COMMAND_OPEN_PROCESS, async (node: ProcessNode) => {
        const process = await findProcess(node);
        const pid = process?.getPid();
        if (pid) {
            logUtils.logInfo(`[nodes] Opening process pid ${pid}`);
            visualvm.show(pid);
        }
	}));
    context.subscriptions.push(vscode.commands.registerCommand(COMMAND_THREADDUMP_TAKE, async (node: ThreadDumpNode) => {
        const process = await findProcess(node);
        const pid = process?.getPid();
        if (pid) {
            logUtils.logInfo(`[nodes] Taking thread dump for pid ${pid}`);
            const command = parameters.threadDump(pid);
            visualvm.perform(command);
        }
	}));
    context.subscriptions.push(vscode.commands.registerCommand(COMMAND_HEAPDUMP_TAKE, async (node: HeapDumpNode) => {
        const process = await findProcess(node);
        const pid = process?.getPid();
        if (pid) {
            logUtils.logInfo(`[nodes] Taking thread dump for pid ${pid}`);
            const command = parameters.heapDump(pid);
            visualvm.perform(command);
        }
	}));

    monitoredProcesses.onChanged((added, removed) => {
        PROVIDER.processesChanged(added, removed);
    });
}

async function findProcess(node: BaseNode): Promise<monitoredProcesses.MonitoredProcess | undefined> {
    while (node.parent !== undefined) {
        node = node.parent;
    }
    if (node instanceof ProcessNode) {
        const process = node.getProcess();
        // TODO: select running process if undefined
        return process;
    }
    return undefined;
}

type TreeChanged = (treeItem?: vscode.TreeItem) => void;

class BaseNode extends vscode.TreeItem {

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

class ChangeableNode extends BaseNode {

    protected readonly treeChanged: TreeChanged;

    constructor(treeChanged: TreeChanged, label: string, description: string | undefined, contextValue: string | undefined, children: BaseNode[] | undefined | null, expanded: boolean | undefined) {
        super(label, description, contextValue, children, expanded);
        this.treeChanged = treeChanged;
    }

}

abstract class ConfigurableNode extends ChangeableNode {

    private readonly configuration: configurations.Configuration;

    constructor(configuration: configurations.Configuration, treeChanged: TreeChanged, label: string, description: string | undefined, contextValue: string | undefined, children: BaseNode[] | undefined | null, expanded: boolean | undefined) {
        super(treeChanged, label, description, contextValue, children, expanded);
        this.configuration = configuration;
        this.configuration.onChanged(() => { this.updateFromConfiguration(); this.treeChanged(this); });
        this.updateFromConfiguration();
    }

    configure() {
        this.configuration.configure();
    }

    protected updateFromConfiguration() {
        this.description = this.configuration.getString();
    }

}

class WhenStartedNode extends ConfigurableNode {

    static CONTEXT = 'visualvm.WhenStartedNode';

    constructor(treeChanged: TreeChanged) {
        super(new configurations.WhenStartedConfiguration(), treeChanged, 'When started:', undefined, WhenStartedNode.CONTEXT, undefined, undefined);
        this.tooltip = 'Action when a new project process is started';
    }

}

class ThreadDumpNode extends BaseNode {

    private static CONTEXT = 'visualvm.ThreadDumpNode';

    constructor() {
        super('Thread dump', undefined, ThreadDumpNode.CONTEXT, undefined, undefined);
        this.tooltip = 'Take a thread dump and open it in VisualVM';
    }

}

class HeapDumpNode extends BaseNode {

    private static CONTEXT = 'visualvm.HeapDumpNode';

    constructor() {
        super('Heap dump', undefined, HeapDumpNode.CONTEXT, undefined, undefined);
        this.tooltip = 'Take a heap dump and open it in VisualVM';
    }

}

class CpuSamplerNode extends BaseNode {

    private static CONTEXT = 'visualvm.CpuSamplerNode';

    constructor(treeChanged: TreeChanged) {
        super('CPU sampler', undefined, CpuSamplerNode.CONTEXT, [ ...CpuSamplerNode.createNodes(treeChanged) ], false);
        this.tooltip = 'Control a CPU sampling session in VisualVM';
    }

    private static createNodes(treeChanged: TreeChanged): BaseNode[] {
        const nodes: BaseNode[] = [];
        nodes.push(new CpuSamplerFilterNode(treeChanged));
        nodes.push(new CpuSamplerSamplingRateNode(treeChanged));
        return nodes;
    }

}

class CpuSamplerFilterNode extends ConfigurableNode {

    static CONTEXT = 'visualvm.CpuSamplerFilterNode';

    constructor(treeChanged: TreeChanged) {
        super(new configurations.CpuSamplerFilterConfiguration(), treeChanged, 'Filter:', undefined, CpuSamplerFilterNode.CONTEXT, undefined, undefined);
        this.tooltip = 'CPU sampling filter';
    }

}

class CpuSamplerSamplingRateNode extends ConfigurableNode {

    static CONTEXT = 'visualvm.CpuSamplerSamplingRateNode';

    constructor(treeChanged: TreeChanged) {
        super(new configurations.CpuSamplerSamplingRateConfiguration(), treeChanged, 'Sampling rate:', undefined, CpuSamplerSamplingRateNode.CONTEXT, undefined, undefined);
        this.tooltip = 'CPU sampling rate';
    }

}

class MemorySamplerNode extends BaseNode {

    private static CONTEXT = 'visualvm.MemorySamplerNode';

    constructor(treeChanged: TreeChanged) {
        super('Memory sampler', undefined, MemorySamplerNode.CONTEXT, [ ...MemorySamplerNode.createNodes(treeChanged) ], false);
        this.tooltip = 'Control a memory sampling session in VisualVM';
    }

    private static createNodes(treeChanged: TreeChanged): BaseNode[] {
        const nodes: BaseNode[] = [];
        nodes.push(new MemorySamplerSamplingRateNode(treeChanged));
        return nodes;
    }

}

class MemorySamplerSamplingRateNode extends ConfigurableNode {

    static CONTEXT = 'visualvm.MemorySamplerSamplingRateNode';

    constructor(treeChanged: TreeChanged) {
        super(new configurations.MemorySamplerSamplingRateConfiguration(), treeChanged, 'Sampling rate:', undefined, MemorySamplerSamplingRateNode.CONTEXT, undefined, undefined);
        this.tooltip = 'Memory sampling rate';
    }

}

class JfrNode extends BaseNode {

    private static CONTEXT = 'visualvm.JfrNode';

    constructor(treeChanged: TreeChanged) {
        super('JFR', undefined, JfrNode.CONTEXT, [ ...JfrNode.createNodes(treeChanged) ], false);
        this.tooltip = 'Control a flight recording session in VisualVM';
    }

    private static createNodes(treeChanged: TreeChanged): BaseNode[] {
        const nodes: BaseNode[] = [];
        nodes.push(new JfrSettingsNode(treeChanged));
        return nodes;
    }

}

class JfrSettingsNode extends ConfigurableNode {

    static CONTEXT = 'visualvm.JfrSettingsNode';

    constructor(treeChanged: TreeChanged) {
        super(new configurations.JfrSettingsConfiguration(), treeChanged, 'Settings:', undefined, JfrSettingsNode.CONTEXT, undefined, undefined);
        this.tooltip = 'Flight recorder settings';
    }

}

class ProcessNode extends ChangeableNode {

    private static CONTEXT_BASE = 'visualvm.ProcessNode';
    private static CONTEXT_NO_PROCESS = `${this.CONTEXT_BASE}.noProcess`;
    private static CONTEXT_HAS_ID = `${this.CONTEXT_BASE}.hasId`;
    private static CONTEXT_HAS_PID = `${this.CONTEXT_BASE}.hasPid`;
    private static CONTEXT_TERMINATED = `${this.CONTEXT_BASE}.terminated`;

    private process: monitoredProcesses.MonitoredProcess | undefined;

    constructor(treeChanged: TreeChanged, process?: monitoredProcesses.MonitoredProcess | undefined) {
        super(treeChanged, 'Process:', undefined, ProcessNode.CONTEXT_NO_PROCESS, [ ...ProcessNode.createNodes(treeChanged) ], !process);
        this.tooltip = 'Java process monitored by VisualVM';
        this.setProcess(process);
    }

    private static createNodes(treeChanged: TreeChanged): BaseNode[] {
        const nodes: BaseNode[] = [];
        nodes.push(new WhenStartedNode(treeChanged));
        nodes.push(new ThreadDumpNode());
        nodes.push(new HeapDumpNode());
        nodes.push(new CpuSamplerNode(treeChanged));
        nodes.push(new MemorySamplerNode(treeChanged));
        nodes.push(new JfrNode(treeChanged));
        return nodes;
    }

    getProcess(): monitoredProcesses.MonitoredProcess | undefined {
        return this.process;
    }

    setProcess(process: monitoredProcesses.MonitoredProcess | undefined) {
        this.process = process;
        this.process?.onPidChanged(() => { this.updateProcess(); this.treeChanged(this); });
        this.updateProcess();
    }

    private updateProcess() {
        if (this.process) {
            const name = this.process.displayName;
            const pid = this.process.getPid();
            if (pid === null) {
                this.description = `${name} (terminated)`;
                this.contextValue = ProcessNode.CONTEXT_TERMINATED;
            } else if (pid === undefined) {
                this.description = `${name} (pid pending...)`;
                this.contextValue = ProcessNode.CONTEXT_HAS_ID;
            } else {
                this.description = `${name} (pid ${pid})`;
                this.contextValue = ProcessNode.CONTEXT_HAS_PID;
            }
        } else {
            // TODO: display 'start new' based on 'Auto select project process'
            this.description = 'start new or select running...';
            this.contextValue = ProcessNode.CONTEXT_NO_PROCESS;
        }
    }

}

class Provider implements vscode.TreeDataProvider<vscode.TreeItem> {

	private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | null> = new vscode.EventEmitter<vscode.TreeItem | undefined | null>();
	readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | null> = this._onDidChangeTreeData.event;

    private readonly treeChanged: TreeChanged = (treeItem?: vscode.TreeItem) => { this.refresh(treeItem); }
    private readonly roots: ProcessNode[] = [ new ProcessNode(this.treeChanged) ];

    private visible: boolean = true;

    processesChanged(added: monitoredProcesses.MonitoredProcess | undefined, removed: monitoredProcesses.MonitoredProcess | undefined) {
        if (removed) {
            for (let index = 0; index < this.roots.length; index++) {
                const root = this.roots[index];
                if (root.getProcess() === removed) {
                    root.setProcess(added);
                    if (!added && index > 0) {
                        this.roots.splice(index, 1);
                        this.refresh();
                    } else {
                        this.refresh(root);
                    }
                    break;
                }
            }
        } else if (added) {
            let processRoot: ProcessNode | undefined = undefined;
            for (const root of this.roots) {
                if (root.getProcess() === undefined) {
                    processRoot = root;
                    break;
                }
            }
            if (processRoot) {
                processRoot.setProcess(added);
                this.refresh(processRoot);
            } else {
                processRoot = new ProcessNode(this.treeChanged, added);
                this.roots.push(processRoot);
                this.refresh();
            }
        }
    }

    refresh(element?: vscode.TreeItem) {
        this._onDidChangeTreeData.fire(element);
	}

	getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
	}

	getChildren(element?: vscode.TreeItem): vscode.TreeItem[] {
        if (!this.visible) {
            return [];
        } else if (!element) {
            return this.roots;
        } else {
            return (element as BaseNode).getChildren() || [];
        }
	}

    getParent?(element: vscode.TreeItem): vscode.TreeItem | undefined {
        return (element as BaseNode).parent;
    }

    setVisible(visible: boolean) {
        if (this.visible !== visible) {
            this.visible = visible;
            this.refresh();
        }
    }
}

export const PROVIDER = new Provider();
