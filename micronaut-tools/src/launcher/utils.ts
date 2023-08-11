
import * as vscode from 'vscode';

export const JAVA_LANGUAGE_SUPPORT: string = "redhat.java";

export interface IMainClassOption {
    readonly mainClass: string;
    readonly projectName?: string;
    readonly filePath?: string;
}
export async function executeJavaWorkspaceCommand(command : string, ...args : any[]) : Promise<any> {
    return executeJavaExtensionCommand('java.execute.workspaceCommand', command, ...args);
}

export async function executeJavaExtensionCommand(command : string, ...args : any[]) : Promise<any> {
    return executeExtensionCommand('redhat.java', command, ...args);
}

export async function executeExtensionCommand(extId : string, command : string, ...args : any[]) : Promise<any> {
    let x = vscode.extensions.getExtension('redhat.java');
    if (x) {
        if (!x.isActive) {
            await x.activate();
        }
        if (x.exports.serverReady()) {
            return vscode.commands.executeCommand(command,...args);
        }    
    }
    let disp;

    switch (extId) {
        case 'redhat.java': disp = 'VS Code Java Extension'; break;
        default: disp = `extension ${extId}`; break;
    }
    throw new JavaExtensionNotEnabledError(`Cannot execute command ${command}, ${disp} is not enabled`);
}

export async function lspServerReady(): Promise<boolean> {
    const javaLanguageSupport: vscode.Extension<any> | undefined = vscode.extensions.getExtension(JAVA_LANGUAGE_SUPPORT);
    if (!javaLanguageSupport) {
        return false;
    }
    if (!javaLanguageSupport.isActive) {
        await javaLanguageSupport.activate();
    }
    await javaLanguageSupport.exports.serverReady();
    return true;
}

export class JavaExtensionNotEnabledError extends Error {
    constructor(message: string) {
        super(message);
    }
}
