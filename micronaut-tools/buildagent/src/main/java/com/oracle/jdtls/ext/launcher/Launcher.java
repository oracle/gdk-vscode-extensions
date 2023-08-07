/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

package com.oracle.jdtls.ext.launcher;

import java.io.IOException;
import java.util.Arrays;
import java.util.Locale;

public class Launcher {
    public static void main(String[] args) {
        
        LauncherDelegate dele;
        String type = System.getenv(LauncherBuilder.ORACLE_PROJECT_TYPE);
        if (type != null) {
            String container = System.getenv(LauncherBuilder.ORACLE_PROJECT_CONTAINER);
            if (container == null) {
                container = "";
            }
            switch (type.toLowerCase(Locale.ENGLISH)) {
                case "gradle": 
                    // one Gradle rules them (containers) all
                    dele = new GradleLauncher(); 
                    break;
                
                case "maven": 
                    switch (container.toLowerCase(Locale.ENGLISH)) {
                        case "micronaut": 
                            dele = new MavenMicronautLauncher(); break;
                        default: 
                            dele = new MavenLauncher();
                    }
                    break;
                default:
                    dele = new LauncherDelegate(); 
                    break;
            }
        } else {
            dele = new LauncherDelegate();
        }
        dele.setEnvironment(System.getenv());
        dele.setJvmBinaryPath(args[0]);
        int exitCode = 255;
        try {
            exitCode = new LauncherBuilder(dele, Arrays.asList(args).subList(1, args.length)).
                    build().configureLauncher().
                    execute();
        } catch (IOException ex) {
            exitCode = 126;
        } catch (InterruptedException ex) {
            exitCode = 130;
        }
        System.exit(exitCode);
    }
}