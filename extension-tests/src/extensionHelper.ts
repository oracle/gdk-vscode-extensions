/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import path from 'path';
import Downloader from 'nodejs-file-downloader';
import * as fs from 'fs';
import * as semver from 'semver';
import * as cp from 'child_process';
import { downloadJSON } from '../../common/lib/connections';
import { globSync } from 'glob';
import { resolveCliArgsFromVSCodeExecutablePath } from '@vscode/test-electron';

type ExtensionMap = { [ key : string] : string | undefined };

export const extensionRoot = process.env['TEST_EXTENSION_DIR'] || process.cwd();

const downloadPath = path.resolve(extensionRoot, 'downloadedExtensions');

/**
 * Finds downloads and replace Extension IDs by their download path
 * @param extensionIDs IDs of extensions to be resolved
 * @returns list of unresolved IDs and paths to downloaded Extensions
 */
async function resolveExtensions(extensionIDs: string[]): Promise<string[]> {
  if (process.env['TEST_EXTENSION_SOURCE'] === 'marketplace') return extensionIDs;
  const urls = await obtainLatestArtifactsURLs(extensionIDs);
  return Promise.all(extensionIDs.map((id) => resolveExtension(id, urls)));
}

async function resolveExtension(extensionID: string, urls: ExtensionMap): Promise<string> {
  if (extensionID in urls) return (await download(extensionID, urls[extensionID])) ?? extensionID;
  return extensionID;
}

async function download(name: string, url?: string): Promise<string | undefined> {
  if (!url) return undefined;
  if (fs.existsSync(url)) {
    console.log(`Using local copy of extension: ${url}`);
    return url;
  }
  const dest = path.join(downloadPath, path.basename(url));
  if (fs.existsSync(dest)) return dest;
  console.log('Obtaining: ' + name + '; from: ' + url);
  const options : any = {
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
  change(path.resolve(extensionRoot, '.vscode-test', 'user-data', 'Preferences'), key, value);
  change(path.resolve(extensionRoot, '.vscode-test', 'user-data', 'User', 'settings.json'), key, value);
}

function change(prefFile: string, key: string, value?: string | boolean | Record<string, any>[]) {
  if (!fs.existsSync(prefFile)) {
    fs.mkdirSync(path.dirname(prefFile), { recursive : true });
    fs.writeFileSync(prefFile, '{}');
  }
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

async function mapExtensionURLS(urls: string[], extensionIds: string[]): Promise<ExtensionMap> {
	const out: ExtensionMap = {};
	for (const url of urls) {
	  const ext = getExtensionNameFromURL(url, extensionIds);
	  if (ext) out[ext] = url;
	}
	return out;
  }
  
  function extRegExp(prefix: string): RegExp {
	return new RegExp(`^${prefix}[0-9\-\.]+\.vsix`);
  }
	  
  function getExtensionNameFromURL(url: string, extensionIds : string[]): string | undefined {
	for (const ext of extensionIds) {
		if (ext.includes('/') || ext.includes('\\')) {
			continue;
		}
		const dot = ext.indexOf('.');
		if (dot == -1) {
			continue;
		}
		const regExp = extRegExp(ext.substring(dot + 1) + '-');
		const s = path.basename(url);
		if (regExp && regExp.test(s)) return ext;
	}
	return undefined;
  }
  
  
  /**
 * Resolves ExtensionIDs to newest versions downloaded from Jenkins and install them into VSCode
 * @param vscodeExecutablePath path to VSCode installation
 * @param extensionList list of Extension IDs
 */
export async function prepareExtensions(vscodeExecutablePath: string, extensionList: string[]) {
	// TODO: remove previous Extensions..?
	const [cli, ...args] = resolveCliArgsFromVSCodeExecutablePath(vscodeExecutablePath);
	extensionList = await resolveExtensions(extensionList);
  
	for (const extensionId of extensionList) {
	  console.log(`Installing extension: ${extensionId}...`)
	  cp.spawnSync(cli, [...args, '--install-extension', extensionId], {
		encoding: 'utf-8',
		stdio: 'inherit',
		shell: true
	  });
	}
  }
  
  export async function obtainLatestArtifactsURLs(extensionList : string[]): Promise<ExtensionMap> {
	let urls = (process.env['TEST_JENKINS_BUILDERS'] || '').split(";");
  
	let parsed : [ name : string, ver : string, dir : string][] = [];
	(process.env['TEST_EXTENSION_DOWNLOADS'] || '').split(path.delimiter).forEach(dir => {
	  console.log(`Searching extensions with pattern: ${dir}`)
	  if (!dir || dir.length == 0) {
		return;
	  }
	  let listed : string[] = [];
  
	  for (let m of globSync(dir)) {
	   let stat;
	   
		try {
		  stat = fs.statSync(m);
		} catch (e : any) {
		  console.log(`Warning: invalid extension download location: ${m}`);
		  continue;
		}
  
		if (stat.isDirectory()) {
		  listed.push(...fs.readdirSync(m).map(n => path.join(m, n)));
		} else {
		  listed.push(m);
		}
	  }
	  for (let n of listed) {
		let base = path.basename(n);
		let d = path.dirname(n);
		let re = /([-A-z]*)-([0-9.]*).vsix/.exec(base);
		if (re) {
		  console.log(`Found extension: ${n}`);
		  parsed.push([ re[1], re[2], d]);
		}
	  }
  });
  
	let files : string[] = [];
	parsed.sort((a, b) => {
	  if (a[0] < b[0]) {
		return -1;
	  } else if (a[0] > b[0]) {
		return 1;
	  }
	  let r =  -semver.compare(a[1], b[1]);
	  return r;
	});
	let last = undefined;
	for (let [n, v, d] of parsed) {
	  if (n === last) {
		continue;
	  }
	  last = n;
	  files.push(path.join(d, `${n}-${v}.vsix`));
	}
  
	let fileMap = await mapExtensionURLS(files, extensionList);
	let urlMap = await mapExtensionURLS(
		(await Promise.all(
		  urls.filter(u => u && u.length).map(u => obtainArtifactURLsFromURL(u)).filter(o => o !== null && o !== undefined)
		)).reduce((prev, cur) => {
		  prev.push(...cur);
		  return prev;
		}, []), extensionList);
	for (let k in fileMap) {
	  urlMap[k] = fileMap[k];
	}
	return urlMap;
}

async function obtainArtifactURLsFromURL(url: string): Promise<string[]> {
  try {
    const json = JSON.parse(await downloadJSON(url)); // TODO: validate/type data
    const out = [];
    for (const artifact of json.artifacts) {
      if (artifact.fileName.endsWith('.vsix')) out.push(json.url + 'artifact/' + artifact.relativePath);
    }
    return out;
  } catch (err : any) {
    console.log(`Warning: could not obtain URL from: ${url}: ${err.message ? err.message : JSON.stringify(err)}`);
    return [];
  }
}
