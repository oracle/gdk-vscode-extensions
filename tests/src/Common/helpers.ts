/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';
import { getDescriptor } from './testHelper';
import { Arg, BuildTool, CopiedProject, Feature, GeneratedProject, SupportedJava, TestFolders } from './types';

export function getSubDirs(projectPath: string): string[] {
    return fs.existsSync(projectPath)
        ? fs
            .readdirSync(projectPath, { withFileTypes: true })
            .filter((dirent) => dirent.isDirectory())
            .map((dirent) => dirent.name)
        : [];
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
            if (!outDir.includes(fileName)) outDir.push(fileName);
        }
    }
    return out;
}

export function genProj(
    buildTool: BuildTool,
    features: Feature[],
    name?: string,
    java?: SupportedJava,
): GeneratedProject {
    return { _type: 'generated', buildTool, features, java, name };
}

export function copProj(copyPath: string, name?: string): CopiedProject {
    return { _type: 'copied', copyPath, name };
}

export function copyRecursiveSync(src: string, dest: string, clean: boolean = false) {
    if (!fs.existsSync(src)) {
        throw new Error("Src doesn't exist: " + src);
    }
    if (clean && fs.existsSync(dest)) fs.rmSync(dest, { force: true, recursive: true });
    _copyRecursiveSync(src, dest);
}

function _copyRecursiveSync(src: string, dest: string) {
    if (fs.statSync(src).isDirectory()) {
        if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
        for (const childItemName of fs.readdirSync(src))
            _copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
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
        } else current.args.push(arg);
    }
    out[0].args = out[0].args.slice(2);
    return out;
}
