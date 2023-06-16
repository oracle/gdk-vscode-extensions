import * as vscode from 'vscode';
import { isBoolean, isInIs, isNumber, isObject, isString, isTypeArray } from './typeUtils';

export type DatabaseConnectionInfo = {
    "connectionType"?: string;
    "connectionName": string;
    "dbaPrivilege"?: string;
    "dataSource": string;
    "tnsAdmin": string;
    "walletLocation"?: string;
    "userName": string;
    "authenticationType"?: string;
    "proxyUsername"?: string;
    "passwordRequired"?: boolean;
    "proxyPasswordRequired"?: boolean;
    "loginScript"?: string;
    "password"?: string;
};

export async function registerDatabases(dbNode?: any) {
    const databaseInfos = dbNode ? convertToDBConnectionInfo(dbNode) : await pickDatabase();
    if (!databaseInfos) { return; }
    for (const databaseInfo of databaseInfos) {
        registerDatabase(databaseInfo);
    }
}

function convertToDBConnectionInfo(dbNode: unknown): [DatabaseConnectionInfo] | undefined {
    if (isObject(dbNode)
        && isInIs('connectionProperties', dbNode, isObject)
        && isInIs('userID', dbNode.connectionProperties, isString)
        && isInIs('dataSource', dbNode.connectionProperties, isString)
        && isInIs('tnsAdmin', dbNode.connectionProperties, isString)) {
        return [{
            userName: dbNode.connectionProperties.userID,
            dataSource: dbNode.connectionProperties.dataSource,
            tnsAdmin: dbNode.connectionProperties.tnsAdmin,
            connectionName: dbNode.connectionProperties.dataSource,
            password: "password" in dbNode.connectionProperties
                && isTypeArray(dbNode.connectionProperties.password, isNumber)
                ? String.fromCharCode(...dbNode.connectionProperties.password)
                : undefined
        }];
    }
    return undefined;
}

function registerDatabase(databaseInfo: DatabaseConnectionInfo) {
    const userId: string = databaseInfo.userName;
    const dataSource: string = databaseInfo.dataSource;
    const info = {
        userId,
        url: `jdbc:oracle:thin:@${dataSource}?TNS_ADMIN=\"${databaseInfo.tnsAdmin}\"`,
        password: readPassword(databaseInfo),
        driver: "oracle.jdbc.OracleDriver",
        schema: userId.toUpperCase(),
        displayName: dataSource,
    };
    vscode.commands.executeCommand('db.add.connection', info);
}

function readPassword(databaseInfo: DatabaseConnectionInfo): string | undefined {
    return databaseInfo.password ? databaseInfo.password : undefined;
}

type QuickPickItemWithContent<T extends object> = vscode.QuickPickItem & { content: T };
function asQuickPicks<T extends object>(parts: T[], title: (part: T) => string): QuickPickItemWithContent<T>[] {
    return parts.map((p) => asQuickPick(p, title));
}

function asQuickPick<T extends object>(part: T, title: (part: T) => string): QuickPickItemWithContent<T> {
    return { label: title(part), content: part };
}

async function pickDatabase(): Promise<DatabaseConnectionInfo[] | undefined> {
    const connections = await getODTDatabaseConnections();
    if (connections.length === 0) { return undefined; }
    const selectedItems = await vscode.window.showQuickPick(asQuickPicks(connections, c => c.connectionName), { canPickMany: true });
    if (!selectedItems || selectedItems.length === 0) { return undefined; }
    return selectedItems.map(i => i.content);
}

export async function getODTDatabaseConnections(): Promise<DatabaseConnectionInfo[]> {
    const databases = vscode.commands.executeCommand("oracledevtools.getDBExplorerConnections");
    if (!(databases && typeof databases === "string")) { return []; }
    const dat = JSON.parse(databases);
    if (!("oracledevtools.connections" in dat)) { return []; }
    const conns = dat["oracledevtools.connections"];
    if (!(conns && isTypeArray(conns, isDatabaseConnectionInfo))) { return []; }
    return conns;
}

function isDatabaseConnectionInfo(obj: unknown): obj is DatabaseConnectionInfo {
    return isObject(obj)
        && isInIs("connectionType", obj, isString, false)
        && isInIs("connectionName", obj, isString)
        && isInIs("dbaPrivilege", obj, isString, false)
        && isInIs("dataSource", obj, isString)
        && isInIs("tnsAdmin", obj, isString)
        && isInIs("walletLocation", obj, isString, false)
        && isInIs("userName", obj, isString)
        && isInIs("authenticationType", obj, isString, false)
        && isInIs("proxyUsername", obj, isString, false)
        && isInIs("passwordRequired", obj, isBoolean, false)
        && isInIs("proxyPasswordRequired", obj, isBoolean, false)
        && isInIs("loginScript", obj, isString, false)
        && isInIs("password", obj, isString, false);
}