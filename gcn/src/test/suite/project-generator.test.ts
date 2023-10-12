/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import { NodeFileHandler } from '../../gcnProjectCreate';
import * as Common from '../../common';

import * as jdkUtils from 'jdk-utils';
import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

export enum BuildTools {
    Maven = 'MAVEN',
    Gradle = 'GRADLE',
    Unsupported = 'Unsupported',
}

export enum SupportedJavas {
    AnyJava17 = 'java17',
    Unsupported = 'Unsupported',
    AnyJava = 'java'
}

export enum Features {
    DATABASE = "DATABASE",
    EMAIL = "EMAIL",
    K8S = "K8S",
    LOGGING = "LOGGING",
    METRICS = "METRICS",
    OBJECTSTORE = "OBJECTSTORE",
    SDK = "SDK",
    SECRETMANAGEMENT = "SECRETMANAGEMENT",
    SECURITY = "SECURITY",
    STREAMING = "STREAMING",
    TRACING = "TRACING"
}

interface CreateOptions {
    homeDir: string;
    options: Common.CreateOptions;
}

function generateUID(): string {
    const fullUUID = uuidv4();
    const shortUUID = fullUUID.substr(0, 8);
    return shortUUID;
}

async function getCreateOptions(buildTool: BuildTools, java: SupportedJavas, services: string[]): Promise<CreateOptions> {

    const javaRuntimes = await jdkUtils.findRuntimes({ checkJavac: true });
    const selectedJavaRuntime = javaRuntimes.find(x => x.homedir.includes(java));

    // javaRuntimes.forEach(x => console.log(x.homedir));

    if (selectedJavaRuntime == null || selectedJavaRuntime == undefined) {
        throw new Error(`${java} was not found, only these GraalVMs are present:` + javaRuntimes.map(x => x.homedir).join(";\n"));
    }
    // console.log("selected runtime is: " + selectedJavaRuntime.homedir);

    return {
        homeDir: selectedJavaRuntime.homedir,
        options: {
            micronautVersion: {
                label: "4.0.0",
                serviceUrl: "",
            },
            applicationType: "APPLICATION",
            buildTool: buildTool,
            language: "JAVA",
            testFramework: "JUNIT",
            basePackage: "com.example",
            projectName: "demo",
            javaVersion: `JDK_17`, //TODO make a variable
            clouds: [
                "OCI"
            ],
            services: [
                ...services
            ],
            features: undefined,
        }
    };
}

function getName(buildTool: BuildTools, services: string[]) {
    let name: string = buildTool + "_";
    if (services.length > 0)
        name += services.join("_") + "_";
    name += generateUID();
    return name;
}

/**
 * Creates project with given specification
 * @param buildTool is a tool you want the project to be initialized with
 * @param services are services you want the project to be initialized with
 * @param java is a java runtime you want the project to be initialized with
 * @returns path to the created project
 */
export async function createProject(buildTool: BuildTools, services: Features[], java: SupportedJavas = SupportedJavas.AnyJava): Promise<string> {
    try {
        await Common.initialize();

        const options = await getCreateOptions(buildTool, java, services);
        const relPath = path.join("..", "..", "..", "out", "test", "projects", getName(buildTool, services));
        let projFolder: string = path.resolve(__dirname, relPath);
        if (!fs.existsSync(projFolder)) {
            fs.mkdirSync(projFolder, { recursive: true });
        }

        if (!fs.existsSync(projFolder)) {
            fs.rmSync(projFolder);
        }
        await Common.writeProjectContents(options.options, new NodeFileHandler(vscode.Uri.file(projFolder)));
        return projFolder;
    }
    catch (e: any) {
        assert.fail("Project options were not resolved properly: " + e.message);
    }
}

suite('Creating projects', function () {
    this.timeout(10000);

    test("Create maven", async () => {
        const path = await createProject(BuildTools.Maven, [Features.OBJECTSTORE]);
        assert.ok(fs.existsSync(path));
    });

    test("Create gradle", async () => {
        const path = await createProject(BuildTools.Gradle, [Features.OBJECTSTORE]);
        assert.ok(fs.existsSync(path));
    });

});
