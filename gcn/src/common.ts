/*
 * Copyright (c) 2022, 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as dialogs from '../../common/lib/dialogs';
import { logError, logInfo } from '../../common/lib/logUtils';
import { JavaVMType } from '../../common/lib/types';

require('../lib/gcn.ui.api');

/**
 * Title for the whole Wizard
 */
 const title = 'Create New GDK Project';

 /**
  * Number of fixed steps. Update whenever steps in selectCreateOptions change
  */
 const fixedSteps = 11;
 
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
    features: ValueAndLabel[];
    clouds: ValueAndLabel[];
    target?: string;
    exampleCode: boolean;
    showUntestedFetures?: boolean;
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
    exampleCode? : boolean;
}

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

export async function writeProjectContents(options: CreateOptions, fileHandler:FileHandler) {
   await initialize();
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
        options.exampleCode === undefined ? true : options.exampleCode,
        fileHandler.writeFile()
    );

    await Promise.all(fileHandler.fileHandlerPromises);

   } catch (err : any) {
    logError(JSON.stringify(err));
    dialogs.showErrorMessage(`Project generation failed: ${err.getMessage().$as('string')}`);
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

export function getJavaVersions(): string[] {
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

export function __getServices(): ValueAndLabel[] {
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

function getFeatures(untested : boolean): ValueAndLabel[] {
    let features = gcnApi.features();
    let categories = features.keySet().toArray();
    let res = [];
    
    for (let i = 0; i < categories.length; i++) {
        let category = categories[i];
        let featuresArr = features.get(category).toArray();

        const categoryName = category.$as('string');
        let separator = true;
        for (let k = 0; k < featuresArr.length; k++) {
            let value = featuresArr[k];
            const preview = value.isPreview().$as('boolean');
            const community = value.isCommunity().$as('boolean');
            const tested = value.isGcnTested().$as('boolean');
            logInfo(`Feature: ${value.getTitle().$as('string')}, preview: ${preview}, community: ${community}, tested: ${tested}`);
            if (untested || tested) {
                if (separator) {
                    res.push({
                        label: categoryName,
                        value: categoryName,
                        kind: vscode.QuickPickItemKind.Separator
                    });
                    separator = false;
                }
                res.push({
                    label: value.getTitle().$as('string'),
                    value: value.getName().$as('string'),
                    detail: value.getDescription().$as('string'),
                });
            }
        }
    }
    return res;
}

export function getMicronautVersions() : { label : string }[] {
    return [ { label : gcnApi.micronautVersion().$as('string') as string }];
}

function findSelection(from: ValueAndLabel[], selected: ValueAndLabel[] | ValueAndLabel | undefined) {
    const sel = findSelectedItems(from, selected);
    return sel && sel.length > 0 ? sel[0] : undefined;
}

function findSelectedItems(from: ValueAndLabel[], selected: ValueAndLabel[] | ValueAndLabel | undefined, defaultSelection? : string) {
    const ret : ValueAndLabel[]= [];
    if (!selected) {
        for (let item of from) {
            if (item.value === defaultSelection) {
                ret.push(item);
                break;
            }
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


        function isJavaAccepted(java : string) : string {
            const version: string[] | null = java.match(/Java (\d+)/);
            const resolvedVersion = version && version.length > 1 ? version[1] : undefined;
            if (!resolvedVersion) {
                // don't know, let the user choose. Do not return '' as it indicates rejection.
                return '-';
            }
            return normalizeJavaVersion(resolvedVersion, supportedVersions, '');
        }

        const items: (ValueAndLabel & { description? : string; target? : string })[] = [];

        javaVMs.forEach(item => {
            let n = item.name;
            let v  = isJavaAccepted(item.name);
            if (!v) {
                return;
            }
            if (v !== '-') {
                const version: string[] | null = n.match(/Java (\d+)/);
                const resolvedVersion = version && version.length > 1 ? version[1] : undefined;
                if (!resolvedVersion) {
                    return;
                }
                if (resolvedVersion !== v) {
                    n += ` (target ${v})`;
                }
            } else {
                v = '';
            }
            let jdk = {label: n, value: item.path, description: item.active ? '(active)' : undefined, target: v };
            if (item.active) {
                items.unshift(jdk);
            } else {
                items.push(jdk);
            }
        });
        
        items.push({label: 'Other Java', value: '', target: '', description: '(manual configuration)'});

        const selected: any = await input.showQuickPick({
			title,
			step: 3,
			totalSteps: totalSteps(state),
			placeholder: 'Select installed Java runtime to use for local builds',
			items,
			activeItems: findSelection(items, state.javaVersion),
			shouldResume: () => Promise.resolve(false)
        });
        const resolvedVersion = selected ? selected.target : undefined;
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
        const choices = state.micronautVersion && state.applicationType && state.javaVersion ? __getServices() : [];
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
		return (input: dialogs.MultiStepInput) => pickFeatures(input, state);
	}

    async function pickFeatures(input: dialogs.MultiStepInput, state: Partial<State>) : Promise<any> {
        if (state.showUntestedFetures === undefined) {
            state.showUntestedFetures = false;
        }
        const disposables: vscode.Disposable[] = [];
        try {
            const choices  = state.micronautVersion && state.applicationType && state.javaVersion ? getFeatures(state.showUntestedFetures) : [];
            const qp = vscode.window.createQuickPick<ValueAndLabel>();

            const promise = input.setupQuickPick(qp, {
                title,
                step: 7,
                totalSteps: totalSteps(state),
                placeholder: state.showUntestedFetures ? 'Pick features (experimental and untested included)' : 'Pick features',
                items: choices,
                activeItems: findSelectedItems(choices, state.features, 'graalvm'),
                canSelectMany: true,
                shouldResume: () => Promise.resolve(false)
            });
            const enableUntested : vscode.QuickInputButton = {
                iconPath: new vscode.ThemeIcon('workspace-unknown'),
                tooltip: 'Shows and allows to select experimental features'
            };
            const disableUntested : vscode.QuickInputButton = {
                iconPath: new vscode.ThemeIcon('workspace-trusted'),
                tooltip: 'Shows only tested features'
            };
            const newButtons = qp.buttons.slice(0);
            newButtons.push(state.showUntestedFetures ? disableUntested : enableUntested);
            qp.buttons = newButtons;

            disposables.push(qp.onDidTriggerButton((button) => {
                const nowShow : boolean = button == enableUntested;
                if (nowShow === state.showUntestedFetures) {
                    return;
                }
                state.showUntestedFetures = nowShow;
            }));
            qp.show();
            const selected : any = await promise;
            if (qp.buttons.includes(selected)) {
                state.features = qp.selectedItems.slice(0);
                return (input: dialogs.MultiStepInput) => pickFeatures(input, state);
            }
            state.features = selected;
        } finally {
            disposables.forEach(d => d.dispose());
        }
        return (input: dialogs.MultiStepInput) => pickBuildTool(input, state);
    }

	async function pickBuildTool(input: dialogs.MultiStepInput, state: Partial<State>) {
        const choices = getBuildTools();
		const selected: any = await input.showQuickPick({
			title,
			step: 8,
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
			step: 9,
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
			step: 10,
			totalSteps: totalSteps(state),
            placeholder: 'Pick Cloud Provider(s) to use',
            items: choices,
            activeItems: findSelectedItems(choices, state.clouds, 'OCI'),
            canSelectMany: true,
			shouldResume: () => Promise.resolve(false)
        });
        state.clouds = selected;
        return (input: dialogs.MultiStepInput) => selectSampleCode(input, state);
    }

    const sampleYesNo : ValueAndLabel[] = [
        {
            value: 'yes',
            label: 'Yes'
        },
        {
            value: 'no',
            label: 'No'
        }
    ];

    async function selectSampleCode(input: dialogs.MultiStepInput, state: Partial<State>) {
		const selected: any = await input.showQuickPick({
			title,
			step: 11,
			totalSteps: totalSteps(state),
            placeholder: 'Generate sample code',
            items: sampleYesNo,
            activeItems: state.exampleCode === false ? sampleYesNo[1] : sampleYesNo[0],
            canSelectMany: false,
			shouldResume: () => Promise.resolve(false)
        });
        state.exampleCode = selected === sampleYesNo[0];
        return undefined;
    }

    const s: State | undefined = await collectInputs();
    if (!s) {
        return undefined;
    }
    
    function values(vals?: ValueAndLabel[] | undefined) : string[] | undefined {
        if (!vals || vals.length === 0) {
            return undefined;
        }
        return vals.map((v) => v.value);
    }
    
    const featureList: string[] = values(s.features) || [];
    if (s.buildTool.value === 'MAVEN' && !featureList.includes('graalvm')) {
        // automatically add for maven projects:
        featureList.push('graalvm');
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
        features: featureList.length > 0 ? featureList : undefined,
        exampleCode: s.exampleCode
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

/**
 * Abstract class representing a file handler that can be used to create GCN project
 * in different environments, such as a browser or a Node.js.
 */
export abstract class FileHandler {

    private _fileHandlerPromises: Thenable<void>[] = [];

    constructor(private locationUri:vscode.Uri){}

    writeFile(){
        return (pathName: any, bytes: any, _isBinary: any, isExecutable: any) => {
            const p : string = pathName.$as('string');
            const exe : boolean = isExecutable.$as('boolean');
            const data = bytes.$as(Int8Array).buffer;
            const view = new Uint8Array(data);

            this._fileHandlerPromises.push(
                new Promise<void>(async (resolve, reject) => {
                    try {
                        const dir = vscode.Uri.joinPath(vscode.Uri.file(p),'..').fsPath;
                        const dirUri = vscode.Uri.joinPath(this.locationUri, dir);
                        //Create directory if not exists
                        await vscode.workspace.fs.createDirectory(dirUri);
                        // Write file to disk
                        const fileUri = vscode.Uri.joinPath(this.locationUri, p);
                        await vscode.workspace.fs.writeFile(fileUri, view);
                        this.changeMode(fileUri,exe);
                        resolve();
                    }catch(e){
                        reject(e);
                    }
            }));
        };
    };

    public get fileHandlerPromises() {
        return this._fileHandlerPromises;
    }

    /**
     * Changes the mode of the file at the given URI to be executable or non-executable.
     * @param fileUri - The Uri of the file to change the mode of.
     * @param isExecutable - A boolean flag indicating whether the file should be executable or not.
    */
    abstract changeMode(fileUri:vscode.Uri, isExecutable:boolean):void;

}
