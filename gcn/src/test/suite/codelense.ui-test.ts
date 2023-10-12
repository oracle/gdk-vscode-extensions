/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import {
  Workbench,
  TextEditor,
  ActivityBar,
  DefaultTreeSection,
  EditorView,
  ViewContent,
  VSBrowser,
  Notification,
  CodeLens,
  SideBarView,
  ExtensionsViewSection,
  ModalDialog,
  BottomBarPanel,
} from 'vscode-extension-tester';
import * as path from 'path';
import * as assert from 'assert';
const forEach = require('mocha-each');
import * as fs from 'fs';

async function getItems(): Promise<Notification[]> {
  return await new Workbench().getNotifications();
}

async function getLenses(): Promise<CodeLens[]> {
  return await new TextEditor().getCodeLenses();
}

async function getTerminal(): Promise<string> {
  await new Promise(f => setTimeout(f, 20000));
  const terminalView = await new BottomBarPanel().openTerminalView();
  const text = (await terminalView.getText()).trim();
  return text;
}

async function installExtension(extensionTitle: string): Promise<void> {
  let view1 = await new ActivityBar().getViewControl('Extensions');
  if (view1 === undefined)
    assert.fail("Could not open extensions tab");

  let view = await view1.openView();
  let section1 = await view.getContent().getSection("Installed") as ExtensionsViewSection;

  let item1 = await section1.findItem(extensionTitle);
  if (item1 === undefined)
    assert.fail("Item " + extensionTitle + " not found");

  if (!(await item1.isInstalled()))
    await item1.install();

  assert.ok(await item1.isInstalled());
  assert.ok(await item1.isEnabled());

  await section1.clearSearch();
  await new Promise(f => setTimeout(f, 5000));
}

/**
 * Waits until atleast on item is visible or until it timeouts
 * @param getItemsFunction is a function that returns wanted items
 * @param numberOfTries says how many times we want to repeat
 * @param step is a step between each try
 * @returns array of wanted items
 */
async function waitForItems<K>(getItemsFunction: () => Promise<K[]>, numberOfTries: number, step = 2000): Promise<K[]> {
  do {
    const notifications = await getItemsFunction();

    if (notifications.length)
      return notifications;

    await new Promise(f => setTimeout(f, step));
    numberOfTries -= 1;
  } while (numberOfTries > 0);

  assert.fail("Timeout for " + getItemsFunction.name);
}

/**
 * Adds some dummy files to resolve UI test properly
 * @param projFolder is a path you want to edit
 */
async function editProject(projFolder: string) {

  let filename = path.join(projFolder, 'oci', "src", "main", "java");

  fs.writeFile(path.join(filename, "index"), 'index', (err) => {
    if (err) {
      assert.fail('Error creating empty file: ' + err);
    }
  });

  filename = path.join(filename, "com");
  fs.writeFile(path.join(filename, "index"), 'index', (err) => {
    if (err) {
      assert.fail('Error creating empty file: ' + err);
    }
  });
}


/**
 * Returns all projects in a given path
 * @param projFolder is a path to a folder with projects
 * @returns array of projects
 */
function getAllProjects(projFolder: string): Project[] {

  if (!fs.existsSync(projFolder))
    return [];

  const items = fs.readdirSync(projFolder);
  const folders: Project[] = [];

  for (const item of items) {
    const itemPath = path.join(projFolder, item);

    if (fs.lstatSync(itemPath).isDirectory()) {
      const project: Project = {
        prectName: item,
        projetPath: itemPath
      };
      folders.push(project);
    }
  }

  // console.log(folders.length + " projects found");
  return folders;
}

interface Project {
  prectName: string;
  projetPath: string;
}

describe("CodeLense test", async () => {
  it("Install extensions", async () => {
    await installExtension(`Extension Pack for Java`);
    await installExtension("Micronaut Tools");
  }).timeout(60000);

  // iterate throgh all projects
  forEach(
    getAllProjects(path.join("out", "test", "projects"))
  )
    .describe('Extension codelense tests for %(prectName)s', function (project: Project) {
      let content: ViewContent;


      before(() => {
        if (!fs.existsSync(project.projetPath)) {
          assert.fail("folder does not exist " + project);
        }
        editProject(project.projetPath);
      });

      it("Open project", async () => {

        assert.ok(fs.existsSync(project.projetPath));
        await VSBrowser.instance.openResources(project.projetPath);
        (await new ActivityBar().getViewControl('Explorer'))?.openView();
        content = new SideBarView().getContent();

        await new Promise(f => setTimeout(f, 10000));

        // we do not want to fail test if dialog is not shown
        try {
          const dialog = new ModalDialog();
          await dialog.pushButton('Yes');
        }
        catch { }

      }).timeout(60000);

      describe('Project test', () => {

        let tree: DefaultTreeSection;

        it('Opened project', async () => {
          tree = await content.getSection(project.prectName) as DefaultTreeSection;
          assert.ok(tree !== undefined);
        }).timeout(60000);

        it('Opened file', async () => {

          const items = await tree.getVisibleItems();
          const labels = await Promise.all(items.map(item => item.getLabel()));
          let children;

          if (labels.includes("oci")) { // for GCN
            children = await tree.openItem('oci', "src", "main", "java", "com", "example", "Application.java");
          }
          else if (labels.includes("src")) { // for Micronaut
            children = await tree.openItem("src", "main", "java", "com", "example", "Application.java");
          }
          else {
            assert.fail("Unknown project structrure");
          }

          // it is file
          assert.strictEqual(children.length, 0);

          const editors = await new EditorView().getOpenEditorTitles();
          assert.ok(editors.includes("Application.java"));

        }).timeout(60000);

        let runWIthMicronaut: CodeLens;
        it('Gets codelenses', async () => {
          await new EditorView().openEditor("Application.java");

          const notifications = await waitForItems(getItems, 30);
          let list: string[] = [];
          for (const notification of notifications) {
            const message = await notification.getMessage();
            list.push(message);
          }

          // we do not want to fail test if dialog is not shown
          try {
            assert.ok(list.includes("Opening Java Projects: check details"));
          }
          catch { }

          let codelenses = await waitForItems(getLenses, 60);

          // TODO known bug in redhat-extension-tester, it returns only the first codelense
          assert.strictEqual(codelenses.length, 1);
          runWIthMicronaut = codelenses[0];
          assert.strictEqual(await runWIthMicronaut.getText(), "Run with Micronaut Continuous Mode");
        }).timeout(60000);;

        it('Executes codelense', async () => {
          await new Promise(f => setTimeout(f, 15000));
          await runWIthMicronaut.click();

          if (!(await getTerminal()).includes("Server Running")) {
            // sometimes we need to click it twico to invoke action properly
            await (await new TextEditor().getCodeLens(0))?.click();
            const terminal = await getTerminal();
            assert.ok(terminal.includes("Server Running"), terminal);
          }
        }).timeout(120000);

        after(async () => {
          // if (fs.existsSync(projectPath.projetPath)) {
          //   fs.rmdirSync(projectPath.projetPath, { recursive: true });
          // }
        });
      }).timeout(240000);

    });

}).timeout(300000);
