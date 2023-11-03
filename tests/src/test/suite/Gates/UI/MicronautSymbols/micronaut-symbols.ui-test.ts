/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import {
  Workbench,
  ActivityBar,
  DefaultTreeSection,
  EditorView,
  VSBrowser,
  SideBarView,
  ModalDialog,
  InputBox,
  ExtensionsViewSection,
} from "vscode-extension-tester";
import * as path from "path";
import * as assert from "assert";
const forEach = require("mocha-each");
import * as fs from "fs";

async function installExtension(extensionTitle: string): Promise<void> {
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

function getAllProjects(projFolder: string): Project[] {
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

interface Project {
  prectName: string;
  projetPath: string;
}

describe("Go to Micronaut symbols test", async () => {

  it("Install extensions", async () => {
    await installExtension("Micronaut Tools");
  }).timeout(300000);

  forEach(getAllProjects(path.join("src", "test", "suite", "Gates", "UI", "MicronautSymbols", "projects")))
    .describe("Extension Go to Micronaut symbols tests for %(prectName)s", function (project: Project) {
      let tree: DefaultTreeSection;

      before(() => {
        if (!fs.existsSync(project.projetPath)) {
          assert.fail("Folder does not exist " + project);
        }
      });

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

        tree = (await content.getSection(
          project.prectName
        )) as DefaultTreeSection;
        assert.ok(tree !== undefined);
      }).timeout(300000);

      it("Wait for startup", async () => {
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
      }).timeout(300000);

      it("Gets endpoint symbols", async () => {
        // Open Go to Symbol in Workspace
        await new Workbench().executeCommand("workbench.action.showAllSymbols");
        const input: InputBox = await InputBox.create();
        await input.setText("#@/");
        let hasProgress;
        do {
          await new Promise(f => setTimeout(f, 1000));
          hasProgress = await input.hasProgress();
        } while (hasProgress);
        const picks = await input.getQuickPicks();
        assert.ok(picks.length > 0, "No endpoint symbols found");
        const text = await picks[0].getText();
        await input.selectQuickPick(0);
        const activeTab = await new EditorView().getActiveTab();
        const activeTitle = await activeTab?.getTitle();
        assert.ok(activeTitle && text.endsWith(activeTitle));
      }).timeout(300000);;

      it("Gets bean symbols", async () => {
        // Open Go to Symbol in Workspace
        await new Workbench().executeCommand("workbench.action.showAllSymbols");
        const input: InputBox = await InputBox.create();
        await input.setText("#@+");
        let hasProgress;
        do {
          await new Promise(f => setTimeout(f, 1000));
          hasProgress = await input.hasProgress();
        } while (hasProgress);
        const picks = await input.getQuickPicks();
        assert.ok(picks.length > 0, "No beans symbols found");
        const text = await picks[0].getText();
        await input.selectQuickPick(0);
        const activeTab = await new EditorView().getActiveTab();
        const activeTitle = await activeTab?.getTitle();
        assert.ok(activeTitle && text.endsWith(activeTitle));
      }).timeout(120000);
    }).timeout(900000);
}).timeout(1100000);
