import { CopiedProject, GeneratedProject, BuildTool, Feature, SupportedJava, Arg } from './types';
import * as fs from 'fs';
import * as path from 'path';
import { AbstractTestDescriptor } from './abstractTestDescriptor';
import { glob } from 'glob';

export function getSubDirs(projectPath: string): string[] {
    return fs.existsSync(projectPath)
        ? fs.readdirSync(projectPath, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name)
        : [];
}

export function getDescriptors(testFolder: string): AbstractTestDescriptor[] {
    return getSubDirs(testFolder)
        .map(dir => getDescriptor(path.join(testFolder, dir)))
        .filter(td => td !== undefined);
}

export function getDescriptor(dir: string): AbstractTestDescriptor {
    const tsFile = path.join(dir, 'testDescriptor');
    return fs.existsSync(tsFile + ".js") ? new (require(tsFile)).TestDescriptor() : undefined;
}


export function findFiles(testFolder: string, ...globPatterns: string[]): { [directory: string]: string[] } {
    const out: { [directory: string]: string[] } = {};
    for (const pattern of globPatterns) {
        const files = glob.sync(pattern, { cwd: testFolder, matchBase: true });
        for (let file of files) {
            file = path.join(testFolder, file);
            const dir = path.dirname(file);
            if (!(dir in out)) {
                out[dir] = [];
            }
            const fileName = path.basename(file);
            const outDir = out[dir];
            if (!outDir.includes(fileName))
                outDir.push(fileName);
        }
    }
    return out;
}

export function gatherTestCases(testFolder: string, ...globPatterns: string[]): { [directory: string]: [AbstractTestDescriptor, string[]] } {
    const tmp: { [directory: string]: string[] } = findFiles(testFolder, ...globPatterns);
    const out: { [directory: string]: [AbstractTestDescriptor, string[]] } = {};
    for (const dir in tmp) {
        const newFiles = [];
        for (const file of tmp[dir]) {
            if (file.endsWith('test.js'))
                newFiles.push(file);
        }
        if (newFiles.length === 0)
            continue;
        const desc = getDescriptor(dir);
        if (desc)
            out[dir] = [desc, newFiles];
    }
    return out;
}

export function genProj(buildTool: BuildTool, features: Feature[], name?: string, java?: SupportedJava): GeneratedProject {
    return { _type: 'generated', buildTool, features, java, name };
}

export function copProj(copyPath: string, name?: string): CopiedProject {
    return { _type: 'copied', copyPath, name };
}

export function copyProject(desc: CopiedProject, dest: string): void {
    const src = desc.copyPath.replace("out", "src");
    dest = path.join(dest, path.basename(src));
    fs.rmSync(dest, { recursive: true, force: true });
    copyRecursiveSync(src, dest);
}

export function copyRecursiveSync(src: string, dest: string) {
    var exists = fs.existsSync(src);
    if (!exists) {
        throw new Error("Src doesn't exist: " + src);
    }
    _copyRecursiveSync(src, dest);
}

function _copyRecursiveSync(src: string, dest: string) {
    var stats = fs.statSync(src);
    var isDirectory = stats.isDirectory();
    if (isDirectory) {
        if (!fs.existsSync(dest))
            fs.mkdirSync(dest, { recursive: true });
        fs.readdirSync(src).forEach(childItemName =>
            _copyRecursiveSync(
                path.join(src, childItemName),
                path.join(dest, childItemName)
            ));
    } else {
        fs.copyFileSync(src, dest);
    }
}

export function parseArgs(args: string[]): Arg<string>[] {
    let current: Arg<string> = { name: '__all__', args: [] };
    const out: Arg<string>[] = [current];
    for (const arg of args) {
        if (arg.startsWith('--')) {
            current = { name: arg.slice(2), args: [] };
            out.push(current);
        } else
            current.args.push(arg);
    }
    out[0].args = out[0].args.slice(2);
    return out;
}