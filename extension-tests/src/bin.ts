/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import {runTest} from './runTest'
import {runTestUI} from './runTest-ui'

function main() {
    if (process.argv.indexOf('--runTest') != -1) {
        runTest();
    } else if (process.argv.indexOf('--runTest-ui') != -1) {
        runTestUI();
    } else {
        console.log("Invalid arguments passed");
    }

}

main()
