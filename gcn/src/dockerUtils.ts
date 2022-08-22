/*
 * Copyright (c) 2022, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as dialogs from './dialogs';


export function pullImage(imageId: string) {
    const terminal = dialogs.getGCNTerminal();
    terminal.show();
    terminal.sendText(`docker pull ${imageId}`);
}
