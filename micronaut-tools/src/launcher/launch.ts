import * as vscode from 'vscode';
import { resolveConfigurationAsync } from './projectLaunchSupport';

export async function launch(extensionPath : string, projectType: string, uriString: string, _noDebug: boolean) {
    const uri = vscode.Uri.parse(uriString);
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
    if (workspaceFolder) {
        const launchConfig = {
            type: 'java',
            request: 'launch',
            noDebug: true,
            name: `Run Continuous via ${projectType}`,
            env: {
                'JDT_LAUNCHWRAP_MICRONAUT_CONTINUOUS': 'true'
            }
        };
        try {
            return await vscode.debug.startDebugging(workspaceFolder, 
                await resolveConfigurationAsync(uri, launchConfig, extensionPath));
        } catch (err) {
            console.log(err);
        }
    }
    return false;
}
