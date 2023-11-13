/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as http from 'http';
import * as https from 'https';
import * as zlib from 'zlib';
import * as targetAddress from './targetAddress';


const EXT_ID = 'oracle-labs-graalvm.micronaut-tools';
const VSCODE_AGENT = `VSCode/${vscode.version}`;
const SYSTEM_INFO = `${process.platform} ${process.arch}`;
const EXT_AGENT = `${EXT_ID}/${vscode.extensions.getExtension(EXT_ID)?.packageJSON.version}`;
const USER_AGENT = `${VSCODE_AGENT} (${SYSTEM_INFO}) ${EXT_AGENT}`;

const GET_RETRIES: number = 3;

export async function getDataRetry(address: string, options: https.RequestOptions = {}, retries: number = GET_RETRIES): Promise<{ code: number | undefined; headers: any; data: any }> {
    const response = await getData(address, options);
    if (retries > 1 && response?.code && response.code >= 500) {
        return getDataRetry(address, options, retries - 1);
    } else {
        return response;
    }
}

export async function getData(address: string, options: https.RequestOptions = {}): Promise<{ code: number | undefined; headers: any; data: any }> {
    return new Promise((resolve, reject) => {
        if (!options.headers) {
            options.headers = {};
        }
        options.headers['User-Agent'] = USER_AGENT;
        options.headers['Accept-Encoding'] = 'gzip';
        (targetAddress.getProtocol(address) === 'http' ? http : https).get(address, options, res => {
            let data: any[] = [];
            res.on('data', chunk => {
                data.push(chunk);
            });
            res.on('end', () => {
                let cdata = Buffer.concat(data);
                if (res.headers['content-encoding'] === 'gzip') {
                    try {
                        cdata = zlib.gunzipSync(cdata);
                    } catch (err) {
                        reject(err);
                    }
                }
                const response = cdata.toString();
                resolve({ code: res.statusCode, headers: res.headers, data: response });
            });
        }).on('error', err => {
            reject(err);
        });
    });
}

export async function postData(address: string, data: any, options: https.RequestOptions = {}): Promise<{ code: number | undefined; headers: any; data: any }> {
    return new Promise((resolve, reject) => {
        options.method = 'POST';
        if (!options.headers) {
            options.headers = {};
        }
        options.headers['User-Agent'] = USER_AGENT;
        options.headers['Content-Type'] = 'application/json';
        var req = (targetAddress.getProtocol(address) === 'http' ? http : https).request(address, options, res => {
            let data: any[] = [];
            res.on('data', chunk => {
                data.push(chunk);
            });
            res.on('end', () => {
                const response = Buffer.concat(data).toString();
                resolve({ code: res.statusCode, headers: res.headers, data: response });
            });
        }).on('error', err => {
            reject(err);
        });
        req.write(JSON.stringify(data));
        req.end();
    });
}