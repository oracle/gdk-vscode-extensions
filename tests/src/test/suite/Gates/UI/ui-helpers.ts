/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import assert from "assert";
import path from "path";
import { ActivityBar, DefaultTreeSection, ExtensionsViewSection, ModalDialog, SideBarView, VSBrowser, Workbench } from "vscode-extension-tester";
import * as fs from 'fs';

export async function installExtension(extensionTitle: string): Promise<void> {
    const extensionTab = await new ActivityBar().getViewControl('Extensions');
    if (extensionTab === undefined) {
        assert.fail('Could not open extensions tab');
    }

    const openExtensionTab = await extensionTab.openView();
    const extensionSection = (await openExtensionTab.getContent().getSection('Installed')) as ExtensionsViewSection;

    const item = await extensionSection.findItem(extensionTitle);
    if (item === undefined) {
        assert.fail('Item ' + extensionTitle + ' not found');
    }

    if (!(await item.isInstalled())) {
        await item.install();
    }

    assert.ok(await item.isInstalled());
    assert.ok(await item.isEnabled());

    await extensionSection.clearSearch();
    await new Promise((f) => setTimeout(f, 5000));
}

/**
 * Returns all projects in a given path
 * @param projFolder is a path to a folder with projects
 * @returns array of projects
 */
export function getAllProjects(projFolder: string): Project[] {
    if (!fs.existsSync(projFolder)) return [];

    const items = fs.readdirSync(projFolder);
    const folders: Project[] = [];

    for (const item of items) {
        const itemPath = path.join(projFolder, item);

        if (fs.lstatSync(itemPath).isDirectory()) {
            const project: Project = {
                prectName: item,
                projetPath: itemPath,
            };
            folders.push(project);
        }
    }

    return folders;
}

export interface Project {
    prectName: string;
    projetPath: string;
}

export function failFast() {
    afterEach(function () {
        const test = this.currentTest;
        if (test?.isFailed() && test.parent) {
            skipAll(test.parent);
        }
    });
}
function skipAll(suite: Mocha.Suite) {
    for (const test of suite.tests) {
        if (!test.state) {
            test.pending = true;
        }
    }
    for (const s of suite.suites)
        skipAll(s);
}

export function openAndWaitTest(project: Project): Promise<DefaultTreeSection> {
    const tree = openProjectTest(project);
    waitForIndexingTest();
    return tree;
}

export function waitForIndexingTest() {
    it("Wait for startup", async function () {
        while (true) {
            await new Promise(f => setTimeout(f, 2000));
            const items = await new Workbench().getStatusBar().getItems();
            for (const item of items) {
                const msg = await item.getText();
                if ("Indexing completed." === msg) {
                    return;
                }
            }
        }
    }).timeout(300000).slow(50000);
}

class NakedPromise<T> {
    resolve: (value: T | PromiseLike<T>) => void = () => null;
    reject: (reason?: any) => void = () => null;
    promise: Promise<T>;
    constructor() {
        this.promise = new Promise<T>((res, rej) => { this.resolve = res; this.reject = rej; });
    }
}

export function openProjectTest(project: Project): Promise<DefaultTreeSection> {
    const prom = new NakedPromise<DefaultTreeSection>();
    it("Open project", async () => {
        assert.ok(fs.existsSync(project.projetPath));
        await VSBrowser.instance.openResources(project.projetPath);
        (await new ActivityBar().getViewControl("Explorer"))?.openView();
        const content = new SideBarView().getContent();

        await new Promise((f) => setTimeout(f, 10000));

        // we do not want to fail test if dialog is not shown
        try {
            const dialog = new ModalDialog();
            await dialog.pushButton("Yes");
        } catch { }

        const tree = (await content.getSection(
            project.prectName
        )) as DefaultTreeSection;
        if (tree)
            prom.resolve(tree);
        else {
            const msg = "DefaultTreeSection not found.";
            prom.reject(new Error(msg));
            assert.fail(msg);
        }
    }).timeout(300000).slow(20000);
    return prom.promise;
}