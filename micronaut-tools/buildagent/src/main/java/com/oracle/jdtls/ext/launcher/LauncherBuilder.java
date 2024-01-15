/*
 * Copyright (c) 2023, 2024, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

package com.oracle.jdtls.ext.launcher;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 *
 * @author sdedic
 */
public class LauncherBuilder {
    public static final String ORACLE_PREFIX = "JDT_LAUNCHWRAP_";
    /**
     * Project directory
     */
    public static final String ORACLE_PROJECT_DIR = "JDT_LAUNCHWRAP_PROJECT_DIR";
    public static final String ORACLE_ROOT_DIR = "JDT_LAUNCHWRAP_PROJECT_ROOT";
    public static final String ORACLE_PROJECT_CWD = "JDT_LAUNCHWRAP_CWD";
    public static final String ORACLE_PROJECT_TYPE = "JDT_LAUNCHWRAP_PROJECT_TYPE";
    public static final String ORACLE_PROJECT_CONTAINER = "JDT_LAUNCHWRAP_PROJECT_CONTAINER";
    public static final String ORACLE_MICRONAUT_CONTINUOUS = "JDT_LAUNCHWRAP_MICRONAUT_CONTINUOUS";
    public static final String ORACLE_MAVEN_DEPENDENCIES = "JDT_LAUNCHWRAP_MAVEN_DEPENDENCIES";
    
    private static final String JDWP_RUN = "-Xrunjdwp:";
    private static final String JDWP_AGENT = "-agentlib:jdwp=";

    private final List<String> args;
    private final LauncherDelegate launcher;
    private Path cwd;
    private Path projectDir;
    private Map<String, String> environment;
    
    private boolean mainClass;
    
    void addEnvironment(String k, String v) {
        if (environment == null) {
            environment = new HashMap<>();
        }
        environment.put(k, v);
    }

    public LauncherBuilder(LauncherDelegate launcher, List<String> args) {
        this.args = new ArrayList<>(args);
        this.launcher = launcher;
    }

    public void setProjectDir(Path projectDir) {
        this.projectDir = projectDir;
    }

    public void setCwd(Path cwd) {
        this.cwd = cwd;
    }
    
    void addSystemProperty(String propString) {
        launcher.allVmArg(propString);
        propString = propString.substring(2);
        String[] pv = propString.split("=");
        if (pv.length == 1) {
            launcher.property(pv[0], "");
        } else {
            if (propString.startsWith("maven.")) {
                launcher.projectProperty(pv[0].substring(6), pv[1]);
            } else {
                launcher.property(pv[0], pv[1]);
            }
        }
    }
    
    boolean parseBoolean(String s) {
        switch (s) {
            case "y":
                return true;
            case "n":
                return false;
        }
        return Boolean.parseBoolean(s);
    }
    
    void parseDebugAddress(String s) {
        String[] addrPort = s.split(":");
        if (addrPort.length == 1) {
            launcher.setDebugConnectPort(Integer.parseInt(s));
        } else {
            launcher.setDebugHost(addrPort[0]);
            launcher.setDebugConnectPort(Integer.parseInt(addrPort[1]));
        }
    }
    
    void parseDebugString(String raw, String s) {
        launcher.setJdwpParam(raw);
        launcher.setDebugMode(true);
        
        String[] params = s.split(",");
        for (String p : params) {
            String[] pv = p.split("=");
            if (pv.length < 2) {
                continue;
            }
            switch (pv[0]) {
                case "address":
                    parseDebugAddress(pv[1]);
                    break;
                case "server":
                    launcher.setDebugServer(parseBoolean(pv[1]));
                    break;
                case "suspend":
                    launcher.setDebugSuspend(parseBoolean(pv[1]));
                    break;
                case "transport":
                    if (!"dt_socket".equals(pv[1])) {
                        throw new IllegalArgumentException("Only socket transport is supported for debugging. Use transport=dt_socket.");
                    }
                    break;
            }
        }
    }
    
    
    public LauncherDelegate build() throws IOException {
        if (environment == null) {
            environment = System.getenv();
        }
        
        Path prjDir = null;
        if (projectDir != null) {
            prjDir = projectDir;
        } else {
            String s = System.getenv(ORACLE_PROJECT_DIR);
            if (s != null) {
                prjDir = Paths.get(s);
            }
        }
        if (prjDir != null) {
            launcher.setProjectDirectory(prjDir);
        }
        
        if (environment.get(ORACLE_ROOT_DIR) != null) {
            launcher.setProjectRootDirectory(Paths.get(environment.get(ORACLE_ROOT_DIR)));
        }
        if (System.getenv(ORACLE_PROJECT_CWD) != null) {
            launcher.setCwd(Paths.get(System.getenv(ORACLE_PROJECT_CWD)));
        }
        
        for (int i = 0; i < args.size(); i++) {
            String s = args.get(i);
            if (s.startsWith("@")) {
                // load argfile
                Path p = Paths.get(s.substring(1));
                args.addAll(i + 1, new QuotedLineParser(String.join("\n", Files.readAllLines(p))).parseQuotedList());
                continue;
            }
            if (!s.startsWith("-")) {
                launcher.setMainClass(s);
                launcher.args(args.subList(i + 1, args.size()));
                break;
            }
            if (s.startsWith("-D")) {
                addSystemProperty(s);
                continue;
            } else if (s.startsWith(JDWP_AGENT)) {
                parseDebugString(s, s.substring(JDWP_AGENT.length()));
                continue;
            } else if (s.startsWith(JDWP_RUN)) {
                parseDebugString(s, s.substring(JDWP_RUN.length()));
                continue;
            } else if (s.startsWith("--classpath") || s.startsWith("-cp")) {
                launcher.setClasspath(args.get(++i));
            } else if (s.startsWith("--module-path") || s.startsWith("-p")) {
                launcher.setModulePath(args.get(++i));
            } else if (s.startsWith("--module") || s.startsWith("-m")) {    
                launcher.setUsesModules(true);
            } else if (s.equals("-Xdebug")) {
                // ignore for now
            } else {
                launcher.vmArg(s);
            }
        }
        
        LauncherDelegate.LOG(new Date().toString() + ": Launching project {0}", prjDir);
        return launcher;
    }
}
