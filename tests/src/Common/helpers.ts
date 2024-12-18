/*
 * Copyright (c) 2023, 2024, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';
import { v4 as uuidv4 } from 'uuid';
import { SupportedJava, type Arg, type CopiedProject } from './types';
import * as jdkUtils from 'jdk-utils';

/**
 * Return list of names of sub directories in parent folder
 * @param projectPath parent folder
 * @returns sub directories names or empty list
 */
export function getSubDirs(projectPath: string): string[] {
  return fs.existsSync(projectPath)
    ? fs
        .readdirSync(projectPath, { withFileTypes: true })
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => dirent.name)
    : [];
}

/**
 * Finds all files matching glob pattern in parent folder and its subdirectories
 * @param testFolder parent folder
 * @param globPatterns glob pattern for filename resolution
 * @returns object where keys are folder paths and values are lists of filenames
 */
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

export function copProj(copyPath: string, name?: string): CopiedProject {
  return { _type: 'copied', copyPath, name };
}

/**
 * Copies src folder to dest folder if src folder exists
 * @param src source folder
 * @param dest destination folder
 * @param clean true the destination folder will be removed before copy
 */
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

/**
 * Parses launch arguments into "simple" list of objects {@link Arg} to ease of use
 * @param args launch arguments
 * @returns parsed arguments
 */
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

/**
 * Generates 8 character long UUID
 * @returns 8 characters long random string
 */
export function generateUID(): string {
  const fullUUID = uuidv4();
  const shortUUID = fullUUID.substr(0, 8);
  return shortUUID;
}

/**
 * 
 * @param java supported java
 * @returns selected java runtime
 */
export async function selectJavaRuntime (java: SupportedJava): Promise<jdkUtils.IJavaRuntime> {
  let javaRuntimes = await jdkUtils.findRuntimes({ checkJavac: true, withVersion: true });
  
  let major : number | undefined;
  switch (java) {
    case SupportedJava.AnyJava: 
      major = 11; 
      break;
    case SupportedJava.JDK_17: 
    case SupportedJava.AnyJava17: 
      major = 17; 
      break;
    case SupportedJava.Unsupported:
    default:
      major = undefined;
      break;
  }

  const selectedJavaRuntime = javaRuntimes.find((x) => 
      major == undefined || (x.version && x.version.major >= major
  ));

  if (selectedJavaRuntime === null || selectedJavaRuntime === undefined) {
    throw new Error(
      `${java} was not found, only these GraalVMs are present:` + javaRuntimes.map((x) => x.homedir).join(';\n'),
    );
  }

  return selectedJavaRuntime;
}
