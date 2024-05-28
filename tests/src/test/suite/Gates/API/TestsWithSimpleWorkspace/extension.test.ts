/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

import * as Common from '../../../../../../../gcn/out/common';
import { NodeFileHandler } from '../../../../../../../gcn/out/gcnProjectCreate';

/**
 * Searches value inside an array of ValueAndLabel
 *
 * @param arrayOfValues
 * @param search
 * @returns
 */
function valueExists(arrayOfValues: Common.ValueAndLabel[], search: string): boolean {
  for (const arrayElem of arrayOfValues) {
    if (arrayElem.value === search) {
      return true;
    }
  }
  return false;
}

suite('Extension Test Suite', function () {
  vscode.window.showInformationMessage('Start all tests.');
  this.timeout(10 * 1000);
  // This test must be run first, in order to activate the extension (and wait for the activation to complete)
  test('Extension loaded', async () => {
    // let java = vscode.extensions.getExtension("vscjava.vscode-java-pack");
    // assert(java, "No java ext found");
    // await java.activate();

    const extension = vscode.extensions.getExtension('oracle-labs-graalvm.gcn');
    assert(extension, 'No GDK extension found!');
    await extension.activate();
  });
  // Check if GDK commands have been loaded
  test('GDK commands loaded', async () => {
    const commands = await vscode.commands.getCommands(true);

    let containsGcnCommands = false;
    for (const command of commands) {
      if (command.indexOf('gdk.') === 0) {
        containsGcnCommands = true;
      }
    }

    assert.ok(containsGcnCommands, 'No GDK command has been loaded');
  });

  // configuration for creating a project
  const options = {
    micronautVersion: {
      label: '3.7.4',
      serviceUrl: '',
    },
    applicationType: 'APPLICATION',
    buildTool: 'GRADLE',
    language: 'JAVA',
    testFramework: 'JUNIT',
    basePackage: 'com.example',
    projectName: 'demo',
    javaVersion: 'JDK_17',
    clouds: ['OCI'],
    services: undefined,
    features: undefined,
  };

  test('Create GDK project - Project options', async () => {
    // init gcnAPI
    await Common.initialize();

    const micronautVersions = Common.getMicronautVersions();
    assert.ok(micronautVersions.length, 'No micronaut versions found');

    const applicationTypes = await Common.getApplicationTypes();
    assert.ok(applicationTypes.length, 'No application type found');
    assert.ok(valueExists(applicationTypes, 'APPLICATION'));

    const buildTools = Common.getBuildTools();
    assert.ok(buildTools.length, 'No build tools found');
    assert.ok(valueExists(buildTools, 'GRADLE'));

    const testFrameworks = Common.getTestFrameworks();
    assert.ok(testFrameworks.length, 'No test frameworks found');
    assert.ok(valueExists(testFrameworks, 'JUNIT'));

    const clouds = Common.getClouds();
    assert.ok(clouds.length, 'No cloud platforms found');
    assert.ok(valueExists(clouds, 'OCI'));
  }).timeout(60 * 1000);

  // create OCI project
  test('Create GDK project - Create project', async () => {
    const projFolder = path.resolve(__dirname, '../../../out/test/temp-proj');

    // TODO: This function fails mid-run and partialy populated project is created but not deleted. Make sure `projFolder` is empty.
    if (!fs.existsSync(projFolder)) {
      fs.mkdirSync(projFolder, { recursive: true });
    }
    await Common.writeProjectContents(options, new NodeFileHandler(vscode.Uri.file(projFolder)));

    fs.rmSync(projFolder, { recursive: true });
  }).timeout(60 * 1000);
});
