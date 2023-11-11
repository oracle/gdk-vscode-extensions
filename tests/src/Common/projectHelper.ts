/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import path from 'path';
import { GeneratedProject, ProjectDescription, TestFolder, TestFolders } from './types';
import { copyRecursiveSync, getSubDirs } from './helpers';
import { AbstractTestDescriptor } from './abstractTestDescriptor';

const rootPath = path.resolve(__dirname, '..', '..');
const generatedProjectsPath = path.join(rootPath, 'generated-projects');
const testProjectsPath = path.join(rootPath, 'out', 'test-projects');
export type TestRun = { [projectPath: string]: string[] };
export function prepareAPITests(testCases: TestFolders): TestRun {
  const out: TestRun = {};
  const splitted: [TestFolders, TestFolders] = [{}, {}];
  for (const directory of Object.keys(testCases)) {
    const tmp: TestFolder = testCases[directory];
    if (tmp[0].isDestructive()) splitted[1][directory] = tmp;
    else splitted[0][directory] = tmp;
  }
  prepareDestructiveTests(out, splitted[1]);
  prepareUndestructiveTests(out, splitted[0]);
  return out;
}

function prepareDestructiveTests(out: TestRun, testCases: TestFolders) {
  for (const dir of Object.keys(testCases)) {
    const testCase = testCases[dir];
    for (const outDir of prepareTest(testCase)) out[outDir] = testCase[1].map((test) => path.join(dir, test));
  }
}

function prepareUndestructiveTests(out: TestRun, testCases: TestFolders) {
  const tmp: {
    [key: string]: {
      project: ProjectDescription;
      tests: string[];
    };
  } = {};
  for (const dir of Object.keys(testCases)) {
    const testCase: TestFolder = testCases[dir];
    for (const description of testCase[0].getProjectDescriptions()) {
      const tag = makeTag(description);
      if (!(tag in tmp)) tmp[tag] = { project: description, tests: [] };
      tmp[tag].tests.push(...testCase[1].map((tp) => path.join(dir, tp)));
    }
  }
  for (const prep of Object.values(tmp)) out[copyTestProject(prep.project, testProjectsPath)] = prep.tests;
}

export function prepareUITests(testCases: TestFolders) {
  for (const directory of Object.keys(testCases)) {
    prepareTest(testCases[directory]);
  }
}

function prepareTest(testCase: TestFolder): string[] {
  const descriptor = testCase[0];
  const projects = descriptor.getProjectDescriptions();
  const out = [];
  for (const project of projects) {
    out.push(copyTestProject(project, descriptor.projectsPath));
  }
  return out;
}

function copyTestProject(project: ProjectDescription, destination: string): string {
  if (project._type === 'copied') return doCopyProject(absoluteCopyPath(project.copyPath), destination);
  const projectSource = getProjectFolder(project);
  for (const subdir of getSubDirs(projectSource)) {
    const projPath = path.join(projectSource, subdir);
    if (isPathToProject(projPath)) {
      return doCopyProject(projPath, destination);
    }
  }
  throw new Error("Project to copy isn't pressent at: " + projectSource);
}

function absoluteCopyPath(copyPath: string): string {
  return path.isAbsolute(copyPath) ? copyPath : path.resolve(rootPath, copyPath);
}

function makeTag(project: ProjectDescription): string {
  return project._type === 'copied'
    ? absoluteCopyPath(project.copyPath)
    : relativeGeneratedProjectPath(project).join(',');
}

function doCopyProject(projPath: string, destination: string): string {
  const dest = path.join(destination, path.basename(projPath));
  copyRecursiveSync(projPath, dest, true);
  return dest;
}

function relativeGeneratedProjectPath(project: GeneratedProject): string[] {
  const parts = [];
  parts.push(project.buildTool);
  parts.push(...project.features.sort());
  return parts;
}

export function gatherProjectsToGenerate(descriptors: AbstractTestDescriptor[]): GeneratedProject[] {
  const out: GeneratedProject[] = [];
  for (const proj of unifyProjects(descriptors))
    if (proj._type === 'generated' && !isAlreadyGeneratedProject(proj)) out.push(proj);
  return out;
}

function unifyProjects(descriptors: AbstractTestDescriptor[]): ProjectDescription[] {
  const gathering: { [key: string]: ProjectDescription } = {};
  for (const descriptor of descriptors)
    for (const project of descriptor.getProjectDescriptions()) gathering[makeTag(project)] = project;
  return Object.values(gathering);
}

function getProjectFolder(project: GeneratedProject): string {
  return path.join(generatedProjectsPath, ...relativeGeneratedProjectPath(project));
}

function isPathToProject(folder: string): boolean {
  return path.basename(folder).includes('_');
}

function isAlreadyGeneratedProject(project: GeneratedProject): boolean {
  const folder = getProjectFolder(project);
  for (const subdir of getSubDirs(folder)) if (isPathToProject(path.join(folder, subdir))) return true;
  return false;
}

export async function generateProjects(projects: GeneratedProject[]) {
  const generator = require('./project-generator');
  for (const project of projects) {
    const destination = getProjectFolder(project);
    await generator.createGcnProject(project.buildTool, project.features, destination, project.java);
  }
}
