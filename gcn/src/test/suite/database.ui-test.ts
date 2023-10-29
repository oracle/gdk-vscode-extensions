/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

// import the webdriver and the high level browser wrapper
import * as assert from 'assert';
import { ActivityBar, InputBox, QuickPickItem, ViewControl, ViewItem, ViewSection, Workbench, Notification, ContextMenu, ContextMenuItem, SideBarView } from 'vscode-extension-tester';
// import * as vscode from 'vscode';

/**
 * Waits on `inputBox` until quickpick with given value is shown 
 * @param input 
 * @param value 
 * @param timeout 
 * @returns Index of quickpick with given value or -1 if the function times out
 */
async function waitForQuickpickValue(input : InputBox, value : string, timeout : number = 10) {
    let picks : QuickPickItem[] = [];
    for (let i = 0; i < timeout; ++i) {
        console.log("DEBUG: Waiting for QuickPics to load to load ("+(i+1)+"/"+timeout+")");
        await input.setText(value);
        picks = await input.getQuickPicks();
        for (let pick of picks) {
            if (await pick.getLabel() === value) {
                return picks.indexOf(pick);
            }
        }
        await new Promise(f=>setTimeout(f,1000));
    }
    return -1;
}

/**
 * Locates an item with given label inside a given section. Asserts if the item doesn't appear in given time frame.
 * @param section 
 * @param itemLabel 
 * @param timeout 
 */
async function findAndExpand( section : ViewSection, itemLabel : string, timeout: number = 10) : Promise<void> {
    let viewItem : ViewItem | undefined;
    for (let i = 0; i < timeout && !viewItem; ++i) {
        viewItem = await section.findItem(itemLabel);
        if (!viewItem) {
            await new Promise(f=>setTimeout(f,1000));
            console.log("[DEBUG] Waiting for item: " + itemLabel + " to appear");
        }
    }
    assert(viewItem, "Item: " + itemLabel + " not found in the viewSection");
    await viewItem.select();
}

// Create a Mocha suite
describe('Database UI Tests', function () {
    this.timeout(3*60*1000);

    const COMMAND_ADD_ORACLE_ATP_DB : string = ">Add Oracle Autonomous Database";
    const COMMAND_NEW_JAVA_CLASS : string = ">Java: New Java Class";

    const OCI_PROFILE : string = process.env["DB_OCI_PROFILE"] ? process.env["DB_OCI_PROFILE"] : "DEFAULT"; 
    const DB_COMPARTMENT : string = process.env["DB_COMPARTMENT"] ? process.env["DB_COMPARTMENT"] : "gcn-dev/gcn-test";
    const DB_NAME : string = process.env["DB_NAME"] ? process.env["DB_NAME"] : "OCBCU4AYLP4WTFOH";
    const DB_SCHEMA : string = process.env["DB_SCHEMA"] ? process.env["DB_SCHEMA"] : "HR";
    const DB_TABLE : string = process.env["DB_TABLE"] ? process.env["DB_TABLE"] : "COUNTRIES";
    const DB_USERNAME : string = process.env["DB_USERNAME"] ? process.env["DB_USERNAME"] : "";
    const DB_PASSWORD : string = process.env["DB_PASSWORD"] ? process.env["DB_PASSWORD"] : "";

    it ("Setup environment", async () => {
        assert(DB_USERNAME, "Database Username cannot be blank");
        assert(DB_PASSWORD, "Database Password cannot be blank");
    });

    // Create and open a dummy java file to trigger onCreation event for NBLS Extension
    it ("Activate NBLS Extension", async() => {
        await new Workbench().openCommandPrompt();
        let input : InputBox = await InputBox.create();

        await input.setText(COMMAND_NEW_JAVA_CLASS);
        await input.confirm();

    });

    // Wait for the "DATABASE" panel to appear inside explorer actionBar
    it("Check Database panel", async () => {
        const control : ViewControl | undefined = await new ActivityBar().getViewControl("Explorer");
        assert(control, "No explorer View Controller");

        const view = await control.openView();
        let found : boolean = false;
        for (let i = 0; i < 12 && !found; ++i) {
            console.log("DEBUG: Waiting for the Databases panel in explorer ("+(i+1)+"/12)");
            const contentPart = view.getContent();
            const sections = await contentPart.getSections();

            for (let sec of sections) {
                if ("Databases" === await sec.getTitle()) {
                    found = true;
                }
            }
            await new Promise(f=>setTimeout(f, 10000));
        }
        assert(found, "No Databases panel found. Check if NBLS Extension has been installed and enabled.");
    });


    // Trigger a command to add a new Oracle Autonomous DB connection
    it ("Add Oracle Autonomous DB",async () => {
        // open command pallet
        await new Workbench().openCommandPrompt();
        let input : InputBox = await InputBox.create();

        await input.setText(COMMAND_ADD_ORACLE_ATP_DB);
        await input.confirm();
        
        // wait for OCI scanning to complete
        let picks : QuickPickItem[] = [];
        for (let i = 0; i < 30; ++i) {
            console.log("DEBUG: Waiting for OCI profiles to load ("+(i+1)+"/30)");
            picks = await input.getQuickPicks();
            if (picks.length === 0) {
                await new Promise(f=>setTimeout(f,1000));
            } else break;
        }
        assert.ok(picks.length>0, "No OCI Profiles have been found");
        let ociProfileIndex = 0;
        for (let pick of picks) {
            if (await pick.getLabel() === OCI_PROFILE) {
                ociProfileIndex = picks.indexOf(pick);
            }
        }
        console.log("DEBUG: Chosing OCI Profile:", await picks[ociProfileIndex].getLabel() );
        await input.selectQuickPick(ociProfileIndex);
        let compartmentIndex = await waitForQuickpickValue(input, DB_COMPARTMENT, 60);
        assert(compartmentIndex !== -1, "No compartment "+DB_COMPARTMENT+" found. Check OCI credentials/tendency/compartment path.");
        await input.selectQuickPick(compartmentIndex);

        let databaseIndex = await waitForQuickpickValue(input, DB_NAME, 60);
        assert(databaseIndex !==-1, "No database "+DB_NAME+" found. Check the compartment: " + DB_COMPARTMENT);
        await input.selectQuickPick(databaseIndex);
        await new Promise(f=>setTimeout(f,1000));

        await input.setText(DB_USERNAME);
        await input.confirm();
        await new Promise(f=>setTimeout(f,1000));

        await input.setText(DB_PASSWORD);
        await input.confirm();
        await new Promise(f=>setTimeout(f,1000));

    } );

    // Monitor notifications to see if wallet has been created
    it ("Wallet created",async () => {
        let walletGenerated = false;
        for (let i = 0; i < 30 && !walletGenerated; ++i) {
            console.log("DEBUG: Waiting for wallet creation notification");
            const notifications : Notification[] = await new Workbench().getNotifications();
            for (let notif of notifications) {
                if ((await notif.getMessage()).indexOf("Database Wallet was downloaded") !== -1) {
                    walletGenerated = true;
                    break;
                }
            }

            await new Promise(f=>setTimeout(f, 1000));
        }
        assert(walletGenerated, "No wallet has been generated for the database.");
    });

    // Open the database panel, right click on the added database and establish a connection 
    it ("Connect to database via panel", async ()=> {
        const control : ViewControl | undefined = await new ActivityBar().getViewControl("Explorer");
        assert(control, "No explorer View Controller");

        const view = await control.openView();
        const contentPart = view.getContent();
        const sections = await contentPart.getSections();

        let databaseSection : ViewSection | undefined;
        for (let sec of sections) {
            if ("Databases" === await sec.getTitle()) {
                databaseSection = sec;
            }
        }
        assert(databaseSection, "No database section found.");
        await databaseSection.expand();
        await new Promise(f=>setTimeout(f,10000));

        let contextMenu : ContextMenu | undefined;
        const viewItems : ViewItem[] = await databaseSection.getVisibleItems();
        for (const viewItem of viewItems) {
            if ( (await viewItem.getText()).indexOf(DB_NAME) !== -1 ) {
                contextMenu = await viewItem.openContextMenu();
            }
        }
        await new Promise(f=>setTimeout(f,1000));
        assert(contextMenu, "The database has not been listed inside the database panel");

        const contextItems : ContextMenuItem[] = await contextMenu.getItems();
        let connectItem : ContextMenuItem | undefined;
        for (let ctxItem of contextItems) {
            if ( (await ctxItem.getLabel()) === "Connect to Database" ) {
                connectItem = ctxItem;
            }
        }
        assert(connectItem, "No connect option found in context menu for the added database");
        await connectItem.click();
        await new Promise(f=>setTimeout(f,5000));
    });

    // Check if the connection is successful, by expanding the database and listing its tables
    // Expected is an HR schema provided by oracle
    it ("List Schemas and Tables for the database",async () => {
        const contentPart = new SideBarView().getContent();
        const section = await contentPart.getSection('Databases');

        await findAndExpand(section, DB_NAME);
        await findAndExpand(section, DB_SCHEMA);
        await findAndExpand(section, "Tables");
        await findAndExpand(section, DB_TABLE);

    });

});