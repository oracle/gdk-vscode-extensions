/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import path from 'path';
import { ExtensionMap, ExtensionName } from './types';
import Downloader from 'nodejs-file-downloader';
import * as fs from 'fs';
import { downloadJSON } from '../../../common/lib/connections';

const downloadPath = path.resolve(__dirname, '..', '..', 'downloadedExtensions');

/**
 * Finds downloads and replace Extension IDs by their download path
 * @param extensionIDs IDs of extensions to be resolved
 * @returns list of unresolved IDs and paths to downloaded Extensions
 */
export async function resolveExtensions(extensionIDs: string[]): Promise<string[]> {
  if (process.env['TEST_EXTENSION_SOURCE'] === 'marketplace') return extensionIDs;
  const urls = await obtainLatestArtifactsURLs();
  return Promise.all(extensionIDs.map((id) => resolveExtension(id, urls)));
}

async function resolveExtension(extensionID: string, urls: ExtensionMap<string>): Promise<string> {
  if (extensionID in urls) return (await download(extensionID, urls[extensionID as ExtensionName])) ?? extensionID;
  return extensionID;
}

async function download(name: string, url?: string): Promise<string | undefined> {
  if (!url) return undefined;
  const dest = path.join(downloadPath, path.basename(url));
  if (fs.existsSync(dest)) return dest;
  console.log('Obtaining: ' + name + '; from: ' + url);
  const options: any = {
    url,
    directory: downloadPath,
    skipExistingFileName: true,
  };
  const proxy = process.env['http_proxy'];
  if (proxy) {
    options.proxy = proxy;
  }
  const result = await new Downloader(options).download();
  if (result.downloadStatus === 'ABORTED') return path.join(downloadPath, path.basename(url));
  return result.filePath!;
}

/**
 * Stores key=value pairs in both Preferences a settings.json files of test vscode installation
 * @param key to be stored
 * @param value to be stored
 */
export function includeInPreferences(key: string, value?: string | boolean | Record<string, any>[]) {
  change(path.resolve(__dirname, '..', '..', '.vscode-test', 'user-data', 'Preferences'), key, value);
  change(path.resolve(__dirname, '..', '..', '.vscode-test', 'user-data', 'User', 'settings.json'), key, value);
}

function change(prefFile: string, key: string, value?: string | boolean | Record<string, any>[]) {
  if (!fs.existsSync(prefFile)) fs.writeFileSync(prefFile, '{}');
  const data = JSON.parse(fs.readFileSync(prefFile, { encoding: 'utf8' }));
  if (value === undefined) delete data[key];
  else if (typeof value === 'string' || typeof value === 'boolean') {
    data[key] = value;
  } else {
    const current = data[key] as Record<string, any>[];
    if (!current) data[key] = value;
    else {
      value = value.filter((r) => current.some((c) => c == r));
      current.concat(value);
      data[key] = current;
    }
  }
  fs.writeFileSync(prefFile, JSON.stringify(data));
}

function extRegExp(prefix: string): RegExp {
  return new RegExp(`${prefix}[0-9\-\.]+\.vsix`);
}

const extensionFileNames: ExtensionMap<RegExp> = {
  'asf.apache-netbeans-java': extRegExp('apache-netbeans-java-'),
  'oracle-labs-graalvm.oci-devops': extRegExp('oci-devops-'),
  'oracle-labs-graalvm.gcn': extRegExp('gcn-'),
  'oracle-labs-graalvm.graalvm': extRegExp('graalvm-'),
} as const;

async function mapExtensionURLS(urls: string[]): Promise<ExtensionMap<string>> {
  const out: ExtensionMap<string> = {};
  for (const url of urls) {
    const ext = getExtensionNameFromURL(url);
    if (ext) out[ext] = url;
  }
  return out;
}

function getExtensionNameFromURL(url: string): ExtensionName | undefined {
  for (const ext of Object.keys(extensionFileNames) as ExtensionName[]) {
    const regExp = extensionFileNames[ext];
    if (regExp && regExp.test(path.basename(url))) return ext;
  }
  return undefined;
}

export async function obtainLatestArtifactsURLs(): Promise<ExtensionMap<string>> {
  return mapExtensionURLS(
    (
      await Promise.all([
        obtainArtifactURLsFromURL(
          'https://ci-builds.apache.org/job/Netbeans/job/netbeans-vscode/lastStableBuild/api/json',
        ),
        obtainArtifactURLsFromURL(
          'https://graalvm.oraclecorp.com/jenkins/job/GCN-vscode-micronaut-main/lastStableBuild/api/json',
        ),
        obtainArtifactURLsFromURL(
          'https://graalvm.oraclecorp.com/jenkins/job/vscode-graalvm-micronaut-master/lastStableBuild/api/json',
        ),
      ])
    ).reduce((prev, cur) => {
      prev.push(...cur);
      return prev;
    }),
  );
}

async function obtainArtifactURLsFromURL(url: string): Promise<string[]> {
  const json = JSON.parse(await downloadJSON(url)); // TODO: validate/type data
  const out = [];
  for (const artifact of json.artifacts) {
    if (artifact.fileName.endsWith('.vsix')) out.push(json.url + 'artifact/' + artifact.relativePath);
  }
  return out;
}
