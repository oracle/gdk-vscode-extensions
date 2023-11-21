/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import {
  Workbench,
  EditorView,
  InputBox,
} from 'vscode-extension-tester';
import { TestDescriptor } from './testDescriptor';
import * as assert from 'assert';
const forEach = require('mocha-each');
import * as fs from 'fs';
import { Project, getAllProjects, installExtension, openAndWaitTest } from '../ui-helpers';

describe('Go to Micronaut symbols test', async () => {
  it('Install extensions', async () => {
    await installExtension('Micronaut Tools');
  }).timeout(300000);

  forEach(getAllProjects(new TestDescriptor().projectsPath))
    .describe('Extension Go to Micronaut symbols tests for %(prectName)s', function (project: Project) {

      before(() => {
        if (!fs.existsSync(project.projetPath)) {
          assert.fail('Folder does not exist ' + project);
        }
      });

      openAndWaitTest(project);

      it('Gets endpoint symbols', async () => {
        // Open Go to Symbol in Workspace
        await new Workbench().executeCommand('workbench.action.showAllSymbols');
        const input: InputBox = await InputBox.create();
        await input.setText('#@/');
        let hasProgress;
        do {
          await new Promise((f) => setTimeout(f, 1000));
          hasProgress = await input.hasProgress();
        } while (hasProgress);
        const picks = await input.getQuickPicks();
        assert.ok(picks.length > 0, 'No endpoint symbols found');
        const text = await picks[0].getText();
        await input.selectQuickPick(0);
        const activeTab = await new EditorView().getActiveTab();
        const activeTitle = await activeTab?.getTitle();
        assert.ok(activeTitle && text.endsWith(activeTitle));
      }).timeout(300000);

      it('Gets bean symbols', async () => {
        // Open Go to Symbol in Workspace
        await new Workbench().executeCommand('workbench.action.showAllSymbols');
        const input: InputBox = await InputBox.create();
        await input.setText('#@+');
        let hasProgress;
        do {
          await new Promise((f) => setTimeout(f, 1000));
          hasProgress = await input.hasProgress();
        } while (hasProgress);
        const picks = await input.getQuickPicks();
        assert.ok(picks.length > 0, 'No beans symbols found');
        const text = await picks[0].getText();
        await input.selectQuickPick(0);
        const activeTab = await new EditorView().getActiveTab();
        const activeTitle = await activeTab?.getTitle();
        assert.ok(activeTitle && text.endsWith(activeTitle));
      }).timeout(120000);
    })
    .timeout(900000);
}).timeout(1100000);
