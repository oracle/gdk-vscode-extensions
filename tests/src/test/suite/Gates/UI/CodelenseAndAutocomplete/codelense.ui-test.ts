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
  VSBrowser,
  Notification,
  CodeLens,
  SideBarView,
  ExtensionsViewSection,
  ModalDialog,
  BottomBarPanel,
  ContentAssist,
  TreeItem,
} from 'vscode-extension-tester';
import * as path from 'path';
import * as assert from 'assert';
import * as fs from 'fs';
import { TestDescriptor } from './testDescriptor';
const forEach = require('mocha-each');

async function getItems(): Promise<Notification[]> {
  return await new Workbench().getNotifications();
}

async function getLenses(): Promise<CodeLens[]> {
  return await new TextEditor().getCodeLenses();
}

async function getTerminal(): Promise<string> {
  await new Promise((f) => setTimeout(f, 30000));
  const terminalView = await new BottomBarPanel().openTerminalView();
  const text = (await terminalView.getText()).trim();
  return text;
}

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

async function compareIntellisense(assist: ContentAssist, ...items: string[]): Promise<string[]> {
  await new Promise((f) => setTimeout(f, 2000));
  const elements = await assist.getItems();
  assert.ok(elements.length > 0);
  const labels = await Promise.all(
    elements.map(async (item): Promise<string> => {
      return await item.getLabel();
    }),
  );
  const setLabels = new Set(labels);
  const setItems = new Set(items);

  const difference = [...setItems].filter((x) => !setLabels.has(x));
  // console.log("hints are: " + labels.join("; "))
  return difference;
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

    if (notifications.length) {
      return notifications;
    }

    await new Promise((f) => setTimeout(f, step));
    numberOfTries -= 1;
  } while (numberOfTries > 0);

  assert.fail('Timeout for ' + getItemsFunction.name);
}

/**
 * Adds some dummy files to resolve UI test properly
 * @param projFolder is a path you want to edit
 */
async function editProject(projFolder: string) {
  let filename = path.join(projFolder, 'oci', 'src', 'main', 'java');

  fs.writeFile(path.join(filename, 'index'), 'index', (err) => {
    if (err) {
      assert.fail('Error creating empty file: ' + err);
    }
  });

  filename = path.join(filename, 'com');
  fs.writeFile(path.join(filename, 'index'), 'index', (err) => {
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
  if (!fs.existsSync(projFolder)) {
    return [];
  }

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

  // console.log(folders.length + " projects found");
  return folders;
}

/**
 * Opens item at the location and returns it's children
 * @param tree is a tree you want to ipen the item in
 * @param itemPath in the tree to the item
 * @returns children of item on given path
 */
async function openItemInExplorer(tree: DefaultTreeSection, ...itemPath: string[]): Promise<TreeItem[]> {
  let children;
  const items = await tree.getVisibleItems();
  const labels = await Promise.all(items.map((item) => item.getLabel()));

  if (labels.includes('oci')) {
    // for GCN
    children = await tree.openItem('oci', ...itemPath);
  } else if (labels.includes('src')) {
    // for Micronaut
    children = await tree.openItem(...itemPath);
  } else {
    assert.fail('Unknown project structrure');
  }
  return children;
}

interface Project {
  prectName: string;
  projetPath: string;
}

describe('Editor test', async () => {
  it('Install extensions', async () => {
    await installExtension(`Extension Pack for Java`);
    await installExtension('Micronaut Tools');
  }).timeout(300000);

  const descriptor = new TestDescriptor();
  // iterate throgh all projects
  forEach(getAllProjects(descriptor.projectsPath))
    .describe('Extension codelense tests for %(prectName)s', (project: Project) => {
      let tree: DefaultTreeSection;

      before(() => {
        if (!fs.existsSync(project.projetPath)) {
          assert.fail('folder does not exist ' + project);
        }
        editProject(project.projetPath);
      });

      it('Open project', async () => {
        assert.ok(fs.existsSync(project.projetPath));
        await VSBrowser.instance.openResources(project.projetPath);
        (await new ActivityBar().getViewControl('Explorer'))?.openView();
        const content = new SideBarView().getContent();

        await new Promise((f) => setTimeout(f, 10000));

        // we do not want to fail test if dialog is not shown
        try {
          const dialog = new ModalDialog();
          await dialog.pushButton('Yes');
        } catch {}

        tree = (await content.getSection(project.prectName)) as DefaultTreeSection;
        assert.ok(tree !== undefined);
      }).timeout(300000);

      describe('Application.java test', () => {
        it('Open file', async () => {
          const children = await openItemInExplorer(tree, 'src', 'main', 'java', 'com', 'example', 'Application.java');

          // it is file
          assert.strictEqual(children.length, 0);
          const editors = await new EditorView().getOpenEditorTitles();
          assert.ok(editors.includes('Application.java'));
        }).timeout(300000);

        it('Wait for startup', async () => {
          await new EditorView().openEditor('Application.java');

          const notifications = await waitForItems(getItems, 30);
          const list: string[] = [];
          for (const notification of notifications) {
            const message = await notification.getMessage();
            list.push(message);
          }

          // we do not want to fail test if dialog is not shown
          try {
            assert.ok(list.includes('Opening Java Projects: check details'));
          } catch {}
        }).timeout(300000);

        describe('Codelense test', () => {
          {
            let runWIthMicronaut: CodeLens;
            it('Gets codelenses', async () => {
              await new EditorView().openEditor('Application.java');

              const notifications = await waitForItems(getItems, 30);
              const list: string[] = [];
              for (const notification of notifications) {
                const message = await notification.getMessage();
                list.push(message);
              }

              // we do not want to fail test if dialog is not shown
              try {
                assert.ok(list.includes('Opening Java Projects: check details'));
              } catch {}

              const codelenses = await waitForItems(getLenses, 60);

              assert.strictEqual(codelenses.length, 3);
              runWIthMicronaut = codelenses[0];
              assert.strictEqual(await runWIthMicronaut.getText(), 'Run with Micronaut Continuous Mode');
            }).timeout(300000);

            it('Executes codelense', async () => {
              if (runWIthMicronaut === undefined) {
                assert.fail('Getting codelenses failed');
              }
              await new Promise((f) => setTimeout(f, 20000));
              try {
                await runWIthMicronaut.click();
              } catch {
                // try to locate it one more time
                runWIthMicronaut = (await waitForItems(getLenses, 60))[0];
                await runWIthMicronaut.click();
              }

              if (!(await getTerminal()).includes('Server Running')) {
                // sometimes we need to click it twico to invoke action properly
                await (await new TextEditor().getCodeLens(0))?.click();
                const terminal = await getTerminal();
                assert.ok(terminal.includes('Server Running'), terminal);
              }
              (await new BottomBarPanel().openTerminalView()).killTerminal();
            }).timeout(120000);
          }
        }).timeout(600000);

        describe('Code completions test', () => {
          {
            it('Write text', async () => {
              const edit = new EditorView();
              await edit.openEditor('Application.java');
              const editor = new TextEditor();

              await new Promise((f) => setTimeout(f, 10000));

              const text = '\nbuilder.';
              await editor.typeTextAt(31, 56, text);
            }).timeout(300000);

            it('Completes code', async () => {
              const edit = new EditorView();
              await edit.openEditor('Application.java');
              const editor = new TextEditor(edit);

              editor.moveCursor(32, 21);
              await new Promise((f) => setTimeout(f, 15000));
              const assist = (await editor.toggleContentAssist(true)) as ContentAssist;

              assert.ok(await assist.isDisplayed());
              const items = await compareIntellisense(assist, 'build');
              assert.ok(items.length === 0, items.join(';'));

              await editor.toggleContentAssist(false);
            }).timeout(300000);

            it('Clean text', async () => {
              const edit = new EditorView();
              const editor = new TextEditor(edit);

              // TODO delete whole line
              await editor.setTextAtLine(32, '');
              await new Promise((f) => setTimeout(f, 15000));
              await editor.save();
              await new Promise((f) => setTimeout(f, 15000));
            }).timeout(300000);
          }
        }).timeout(600000);
      }).timeout(900000);

      describe('.properties test', () => {
        it('Open file', async () => {
          const children = await openItemInExplorer(
            tree,
            'src',
            'main',
            'resources',
            'application-oraclecloud.properties',
          );

          // it is file
          assert.strictEqual(children.length, 0);

          const editors = await new EditorView().getOpenEditorTitles();
          assert.ok(editors.includes('application-oraclecloud.properties'));
        }).timeout(300000);

        describe('Code completion test', () => {
          {
            it('Completes code', async () => {
              const edit = new EditorView();
              await edit.openEditor('application-oraclecloud.properties');
              const editor = new TextEditor(edit);

              editor.moveCursor(5, 1);
              await new Promise((f) => setTimeout(f, 10000));

              const assist = (await editor.toggleContentAssist(true)) as ContentAssist;
              assert.ok(await assist.isDisplayed());

              const items = await compareIntellisense(assist, 'application');
              assert.ok(items.length === 0, items.join(';'));

              await editor.toggleContentAssist(false);
            }).timeout(300000);
          }
        }).timeout(600000);
      }).timeout(900000);
    })
    .timeout(1000000);
}).timeout(1100000);
