/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import {
  ActivityBar,
  EditorTab,
  EditorView,
  SideBarView,
  TextEditor,
  ViewContent,
  ViewControl,
  ViewItem,
  ViewSection,
} from 'vscode-extension-tester';
import * as assert from 'assert';
import * as fs from 'fs';
import { failFast, getAllProjects, installExtension, openAndWaitTest } from '../ui-helpers';
import { TestDescriptor } from './testDescriptor';

describe('Micronaut-tools REST UI', async function () {
  it('Install extensions', async () => {
    await installExtension('Micronaut Tools');
  })
    .timeout(300000)
    .slow(15000);

  getAllProjects(new TestDescriptor().projectsPath).forEach((project) => {
    describe(`Project ${project.prectName}`, function () {
      this.slow(1000);
      this.timeout(10000);
      failFast();

      before(() => {
        if (!fs.existsSync(project.projetPath)) {
          assert.fail('Folder does not exist ' + project);
        }
      });

      openAndWaitTest(project);

      const baseData: {
        micronautActivityBar?: ViewControl;
        micronauView?: SideBarView;
        viewContent?: ViewContent;
      } = {};
      it('Get Action Bar', async function () {
        baseData.micronautActivityBar = await new ActivityBar().getViewControl('Micronaut Tools');
        assert.ok(baseData.micronautActivityBar, "Micronaut Tools Action Bar couldn't be located.");
      });

      it('Get Action Bar View', async function () {
        baseData.micronauView = await baseData.micronautActivityBar?.openView();
        assert.ok(baseData.micronauView, "Micronaut Tools View couldn't be opened.");
      });

      it('Get View Content', async function () {
        baseData.viewContent = baseData.micronauView?.getContent();
        assert.ok(baseData.viewContent, "Micronaut Tools View content couldn't be obtained.");
      });

      describe('Endpoints', function () {
        const endpointsData: {
          endpointsSection?: ViewSection;
          endpointsItems?: ViewItem[];
          endpoints?: { [key: string]: ViewItem };
          endpointsActiveTab?: EditorTab;
        } = {};
        it('Get Content Endpoints Section', async function () {
          endpointsData.endpointsSection = await baseData.viewContent?.getSection('Endpoints');
          assert.ok(endpointsData.endpointsSection, "Micronaut Tools Endpoints UI couldn't be located.");
        });

        it('Check Endpoints length', async function () {
          endpointsData.endpointsItems = await endpointsData.endpointsSection?.getVisibleItems();
          assert.strictEqual(
            endpointsData.endpointsItems?.length,
            3,
            "Micronaut Tools Endpoints UI doesn't contain expected amount of items.",
          );
        });

        const expectedEndpointLocations: { [key: string]: number } = {
          '/pictures/{userId}DELETE': 94,
          '/pictures/{userId}GET': 80,
          '/pictures/{userId}POST': 56,
        };
        it('Check Endpoints content', async function () {
          endpointsData.endpoints = {};
          for (const endpointsItem of endpointsData.endpointsItems ?? [])
            endpointsData.endpoints[await endpointsItem.getText()] = endpointsItem;
          assert.deepStrictEqual(Object.keys(endpointsData.endpoints), Object.keys(expectedEndpointLocations));
        });

        it('Navigate Endpoints', async function () {
          assert.ok(endpointsData.endpoints, 'Unexpected empty Endpoints.');
          for (const endpointText of Object.keys(endpointsData.endpoints)) {
            const endpointItem = endpointsData.endpoints[endpointText];
            await endpointItem.click();
            const editorView = new EditorView();
            endpointsData.endpointsActiveTab = await editorView.getActiveTab();
            const activeTitle = (await endpointsData.endpointsActiveTab?.getTitle()) ?? '';
            assert.strictEqual(
              activeTitle,
              'ProfilePicturesController.java',
              'Endpoint ' + endpointText + " didn't navigate to target.",
            );
            const location = await new TextEditor(editorView).getCoordinates();
            assert.strictEqual(
              expectedEndpointLocations[endpointText],
              location[0],
              'Endpoint ' + endpointText + " didn't navigate to correct location.",
            );
            await editorView.closeEditor(activeTitle);
          }
        })
          .timeout(15000)
          .slow(10000);
      });

      describe('Beans', function () {
        const beansData: {
          beansSection?: ViewSection;
          beansItems?: ViewItem[];
          beanActiveTab?: EditorTab;
        } = {};
        it('Get Content Beans Section', async function () {
          beansData.beansSection = await baseData.viewContent?.getSection('Beans');
          assert.ok(beansData.beansSection, "Micronaut Tools Beans UI couldn't be located.");
        });

        it('Check Beans length', async function () {
          beansData.beansItems = await beansData.beansSection?.getVisibleItems();
          assert.strictEqual(
            beansData.beansItems?.length,
            1,
            "Micronaut Tools Beans UI doesn't contain expected amount of items.",
          );
        });

        it('Check Beans content', async function () {
          const expectedBeansTexts = ['profilePicturesController'];
          const beansTexts = [];
          for (const beansItem of beansData.beansItems ?? []) beansTexts.push(await beansItem.getText());
          assert.deepStrictEqual(beansTexts, expectedBeansTexts);
        });

        it('Navigate Bean', async function () {
          assert.ok(beansData.beansItems, 'Unexpected empty Beans');
          for (const beanItem of beansData.beansItems) {
            const text = await beanItem.getText();
            await beanItem.click();
            const editorView = new EditorView();
            beansData.beanActiveTab = await editorView.getActiveTab();
            const activeTitle = await beansData.beanActiveTab?.getTitle();
            assert.strictEqual(
              activeTitle,
              'ProfilePicturesController.java',
              'Bean ' + text + " didn't navigate to target.",
            );
            const location = await new TextEditor(editorView).getCoordinates();
            const expectedBeanLocation = 42;
            assert.strictEqual(
              expectedBeanLocation,
              location[0],
              'Bean ' + text + " didn't navigate to correct location.",
            );
            await editorView.closeEditor(activeTitle);
          }
        });
      });
    }).timeout(900000);
  });
}).timeout(1100000);
