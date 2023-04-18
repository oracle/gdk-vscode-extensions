/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as dialogs from "./dialogs";

require('../lib/gcn.ui.api');

/**
 * Title for the whole Wizard
 */
 const title = 'Create New GCN Project';

 /**
  * Number of fixed steps. Update whenever steps in selectCreateOptions change
  */
 const fixedSteps = 9;
 
/**
 * Common type for list item display. Value is the code/id, label is the user-facing label, description goes to QuickPickItem.detail.
 */
export interface ValueAndLabel {
    label: string;
    value: string;
    detail?: string;
}

/**
 * Internal state of the Wizard
 */
interface State {
    micronautVersion: { label: string; serviceUrl: string};
    applicationType: ValueAndLabel;
    
    javaVersion: {
        label: string; 
        value: string; 
        target: string;
    };
    projectName: string;
    basePackage: string;
    language: ValueAndLabel;
    services: ValueAndLabel[];
    buildTool: ValueAndLabel;
    testFramework: ValueAndLabel;
    featureCategories: ValueAndLabel[];
    features: Map<string, ValueAndLabel[]>;
    clouds: ValueAndLabel[];
    target?: string;
}

/**
 * Creation options that the Wizard produces
 */
export interface CreateOptions {
    micronautVersion: { label: string; serviceUrl: string};
    applicationType: string;
    javaVersion?: string;
    projectName: string;
    basePackage?: string;
    language: string;
    services?: string[];
    buildTool: string;
    testFramework: string;
    features?: string[];
    clouds?: string[];

    target?: string;
}

/**
 * Describes the shape of objects that hold information about javaVMs
 */
export type JavaVMType = {
    name: string; 
    path: string; 
    active: boolean;
};

/**
 * Defines the fileHandler function type
 */
export type FileHandlerType = (pathName: any, bytes: any, _isBinary: any, isExecutable: any)=>void;

/**
 * External variable filled by resolve()
 */
declare var AotjsVM: any;

/**
 * Main entry point to the AOT.js-ed GCN CLI.
 */
var gcnApi: any = undefined;

export async function initialize(): Promise<any> {
    const graalVMExt = vscode.extensions.getExtension('oracle-labs-graalvm.graalvm');
    if (graalVMExt && !graalVMExt.isActive) {
        await graalVMExt.activate();
    }
    return gcnApi ? Promise.resolve(gcnApi) : AotjsVM.run([]).then((vm: any) => {
        return gcnApi = vm.exports.cloud.graal.gcn.ui.API;
    });
}

export async function writeProjectContents(options: CreateOptions, fileHandler:FileHandlerType) {
   function j(multi?: string[]) {
    if (!multi) {
        return "";
    } else {
        return multi.join(',');
    }
   }

   let name = options.basePackage || 'com.example';
   // BUG: for some reason, the GCN CLI strips last part of the package name - the original Webapp uses it to create the archive name.
   if (options.projectName) {
    name = name + "." + options.projectName;
   } else {
    name = name + ".project";
   }
   try {
    await gcnApi.create(
        options.applicationType, 
        name,
        j(options.features),
        j(options.services),
        j(options.clouds),
        options.buildTool,
        options.testFramework,
        'JAVA', // options.language,
        options.javaVersion,
        'gcn-vscode-extension',
        true,
        fileHandler
    );
   } catch (err) {
    dialogs.showErrorMessage(`Project generation failed`, err);
    throw err;
   }
}

/**
 * Compute total steps based on state/selections made.
 * @param state current state
 * @returns total steps
 */
function totalSteps(state: Partial<State>) : number {
    return fixedSteps + (state.featureCategories?.length || 0);
}

function convertLabelledValues(items: any[]): ValueAndLabel[] {
    const ret: {label: string; value: string}[]  = [];
    for (let i = 0; i < items.length; i++) {
        let v = items[i];
        ret.push({
            label: v.getLabel().$as('string') as string,
            value: v.getValueName().$as('string') as string
        });
    }
    return ret;
}

export async function getApplicationTypes(): Promise<ValueAndLabel[]> {
    return convertLabelledValues(gcnApi.applicationTypes().getTypes().toArray());
}

function getJavaVersions(): string[] {
    const versions: string[] = [];

    let items = gcnApi.javaVersions().getOptions().toArray();
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const s = item.getName().$as('string') as string;
        let match: string[] | null = s?.match(/JDK_(\d+)/);
        if (match && match.length > 1) {
            versions.push(match[1]);
        }
    }
    return versions;
}

function getDefaultJavaVersion(): string {
    let j = gcnApi.javaVersions().getDefaultOption();
    const s = j.getName().$as('string') as string;
    let match: string[] | null = s?.match(/JDK_(\d+)/);
    return match && match.length > 1 ? match[1] : s;

}

export function getBuildTools() {
    return convertLabelledValues(gcnApi.buildTools().getOptions().toArray());
}

export function getTestFrameworks() {
    return convertLabelledValues(gcnApi.testFrameworks().getOptions().toArray());
}

export function getClouds() {
    const ret: ValueAndLabel[]  = [];
    const items = gcnApi.clouds().toArray();
    for (let i = 0; i < items.length; i++) {
        let v = items[i];
        const cloud = {
            label: v.getLabel().$as('string') as string,
            value: v.getValueName().$as('string') as string
        };
        if (cloud.label === 'OCI') {
            ret.unshift(cloud);
        } else {
            ret.push(cloud);
        }
    }
    return ret;
}

function getServices(): ValueAndLabel[] {
    const ret = [];
    let ss = gcnApi.services().toArray();
    for (let i = 0; i < ss.length; i++) {
        const item = ss[i];
        ret.push({
            label: item.getLabel().$as('string'),
            value: item.getValueName().$as('string'),
            detail: item.getDescription().$as('string'),
        });
    }
    return ret;
}

export function getMicronautVersions() : { label : string }[] {
    return [ { label : gcnApi.micronautVersion().$as('string') as string }];
}

function findSelection(from: ValueAndLabel[], selected: ValueAndLabel[] | ValueAndLabel | undefined) {
    const sel = findSelectedItems(from, selected);
    return sel && sel.length > 0 ? sel[0] : undefined;
}

function findSelectedItems(from: ValueAndLabel[], selected: ValueAndLabel[] | ValueAndLabel | undefined) {
    const ret : ValueAndLabel[]= [];
    if (!selected) {
        if (from[0]?.label === 'OCI') {
            ret.push(from[0]);
        }
        return ret;
    }
    if (!Array.isArray(selected)) {
        selected = [ selected ];
    }
    const values : Set<string> = new Set();
    selected.forEach(vl => values.add(vl.value));

    for (let check of from) {
        if (values.has(check.value)) {
            ret.push(check);
        }
    }
    return ret;
}

export async function selectCreateOptions(javaVMs:JavaVMType[]): Promise<CreateOptions | undefined> {    
	
    async function collectInputs(): Promise<State | undefined> {
		const state = {} as Partial<State>;
        return await dialogs.MultiStepInput.run(input => pickMicronautVersion(input, state)) ? state as State : undefined;
	}

	async function pickMicronautVersion(input: dialogs.MultiStepInput, state: Partial<State>) {
        const selected: any = await input.showQuickPick({
			title,
			step: 1,
			totalSteps: totalSteps(state),
			placeholder: 'Pick Micronaut version',
			items: getMicronautVersions(),
			activeItems: state.micronautVersion,
			shouldResume: () => Promise.resolve(false)
        });
        state.micronautVersion = selected;
		return (input: dialogs.MultiStepInput) => pickApplicationType(input, state);
	}

    async function pickApplicationType(input: dialogs.MultiStepInput, state: Partial<State>) {
        const choices : ValueAndLabel[] = state.micronautVersion ? await getApplicationTypes() : [];
		const selected: any = await input.showQuickPick({
			title,
			step: 2,
			totalSteps: totalSteps(state),
			placeholder: 'Pick application type',
			items: choices,
			activeItems: findSelection(choices, state.applicationType),
			shouldResume: () => Promise.resolve(false)
        });
        state.applicationType = selected;
		return (input: dialogs.MultiStepInput) => pickJavaVersion(input, state);
	}

    async function pickJavaVersion(input: dialogs.MultiStepInput, state: Partial<State>) {
        const supportedVersions = state.micronautVersion ? getJavaVersions() : [];


        function isJavaAccepted(java : string) : boolean {
            const version: string[] | null = java.match(/Java (\d+)/);
            const resolvedVersion = version && version.length > 1 ? version[1] : undefined;
            if (!resolvedVersion) {
                // don't know, let the user choose
                return true;
            }
            return !!normalizeJavaVersion(resolvedVersion, supportedVersions, '');
        }

        const items: {label: string; value: string; description?: string}[] = javaVMs.
            filter(item => isJavaAccepted(item.name)).
            map(item => ({label: item.name, value: item.path, description: item.active ? '(active)' : undefined}));
        
        items.push({label: 'Other Java', value: '', description: '(manual configuration)'});
		const selected: any = await input.showQuickPick({
			title,
			step: 3,
			totalSteps: totalSteps(state),
			placeholder: 'Pick project Java',
			items,
			activeItems: findSelection(items, state.javaVersion),
			shouldResume: () => Promise.resolve(false)
        });
        const version: string[] | null = selected ? selected.label.match(/Java (\d+)/) : null;
        const resolvedVersion = version && version.length > 1 ? version[1] : undefined;
        const javaVersion = resolvedVersion || getDefaultJavaVersion();
        state.javaVersion = {
            label: selected.label,
            value: selected.value,
            target: javaVersion
        };
        if (!resolvedVersion) {
            let defVersion = getDefaultJavaVersion();
            vscode.window.showInformationMessage(`Java version not selected. The project will target Java ${defVersion}. Adjust the setting in the generated project file(s).`);
            state.javaVersion.target = defVersion;
        }
		return (input: dialogs.MultiStepInput) => projectName(input, state);
	}

	async function projectName(input: dialogs.MultiStepInput, state: Partial<State>) {
		state.projectName = await input.showInputBox({
			title,
			step: 4,
			totalSteps: totalSteps(state),
			value: state.projectName || 'demo',
			prompt: 'Provide project name',
            // From OCI: Name cannot start and end with '-' (hyphen), have '--' (sequential hyphen), and can only consist of ASCII letter, digit, '_' (underscore) or '-' (hyphen) characters.
			validate: (value: string) => Promise.resolve((/^[A-Za-z0-9_]([A-Za-z0-9_]|-(?!-))*[A-Za-z0-9_]?$/.test(value)) ? undefined : 'Name cannot start and end with "-" (hyphen), have "--" (sequential hyphen), and can only consist of ASCII letter, digit, "_" (underscore) or "-" (hyphen) characters'),
			shouldResume: () => Promise.resolve(false)
		});
		return (input: dialogs.MultiStepInput) => basePackage(input, state);
	}

	async function basePackage(input: dialogs.MultiStepInput, state: Partial<State>) {
		state.basePackage = await input.showInputBox({
			title,
			step: 5,
			totalSteps: totalSteps(state),
			value: state.basePackage || 'com.example',
			prompt: 'Provide base package',
			validate: (value: string) => Promise.resolve((/^[a-z_][a-z0-9_]*(\.[a-z0-9_]+)*$/.test(value)) ? undefined : 'Invalid base package'),
			shouldResume: () => Promise.resolve(false)
		});
		return (input: dialogs.MultiStepInput) => pickServices(input, state);
	}

	async function pickServices(input: dialogs.MultiStepInput, state: Partial<State>) {
        const choices = state.micronautVersion && state.applicationType && state.javaVersion ? getServices() : [];
		const selected: any = await input.showQuickPick({
			title,
			step: 6,
			totalSteps: totalSteps(state),
            placeholder: 'Pick project services',
            items: choices,
            activeItems: findSelectedItems(choices, state.services),
            canSelectMany: true,
			shouldResume: () => Promise.resolve(false)
        });
        state.services = selected;
		return (input: dialogs.MultiStepInput) => pickBuildTool(input, state);
	}

	async function pickBuildTool(input: dialogs.MultiStepInput, state: Partial<State>) {
        const choices = getBuildTools();
		const selected: any = await input.showQuickPick({
			title,
			step: 7,
			totalSteps: totalSteps(state),
            placeholder: 'Pick build tool',
            items: choices,
            activeItems: findSelection(choices, state.buildTool),
			shouldResume: () => Promise.resolve(false)
        });
        state.buildTool = selected;
		return (input: dialogs.MultiStepInput) => pickTestFramework(input, state);
	}

	async function pickTestFramework(input: dialogs.MultiStepInput, state: Partial<State>) {
        const choices = getTestFrameworks();
		const selected: any = await input.showQuickPick({
			title,
			step: 8,
			totalSteps: totalSteps(state),
            placeholder: 'Pick test framework',
            items: choices,
            activeItems: findSelection(choices, state.testFramework),
			shouldResume: () => Promise.resolve(false)
        });
        state.testFramework = selected;
        return (input: dialogs.MultiStepInput) => pickCloud(input, state);
	}

    async function pickCloud(input: dialogs.MultiStepInput, state: Partial<State>) {
        const choices = getClouds() || [];
		const selected: any = await input.showQuickPick({
			title,
			step: 9,
			totalSteps: totalSteps(state),
            placeholder: 'Pick Cloud Provider(s) to use',
            items: choices,
            activeItems: findSelectedItems(choices, state.clouds),
            canSelectMany: true,
			shouldResume: () => Promise.resolve(false)
        });
        state.clouds = selected;
        return undefined;
    }

    const s: State | undefined = await collectInputs();
    if (!s) {
        return undefined;
    }
    
    function values(vals: ValueAndLabel[] | undefined) {
        if (!vals || vals.length === 0) {
            return undefined;
        }
        return vals.map((v) => v.value);
    }
    
    const featureList: string[] = [];
    for (const cat of s.featureCategories || []) {
        const list = values(s.features?.get(cat.value));
        if (list) {
            featureList.push(...list);
        }
    }

    return {
        micronautVersion: { 
            label: s.micronautVersion.label,
            serviceUrl: s.micronautVersion.serviceUrl
        },
        applicationType: s.applicationType.value,
        buildTool: s.buildTool.value,
        language: 'JAVA',
        testFramework: s.testFramework.value,

        basePackage: s.basePackage,
        projectName: s.projectName,
        javaVersion: "JDK_" + s.javaVersion.target,

        clouds: values(s.clouds),
        services: values(s.services),
        features: featureList.length > 0 ? featureList : undefined
    };
}

export function normalizeJavaVersion(version: string | undefined, supportedVersions: string[], defaultVersion : string = '8'): string {
    if (!version) {
        return defaultVersion;
    }
    if (!supportedVersions || supportedVersions.length === 0) {
        return version;
    }
    let versionN = parseInt(version);
    for (let supportedVersion of supportedVersions.reverse()) {
        const supportedN = parseInt(supportedVersion);
        if (versionN >= supportedN) {
            return supportedVersion;
        }
    }
    return defaultVersion;
}