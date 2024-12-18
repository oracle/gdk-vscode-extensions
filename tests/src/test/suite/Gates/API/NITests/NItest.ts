/*
 * Copyright (c) 2023, 2024, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as assert from 'assert';
import * as fs from 'fs';
import axios from 'axios';
import { ChildProcess, exec, spawn } from 'child_process';
import path = require('path');
import { NodeFileHandler } from '../../../../../../../gcn/out/gcnProjectCreate';
import * as vscode from 'vscode';
import * as Common from '../../../../../../../gcn/out/common';
import { BuildTool, Feature, SupportedJava } from '../../../../../Common/types';
import { getGcnCreateOptions } from '../../../../../Common/gcn-generator';
import { getMicronautCreateOptions } from '../../../../../Common/micronaut-generator';
import { __writeProject } from '../../../../../../../micronaut/out/projectCreate';

/**
 * Creates GDK project with given specification
 * @param buildTool is a tool you want the project to be initialized with
 * @param services are services you want the project to be initialized with
 * @param java is a java runtime you want the project to be initialized with
 * @returns path to the created project
 */
export async function createGcnProjectNiTest(
  buildTool: BuildTool,
  services: Feature[],
  relativePath: string[],
  java: SupportedJava = SupportedJava.AnyJava,
): Promise<string> {
  try {
    await Common.initialize();
    relativePath = relativePath.slice(-5);

    const options = await getGcnCreateOptions(buildTool, java, services);
    const relPath = path.join(...relativePath);
    const projFolder: string = path.resolve(relPath);

    if (!fs.existsSync(projFolder)) {
      fs.mkdirSync(projFolder, { recursive: true });
    }
    assert.ok(fs.existsSync(projFolder));

    await Common.writeProjectContents(options.options, new NodeFileHandler(vscode.Uri.file(projFolder)));
    assert.ok(fs.existsSync(projFolder));
    return options.homeDir;
  } catch (e: any) {
    assert.fail('Project options were not resolved properly: ' + e.message);
  }
}

export async function createMicronautProjectNiTest(
  buildTool: BuildTool,
  relativePath: string[],
): Promise<string> {
  try {
    await Common.initialize();

    relativePath = relativePath.slice(-5);

    const options = await getMicronautCreateOptions(buildTool);

    const relPath = path.join(...relativePath);
    const projFolder: string = path.resolve(relPath);

    if (!fs.existsSync(projFolder)) {
      fs.mkdirSync(projFolder, { recursive: true });
    }
    assert.ok(fs.existsSync(projFolder));
    options.target = projFolder;
    await __writeProject(options);
    assert.ok(fs.existsSync(options.target));
    assert.ok(options.url);
    return options.url;
  } catch (e: any) {
    assert.fail('Project options were not resolved properly: ' + e.message);
  }
}

export class TestHelper {
  private readonly getRunParameters: (buildTool: BuildTool, test: Tests) => [string, string[]];
  private readonly totalTimeInterval: number;
  private server: ChildProcess | null = null;
  private defaltFodler: string;
  private controllerPath: string;
  private debug: boolean;

  /**
   * Class constructor
   * @param getRunParameters fucntion that returns run parameters
   * @param timeout is timeout
   * @param baseFolder is a base folder
   * @param controllerFolder is a controller path, relative to project, without ControllerName
   */
  constructor(
    getRunParameters: (buildTool: BuildTool, test: Tests) => [string, string[]],
    timeout: number,
    baseFolder: string,
    controllerFolder: string,
  ) {
    this.getRunParameters = getRunParameters;
    this.totalTimeInterval = timeout;
    this.defaltFodler = path.join(path.resolve(baseFolder));
    this.controllerPath = controllerFolder;

    if (fs.existsSync(this.defaltFodler)) {
      this.log('folder exists');
      try {
        this.removeFunc(this.defaltFodler);
      } catch (e: any) {
        assert.fail(e.message + 'initial');
      }
    }
    try {
      this.log('creating new folder');
      fs.mkdirSync(this.defaltFodler, { recursive: true });
    } catch (e: any) {
      assert.fail(e.message + 'mkdir');
    }

    // process.env.DEBUG = 'true';
    this.debug = process.env.DEBUG?.toLowerCase() === 'true';
  }

  /**
   * Get project folder for given buildtool
   * @param buildTool is a tool you want a path for
   * @returns projet folder for a project
   */
  public getFolder(buildTool: BuildTool): string {
    return path.join(this.defaltFodler, buildTool.toString());
  }

  /**
   * Fail when inner function succeeds
   * @param innerFunction is a function what should fail
   * @param description is a test description
   * @returns true if inner function fails, false otherwise
   */
  public async NotCreateProject(innerFunction: () => Promise<void>, description: string): Promise<boolean> {
    let ok = false;
    try {
      test('Run new Maven project' + description, async () => {
        await innerFunction();
      }).timeout(this.totalTimeInterval);
    } catch (e: any) {
      if (e instanceof assert.AssertionError) {
        ok = true;
      }
    }
    return ok;
  }

  /**
   * Main test function
   * @param createMyProject function that creates project
   * @param description test description
   * @param runTest if you want to start server
   * @param compileTest if you want to compile
   * @param maven if you want to run tests for maven
   * @param gradle if you want to run tests for gradle
   */
  public async CreateProject(
    createMyProject: (buildTools: BuildTool) => Promise<string>,
    description: string = '',
    runTest: boolean = true,
    compileTest: boolean = false,
    maven: boolean = true,
    gradle: boolean = true,
  ): Promise<void> {
    this.log('entered CreateProect Fucntion');
    if (runTest) {
      this.log('entered runtest');
      if (maven) {
        this.log('maven');
        // test whether maven project is created successfully
        test('Run new Maven project' + description, async () => {
          await this.CreateAndTestProject(createMyProject, BuildTool.Maven, TestCases.RunServer);
        }).timeout(this.totalTimeInterval);
      }
      if (gradle) {
        this.log('maven');
        // test whether gradle project is created successfully
        test('Create new Gradle project' + description, async () => {
          await this.CreateAndTestProject(createMyProject, BuildTool.Gradle, TestCases.RunServer);
        }).timeout(this.totalTimeInterval);
      }
    }

    if (compileTest) {
      this.log('entered compile');
      if (maven) {
        this.log('gradle');
        // test whether maven project is natively compiled successfully
        test('NativeCompile Maven project' + description, async () => {
          await this.CreateAndTestProject(createMyProject, BuildTool.Maven, TestCases.NativeServer);
        }).timeout(this.totalTimeInterval);
      }
      if (gradle) {
        this.log('maven');
        // test whether gradle project is natively compiled successfully
        test('NativeCompile Gradle project' + description, async () => {
          await this.CreateAndTestProject(createMyProject, BuildTool.Gradle, TestCases.NativeServer);
        }).timeout(this.totalTimeInterval);
      }
    }
  }

  private log(message: string) {
    if (this.debug) return;
    console.log('\x1b[34m', message);
    console.log('\x1b[0m', '');
  }

  private writeLog(message: string) {
    if (this.debug) return;
    console.log('\x1b[36m', message);
    console.log('\x1b[0m', '');
  }

  private removeFunc(projFolder: string) {
    this.log('deleting fodler' + projFolder);
    fs.rmSync(projFolder, { recursive: true });
  }

  private serverResponse = (randomNumber: number) => `Server response is ${randomNumber}`;

  private createController(directoryName: string, randomNumber: number): boolean {
    const fileName = 'HelloController.java';
    const filePath = path.join(directoryName, this.controllerPath, fileName);
    const fileContent = `
  package com.example;

  import io.micronaut.http.MediaType;
  import io.micronaut.http.annotation.Controller;
  import io.micronaut.http.annotation.Get;
  import io.micronaut.http.annotation.Produces;
  
  @Controller("/test${randomNumber}") 
  public class HelloController {
      @Get 
      @Produces(MediaType.TEXT_PLAIN) 
      public String index() {
        return "${this.serverResponse(randomNumber)}"; 
      }
  }
  `;

    let value = true;
    try {
      fs.writeFileSync(filePath, fileContent);
    } catch (e: any) {
      value = false;
      console.log('Cannot create a controller:' + e.message);
    }
    return value;
  }

  private timeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    const timeout = new Promise<T>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Function timeouted after ${ms}ms`));
      }, ms);
    });
    return Promise.race([promise, timeout]);
  }

  private async waitForServer(totalTime: number, message: string) {
    let isRunning = false;
    let logs = '';

    const error = (log: string) => {
      if (!isRunning) throw new Error(log + logs);
    };

    if (this.server == null) {
      throw new Error('Server is null');
    }

    if (this.server.stdout === null) {
      throw new Error('server.stdout is null' + logs);
    }

    const checker = (data: string) => {
      logs += data;
      this.writeLog(data.toString());
      if (data.includes(message)) {
        logs += data;
        isRunning = true;
      } else if (data.includes('build failure') || data.includes('BUILD FAILURE')) {
        logs += data;
        this.server?.kill();
      }
    };

    this.server.stdout.on('data', checker);
    this.server.on('close', (code) => {
      if (code !== 0) {
        error('closes' + logs);
      }
    });
    this.server.on('exit', (code) => {
      if (code !== 0) {
        error('exites' + logs);
      }
    });

    this.server.on('error', error);

    if (this.server.stderr != null && this.debug) {
      this.server.stderr.on('data', (data) => {
        this.writeYellow(data.toString());
      });
    }

    const interval = 50;
    let maxTries = totalTime / interval;

    while (!isRunning) {
      maxTries--;
      if (maxTries <= 0) {
        throw new Error('Server timeouted' + logs);
      }
      await new Promise((f) => setTimeout(f, interval));
    }
    this.server.stdout.off('data', checker);

    return true;
  }

  /**
   * Tests whether project was created properly
   * @param buildTool is a build tool you want to test with
   * @param java default: [java=SupportedJavas.AnyJava17] is Java you want to test with
   * @param test is a test
   * @returns void or throws assert.exception
   */
  private async CreateAndTestProject(
    createMyProject: (buildTools: BuildTool) => Promise<string>,
    buildTool: BuildTool,
    test: TestCases,
  ) {
    const randomNumeber = Math.random();
    const server: ChildProcess | null = null; // TODO

    const projFolder = this.getFolder(buildTool);
    this.log('entered CreateAndTestProject');
    try {
      if (fs.existsSync(projFolder)) {
        this.log('fodler exists' + projFolder);
        this.removeFunc(projFolder);
      }
      this.log('creating new fodler');
      fs.mkdirSync(this.defaltFodler, { recursive: true });

      this.log('creating project');
      process.env.GRAALVM_HOME = await createMyProject(buildTool);
      this.log('project created');
      assert.ok(fs.existsSync(projFolder), 'Project folder exists');
      assert.ok(this.createController(projFolder, randomNumeber), 'Controller was created');
      const time = this.totalTimeInterval * 0.9;
      switch (test) {
        case TestCases.RunServer:
          const timeStartFactor = 1 / 10;
          await this.timeout<void>(
            this.startServer(time * timeStartFactor, buildTool, projFolder, randomNumeber),
            this.totalTimeInterval * timeStartFactor,
          );
          break;
        case TestCases.NativeServer:
          const timeCompileFactor = 8 / 10;
          await this.timeout<void>(
            this.compileServer(time * timeCompileFactor, buildTool, projFolder),
            this.totalTimeInterval * timeCompileFactor,
          );
          break;
        default:
          break;
      }
    } catch (e: any) {
      assert.fail(e.message);
    } finally {
      if (server !== null) {
        (server as ChildProcess).kill();
      }
      if (projFolder != null) {
        this.removeFunc(projFolder);
      }
    }
    return;
  }

  private writeYellow(message: string) {
    console.log('\x1b[33m', message);
    console.log('\x1b[0m', '');
  }

  private async startServer(totalTime: number, buildTool: BuildTool, folder: string, randomNumber: number) {
    this.log('entered startServer');
    const runParameters = this.getRunParameters(buildTool, Tests.Run);
    this.log('run parametrs');
    this.server = spawn(runParameters[0], runParameters[1], { cwd: folder, shell: true });
    this.log('spawned');
    const port = convertStringToInt(process.env.MICRONAUT_SERVER_PORT, 8080);
    this.log('port converted');
    await this.waitForServer(totalTime, `Server Running: http://localhost:${port}`);
    this.log('waiting');

    assert.ok(
      (await axios.get(`http://localhost:${port}/test${randomNumber}`)).data === this.serverResponse(randomNumber),
      'Correct server response',
    );
    (this.server as ChildProcess).kill();
    this.server = null;
  }

  private async compileServer(totalTime: number, buildTool: BuildTool, folder: string) {
    const runParameters = this.getRunParameters(buildTool, Tests.NativeComp);
    this.log('entered compile server');
    this.server = spawn(runParameters[0], runParameters[1], { cwd: folder, shell: true });

    assert.ok(await this.waitForServer(totalTime, 'BUILD SUCCESS'), 'first fail');
    (this.server as ChildProcess).kill();
    this.server = null;
    if (buildTool === BuildTool.Gradle) {
      return;
    }

    const runParameter = flat(this.getRunParameters(buildTool, Tests.NativePackage));
    this.server = exec(runParameter, { cwd: folder });

    assert.ok(await this.waitForServer(totalTime, 'BUILD SUCCESS'), 'second fail');
    (this.server as ChildProcess).kill();
    this.server = null;
  }
}

/**
 * Converts string to number
 * @param input is a string that should be converted
 * @param defaultValue is a value in case of error
 * @returns if can be converted, returns input as number otherwise default number
 */
export function convertStringToInt(input: string | undefined, defaultValue: number): number {
  if (input != null) {
    const parsed = parseInt(input, 10);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return defaultValue;
}

/**
 * Enum for types of tests
 */
export enum Tests {
  Run,
  NativePackage,
  NativeComp,
}

/**
 * Enum for types of TestCases
 */
export enum TestCases {
  RunServer,
  NativeServer,
}

function flat(arr: [string, string[]]): string {
  return arr[0] + ' ' + arr[1].join(' ');
}

// /**
//  * @param pid is the id of the running process
//  * @returns
//  */
// async function storePID (pid: number): Promise<void> {
//     let pidFile = path.resolve(__dirname,"../");
//     if(!fs.existsSync(pidFile + "/file.txt")){
//         let head = `PID \n-----------------\n`;
//         fs.writeFileSync(pidFile + "/file.txt", head, { encoding: 'utf-8'});
//     }
//     assert.ok(fs.existsSync(pidFile + "/file.txt"))
//     let content = fs.readFileSync(pidFile + "/file.txt", {encoding: 'utf-8'});
//     content += `${pid}\n`;
//     fs.writeFileSync(pidFile + "/file.txt", content, { encoding: 'utf-8'});
// }
