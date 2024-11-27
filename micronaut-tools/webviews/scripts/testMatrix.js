// Copyright (c) 2020, 2023, Oracle and/or its affiliates. All rights reserved.
// DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.

// Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.


(function () {
    const vscode = acquireVsCodeApi();
    
    document.querySelectorAll('.clickable-td').forEach(td => {
        td.addEventListener('click', function () {
            const state = this.getAttribute('data-state');
            vscode.postMessage({ type: 'testCaseClick', state });
        });
    });

    window.addEventListener('message', event => {
        const message = event.data;
        switch (message.type) {
            case 'updateTests':
                {
                    updateTests(message);
                    break;
                }
        }
    });

    function updateTests(message) {
        vscode.setState({ storedTests: message.tests });
    }
}());
