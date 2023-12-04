/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as http from 'http';
import * as https from 'https';

export async function downloadJSON(url: string, timeout?: number): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        const protocol = url.startsWith('http://') ? http : https;
        const callback = (res: http.IncomingMessage) => {
            const { statusCode } = res;
            const contentType = res.headers['content-type'] || '';
            let error;
            if (statusCode !== 200) {
                error = `Request Failed.\nStatus Code: ${statusCode}`;
            } else if (!/^application\/json/.test(contentType)) {
                error = `Invalid content-type.\nExpected application/json but received ${contentType}`;
            }
            if (error) {
                res.resume();
                reject(error);
            } else {
                let rawData: string = '';
                res.on('data', chunk => { rawData += chunk; });
                res.on('end', () => {
                    resolve(rawData);
                });
            }
        };
        const req = protocol.get(url, callback);
        if(timeout){
            const to = setTimeout(() => req.destroy(new Error("Timeout after " + timeout + " ms.")), timeout);
            req.on('response', () => clearTimeout(to));
        }
        req.on('error', e => reject(e.message)).end();
    });
}