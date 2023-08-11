/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

package com.oracle.jdtls.ext.launcher;

import java.io.IOException;
import java.nio.file.Path;
import java.nio.file.Paths;
import org.gradle.tooling.BuildLauncher;
import org.gradle.tooling.CancellationToken;
import org.gradle.tooling.CancellationTokenSource;
import org.gradle.tooling.GradleConnector;
import org.gradle.tooling.ProjectConnection;

/**
 *
 * @author sdedic
 */
public class GradleLauncher extends LauncherDelegate {
    public static final String ORACLE_SCRIPTS = "JDT_LAUNCHWRAP_PROJECT_SCRIPTS";
    
    private String launchTask = "run";

    public String getLaunchTask() {
        return launchTask;
    }

    public void setLaunchTask(String launchTask) {
        this.launchTask = launchTask;
    }
    
    BuildLauncher launcher;
    
    @Override
    public int execute() throws InterruptedException, IOException {
        try (ProjectConnection conn = GradleConnector.newConnector().forProjectDirectory(getProjectDirectory().toFile()).connect()) {
            launcher = conn.newBuild();
            
            Path javaHome = Paths.get(getJvmBinaryPath()).getParent().getParent();
            if ("jre".equals(javaHome.getFileName().toString())) {
                javaHome = javaHome.getParent();
            }
            launcher.setJavaHome(javaHome.toFile());
            CancellationTokenSource canceller = GradleConnector.newCancellationTokenSource();
            Runtime.getRuntime().addShutdownHook(new Thread() {
                @Override
                public void run() {
                    canceller.cancel();
                }
            });
            return executeLauncher(canceller.token());
        } 
    }
    
    int executeLauncher(CancellationToken token) {
        String scriptDir = env(ORACLE_SCRIPTS, null);
        if (scriptDir == null) {
            throw new IllegalStateException();
        }
        
        // JVM args:
        for (String s : getVmArgs()) {
            addQuotedPart(s);
        }

        if (isDebugMode()) {
            // although mn:run understands debug parameters, it
            // does not support server=n mode used by JDT. Pity.
            addQuotedPart(getJdwpParam());
        }
        
        parts("-PrunJvmArgs=");

        for (String s : getProgramArgs()) {
            addQuotedPart(s);
        }
        parts("-PrunArgs=");

        if (getMainClass() != null) {
            addCommand("-PrunClassName=" + getMainClass());
        }

        if (getCwd() != null) {
            // micronaut BUG: mn:run does not support working directory settings, but 
            // let's hope for the future.
            addCommand("-PrunWorkingDir=" + getCwd());
        }
        
        if (env(LauncherBuilder.ORACLE_MICRONAUT_CONTINUOUS, null) != null) {
            addCommand("--continuous");
        } 
        
        System.err.println("Running gradle with:  " + commands());
        launcher.setEnvironmentVariables(filterEnvironment());
        launcher.
                addArguments("-I", Paths.get(scriptDir).resolve("launcher.groovy").toAbsolutePath().toString()).
                addArguments(commands()).
                addArguments("-x", "check");
        launcher.
                withCancellationToken(token).
                setStandardInput(System.in).
                setStandardOutput(System.out).
                setStandardError(System.err).
                forTasks("run");
        launcher.run();
        return 0;
    }
}
