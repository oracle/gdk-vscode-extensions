/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as cp from 'child_process';

export function pullImage(imageId: string): cp.ChildProcess {
    return cp.spawn('docker', ['pull', imageId], { detached: true });
}

export function login(registryName: string, userName: string, password: string) {
   cp.execSync(`docker login --username ${userName} --password "${password}" ${registryName}`);
}

export function logout(registryName: string) {
   cp.execSync(`docker logout ${registryName}`);
}
