/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

package com.oracle.jdtls.ext.launcher;

import java.io.IOException;
import java.util.stream.Collectors;

/**
 * Specific launcher for Micronaut, that uses mn:run goal instead of exec. 
 * 
 * @author sdedic
 */
public class MavenMicronautLauncher extends MavenLauncher {

    public MavenMicronautLauncher() {
        execGoal = "mn:run";
    }

    @Override
    public int execute() throws IOException, InterruptedException {
        return super.execute();
    }

    @Override
    void configureMavenProperties() {
        if (getMainClass() != null) {
            addCommand("-Dmn.mainClass=" + getMainClass());
        }
        
        // cwd: mn:run does not support working directory property. Ouch !!!
        if (!getProgramArgs().isEmpty()) {
            addCommand("-Dmn.appArgs=" + 
                    getProgramArgs().stream().map(a -> quote(a)).collect(Collectors.joining(" ")));
        }
        
        if (env(LauncherBuilder.ORACLE_MICRONAUT_CONTINUOUS, null) == null) {
            addCommand("-Dmn.watch=false");
        }

        for (String s : getAllVmArgs()) {
            addQuotedPart(s);
        }

        if (isUsesModules()) {
            addQuotedPart("--module-path");
            addQuotedPart("%modulepath");
        }
        if (getMainClass() != null) {
            if (isUsesModules()) {
                addQuotedPart("--module");
            }
        }
        if (isDebugMode() && !isDebugServer()) {
            // JDWP client is not supported specifically by Micronaut plugin; need to inject the original
            // JDWP settings requested by JDT.
            addQuotedPart(getJdwpParam());
        }
        parts("-Dmn.jvmArgs=");

        if (isDebugMode() && isDebugServer()) {
            addCommand("-Dmn.debug=true");
            addCommand("-Dmn.debug.host=" + getDebugHost());
            addCommand("-Dmn.debug.port=" + getDebugConnectPort());
            addCommand("-Dmn.debug.suspend=" + isDebugSuspend());
        }
    }
}
