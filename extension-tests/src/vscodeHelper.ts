 /*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import { downloadAndUnzipVSCode, resolveCliArgsFromVSCodeExecutablePath } from '@vscode/test-electron';
import { includeInPreferences,  } from './extensionHelper';
import { prepareExtensions } from './extensionHelper';
import * as cp from 'child_process';

export const extensionRoot = process.env['TEST_EXTENSION_DIR'] || process.cwd();

/**
 * Downloads and unzips VSCode and does needed setup
 * @returns path to vscode test installation executable
 */
export async function prepareVSCode(): Promise<string> {
  // Install extensions
  const vscodeExecutablePath = await downloadAndUnzipVSCode('1.84.0');

  const [cli, ...args] = resolveCliArgsFromVSCodeExecutablePath(vscodeExecutablePath);
  // make basic folder structure before we start to generate config files
  cp.spawnSync(cli, [...args, '--list-extensions'], {
    encoding: 'utf-8',
    stdio: 'inherit',
    shell: true
  });


  const proxyFull = process.env['http_proxy'];
  if (proxyFull !== undefined && proxyFull.length > 0) {
    const proxyHost = proxyFull.slice(proxyFull.lastIndexOf('/') + 1, proxyFull.lastIndexOf(':'));
    const proxyPort = proxyFull.slice(proxyFull.lastIndexOf(':') + 1);
    // TODO: in the presence of a proxy, consider to define MAVEN_ARGS and pass a copy of settings with a maven proxy definition.
    // Similar with Gradle, GRADLE_USER_HOME can point to a private directory with gradle settings altered. 
    includeInPreferences(
      'java.jdt.ls.vmargs',
      `-Dhttp.proxyHost=${proxyHost} -Dhttp.proxyPort=${proxyPort} -Dhttps.proxyHost=${proxyHost} -Dhttps.proxyPort=${proxyPort}`,
    );
  } else {
    includeInPreferences('java.jdt.ls.vmargs');
  }
  // have possible buildfile changes recognized automatically.
  includeInPreferences("java.configuration.updateBuildConfiguration", "automatic");
  if (process.env['TEST_JENKINS_BUILDERS']) {
    includeInPreferences(
      'gdk.test.jenkinsBuilders',
      process.env['TEST_JENKINS_BUILDERS']
    );
  }
  if (process.env['TEST_EXTENSION_DOWNLOADS']) {
    includeInPreferences(
      'gdk.test.extensionDownloads',
      process.env['TEST_EXTENSION_DOWNLOADS']
    );
  }
  if (process.env['TEST_DEPLOY_COMPARTMENT_OCID']) {
    includeInPreferences(
      'gdk.test.compartmentOCID',
      process.env['TEST_DEPLOY_COMPARTMENT_OCID']
    );
  }

  includeInPreferences('java.imports.gradle.wrapper.checksums', [
    {
      sha256: 'a8451eeda314d0568b5340498b36edf147a8f0d692c5ff58082d477abe9146e4',
      allowed: true,
    },
  ]);

  includeInPreferences('extensions.autoUpdate', false);

  process.env['netbeans_extra_options'] = '-J-Dnetbeans.networkProxy=IGNORE';

  includeInPreferences('java.trace.server', 'verbose');
  includeInPreferences('netbeans', 'verbose');

  return vscodeExecutablePath;
}

/**
 * Prepares vscode including the extensions.
 * @param extensionList list of extensions
 */
export async function prepareVscodeAndExtensions(extensionList: string[]) : Promise<string> {
  const path = await prepareVSCode();
  prepareExtensions(path, extensionList);
  return path;
}
