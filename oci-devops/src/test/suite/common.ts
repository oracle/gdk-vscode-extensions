import * as vscode from 'vscode';

export async function waitForStartup(wf? : vscode.WorkspaceFolder) : Promise<void> {
    if (!wf) {
            return;
    }
    let wf2 = wf;
    let counter = 0;
    let p : Promise<void> = new Promise(async (resolve, reject) => {

            async function dowait() {
                    try {
                            await vscode.commands.executeCommand('nbls.project.info', wf2.uri.toString(), { projectStructure: true });
                            resolve();
                    } catch (e) {
                            if (counter < 60) {
                                    counter++;
                                    console.log(`Still waiting for NBLS start, ${counter} seconds elapsed.`);
                                    setTimeout(dowait, 1000);
                                    return;
                            } else {
                                    reject(e);
                            }
                    }
            }
            setTimeout(dowait, 1000);
    });
    return p;
}

export function getProfile(profiles : string[]) : string {
    if (profiles.length === 1)
        return  profiles[0];
    else if (profiles.indexOf("TESTS") !== -1)
        return "TESTS";
    else if (profiles.indexOf("DEFAULT") !== -1)
        return "DEFAULT";
    else {
        return "";
    }
}

