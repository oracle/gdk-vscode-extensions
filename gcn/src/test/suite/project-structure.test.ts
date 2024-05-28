/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as Common from '../../common';
import { NodeFileHandler } from '../../gcnProjectCreate';

/**
 * Creates a project inside a temp directory and returns its path
 * @param options
 * @param name 
 */
async function createProject(options : Common.CreateOptions, name : string) : Promise<string> {
    let projFolder : string = path.resolve(__dirname, '../../../out/test/' + name);
            
    if (!fs.existsSync(projFolder)) {
        fs.mkdirSync(projFolder, { recursive: true });
    
    }
    await Common.writeProjectContents(options, new NodeFileHandler(vscode.Uri.file(projFolder)));

    return projFolder;
}

/**
 * Compares project structure on file system to json-provided rules (comparable). Json format can be found in README.md inside /fixtures/project-structure
 * @param projPath 
 * @param comparable 
 * @returns 
 */
function compareStructures(projPath : string, comparable : any) : boolean {
    // resolve structure
    if ('structure' in comparable) {
        // resolve contains
        if ('contains' in comparable['structure']) {
            for ( let i = 0; i < comparable['structure']['contains'].length; ++i) {
                const item : any = comparable['structure']['contains'][i];
                if (!('path' in item)) continue;
                const path : string = projPath + "/" + item['path'];

                assert(fs.existsSync(path), "Path " + path + " does not exists - expected a valid path");
                
                if ('type' in item) {
                    const isDirectory : boolean = fs.lstatSync(path).isDirectory();
                    if (item["type"] === "directory" || item["type"] === "d" || item['type'] === 'dir') {
                        assert(isDirectory, "Path " + path + " is not a directory - expected a directory, got file");
                    } else {
                        assert(!isDirectory, "Path " + path + " is not a file - expected a file, got directory");
                    }
                }
            }
        }
        // resolve does-not contain
        if ("-contains" in comparable['structure']) {
            for ( let i = 0; i < comparable['structure']['-contains'].length; ++i) {
                const item : any = comparable['structure']['-contains'][i];
                if (!('path' in item)) continue;
                const path : string = projPath + "/" + item['path'];

                assert(!fs.existsSync(path), "Path " + path + " exists - expected an invalid path");
                
            }
        }
    }
    
    // resolve regex matching
    if ("contents" in comparable) {
        if ("contains" in comparable['contents']) {
            for ( let i = 0; i < comparable['contents']['contains'].length; ++i) {
                const item : any = comparable['contents']['contains'][i];
                if (!('path' in item) || !('match' in item) ) continue;

                const path : string = projPath + "/" + item['path'];
                assert(fs.existsSync(path), "Path " + path + " does not exists - expected a valid file");
                
                const isFile : boolean = fs.lstatSync(path).isFile();
                assert(isFile, "Path " + path + " is not a file - expected a file");

                const data : string = fs.readFileSync(path, 'utf8');
                const re = new RegExp(item['match']);
                assert(re.test(data), "File " + path + " contents do not math specified value: " + item['match']);
            }
        }
    }
    return true;
}

/**
 * Encapsulates code for creating a project with given options, loading json structure specs, comparing and asserts created project structure
 * @param options 
 * @param name 
 */
async function createAndTest(options : Common.CreateOptions, name : string) : Promise<void> {
    const projFolder : string = await createProject(options, name);
    const jsonPath = path.resolve(__dirname, '../../../fixtures/project-structure/' + name + ".json");
    const jsonString = fs.readFileSync(jsonPath, 'utf-8');
    const jsonData = JSON.parse(jsonString);
    compareStructures(projFolder, jsonData);

    fs.rmdirSync(projFolder, {recursive:true});
}

/**
 * Suit for testing project structure
 */
suite('Project structure Test Suite', function() {
    this.timeout(10000);

	vscode.window.showInformationMessage('Start all tests.');

        // Requirements for testing project structure - GDK extension present, create project action present 
        test("Setup environment", async () => {
            // Make sure writeProjectContents is ready before creating any project
            await Common.initialize();

            let extension = vscode.extensions.getExtension('oracle-labs-graalvm.gcn');
            assert(extension, "No GDK extension found!");
            await extension.activate();

            // check if the command for project creation is present
            let commands : string[] = await vscode.commands.getCommands(true);
            assert(commands.indexOf("gdk.createGdkProject") != -1, "Command to create GDK project not found");
        });

        // configuration for creating a project
        let options : Common.CreateOptions = {
            micronautVersion: {
                label: "3.7.4",
                serviceUrl: "",
            },
            applicationType: "APPLICATION",
            buildTool: "GRADLE",
            language: "JAVA",
            testFramework: "JUNIT",
            basePackage: "com.example",
            projectName: "demo",
            javaVersion: "JDK_17",
            clouds: [],
            services: undefined,
            features: undefined,
        };

        test("Basic Gradle project", async () => {            
            const name = "base-example";
            let testOptions : Common.CreateOptions = {...options};

            await createAndTest(testOptions, name);
        });


        test("Basic Maven project", async () => {            
            const name = "maven-basic";
            let testOptions : Common.CreateOptions = {...options};
            testOptions['buildTool'] = "MAVEN";

            await createAndTest(testOptions, name);
        });

        test("OCI project", async () => {            
            const name = "oci-proj";
            let testOptions : Common.CreateOptions = {...options};
            testOptions['clouds'] = ["OCI"];

            await createAndTest(testOptions, name);
        });

        test("AWS project", async () => {            
            const name = "aws-proj";
            let testOptions : Common.CreateOptions = {...options};
            testOptions['clouds'] = ["AWS"];

            await createAndTest(testOptions, name);
        });

        test("Project with selected services", async () => {            
            const name = "custom-services";
            let testOptions : Common.CreateOptions = {...options};
            testOptions['clouds'] = ["OCI", "AWS"];
            testOptions["services"] = ["DATABASE", "EMAIL", "LOGGING", "METRICS", "TRACING"];

            await createAndTest(testOptions, name);
        });

});
