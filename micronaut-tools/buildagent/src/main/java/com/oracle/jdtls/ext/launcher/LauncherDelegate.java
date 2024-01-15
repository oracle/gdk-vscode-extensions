/*
 * Copyright (c) 2023, 2024, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

package com.oracle.jdtls.ext.launcher;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardOpenOption;
import java.text.MessageFormat;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 *
 * @author sdedic
 */
public class LauncherDelegate {
    static final Path LOGFILE = Paths.get(System.getProperty("java.io.tmpdir"), "maven-launcher.log");
    
    private Path cwd;
    private Path projectDirectory;
    private Path projectRootDirectory;
    private String jvmBinaryPath;
    private List<String> allVmArgs = new ArrayList<>();
    private List<String> vmArgs = new ArrayList<>();
    private List<String> programArgs = new ArrayList<>();
    private Map<String, String> systemProperties = new LinkedHashMap<>();
    private Map<String, String> projectProperties = new LinkedHashMap<>();
    private Map<String, String> environment = new LinkedHashMap<>();
    private String classpath;
    private String debugHost;
    private int debugConnectPort;
    private boolean debugServer;
    private boolean debugSuspend;
    private String jdwpParam;
    private String mainClass;
    private boolean debugMode;
    private boolean usesModules;
    private String modulePath;
    
    private List<String> cmdLine = new ArrayList<>();
    private List<String> parts = new ArrayList<>();

    public Map<String, String> getEnvironment() {
        return environment;
    }
    
    static void LOG(String msg, Object... args) {
        String formatted = MessageFormat.format(msg, args);
        System.err.println("Launcher> " + formatted);
        try {
            Files.write(LOGFILE, Arrays.asList(
                    formatted), StandardOpenOption.CREATE, StandardOpenOption.APPEND, StandardOpenOption.SYNC);
        } catch (IOException ex) {
            // swallow
            ex.printStackTrace();
        }
        
    }
    
    static void LOG2(String msg, Object... args) {
        String formatted = MessageFormat.format(msg, args);
        try {
            Files.write(LOGFILE, Arrays.asList(
                    formatted), StandardOpenOption.CREATE, StandardOpenOption.APPEND, StandardOpenOption.SYNC);
        } catch (IOException ex) {
            // swallow
            ex.printStackTrace();
        }
        
    }
    
    void clear() {
        cmdLine = new ArrayList<>();
        parts = new ArrayList<>();
    }

    public void setEnvironment(Map<String, String> environment) {
        this.environment = environment;
    }
    
    protected String env(String key, String def) {
        return environment.getOrDefault(key, def);
    }
    
    protected void prependCommand(String... s) {
        cmdLine.addAll(0, Arrays.asList(s));
    }
    
    protected void addCommand(String... s) {
        cmdLine.addAll(Arrays.asList(s));
    }
    
    protected void addQuotedPart(String s) {
        parts.add(quote(s));
    }
    
    protected void parts(String prefixWith) {
        String s = parts();
        if (s == null) {
            return;
        }
        addCommand(prefixWith + s);
    }
    
    protected String parts() {
        if (!parts.isEmpty()) {
            String s = String.join(" ", parts);
            parts.clear();
            return s;
        } else {
            return null;
        }
    }
    
    protected static String quote(String s) {
        if (s.contains(" ") || s.contains("\"")) {
            return "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"") + "\"";
        } else {
            return s.replace("\"", "\\\"").replace("'", "\\'");
        }
        
    }
    
    protected List<String> commands() {
        return cmdLine;
    }
    
    public LauncherDelegate configureLauncher() {
        return this;
    }
    
    protected Map<String, String> filterEnvironment() {
        Map<String, String> env = new HashMap<>();
        for (String s : environment.keySet()) {
            if (!s.startsWith(LauncherBuilder.ORACLE_PREFIX)) {
                env.put(s, environment.get(s));
            }
        }
        return env;
    }
    
    public static Path findExecutableOnPath(String name) {
        for (String dirname : System.getenv("PATH").split(File.pathSeparator)) {
            Path p = getOSExecutable(Paths.get(dirname), name);
            if (p != null && Files.isExecutable(p)) {
                return p; 
            }
        }
        return null;
    }
    
    protected static Path getOSExecutable(Path dir, String name) {
        Path r;
        
        if (System.getProperty("os.name").toLowerCase().contains("win")) {
            r = dir.resolve(name + ".cmd");
            if (!Files.exists(r)) {
                r = dir.resolve(name + ".bat");
            }
        } else {
            r = dir.resolve(name);
        }
        if (!Files.exists(r)) {
            return null;
        } else if (!Files.isExecutable(r)) {
            throw new IllegalStateException("File " + r + " is not executable");
        }
        return r;
    }

    public Path getProjectRootDirectory() {
        return projectRootDirectory == null ? getProjectDirectory() : projectRootDirectory;
    }

    public LauncherDelegate setProjectRootDirectory(Path projectRootDirectory) {
        this.projectRootDirectory = projectRootDirectory;
        return this;
    }

    public Path getCwd() {
        return cwd;
    }

    public LauncherDelegate setCwd(Path cwd) {
        this.cwd = cwd;
        return this;
    }

    public String getClasspath() {
        return classpath;
    }

    public LauncherDelegate setClasspath(String classpath) {
        this.classpath = classpath;
        return this;
    }

    public boolean isUsesModules() {
        return usesModules;
    }

    public void setUsesModules(boolean usesModules) {
        this.usesModules = usesModules;
    }

    public String getModulePath() {
        return modulePath;
    }

    public void setModulePath(String modulePath) {
        this.modulePath = modulePath;
    }
    
    public Path getProjectDirectory() {
        return projectDirectory;
    }

    public LauncherDelegate setProjectDirectory(Path projectDirectory) {
        this.projectDirectory = projectDirectory;
        return this;
    }

    public LauncherDelegate setDebugMode(boolean debugMode) {
        this.debugMode = debugMode;
        return this;
    }
    
    public LauncherDelegate setJvmBinaryPath(String jvmBinaryPath) {
        this.jvmBinaryPath = jvmBinaryPath;
        return this;
    }

    public LauncherDelegate setMainClass(String mainClass) {
        this.mainClass = mainClass;
        return this;
    }
    
    public LauncherDelegate allVmArg(String arg) {
        allVmArgs.add(arg);
        return this;
    }
    
    public LauncherDelegate vmArg(String arg) {
        vmArgs.add(arg);
        allVmArgs.add(arg);
        return this;
    }

    public LauncherDelegate arg(String arg) {
        programArgs.add(arg);
        return this;
    }

    public LauncherDelegate args(List<String> args) {
        programArgs.addAll(args);
        return this;
    }
    
    public LauncherDelegate projectProperty(String n, String v) {
        projectProperties.put(n, v);
        return this;
    }

    public LauncherDelegate property(String n, String v) {
        systemProperties.put(n, v);
        return this;
    }

    public void setSystemProperties(Map<String, String> systemProperties) {
        this.systemProperties = systemProperties;
    }

    public LauncherDelegate setDebugHost(String debugHost) {
        this.debugHost = debugHost;
        return this;
    }

    public LauncherDelegate setDebugConnectPort(int debugConnectPort) {
        this.debugConnectPort = debugConnectPort;
        return this;
    }

    public LauncherDelegate setDebugServer(boolean debugServer) {
        this.debugServer = debugServer;
        return this;
    }

    public LauncherDelegate setDebugSuspend(boolean debugSuspend) {
        this.debugSuspend = debugSuspend;
        return this;
    }

    public LauncherDelegate setJdwpParam(String jdwpParam) {
        this.jdwpParam = jdwpParam;
        return this;
    }

    public String getJvmBinaryPath() {
        return jvmBinaryPath;
    }
    
    public List<String> getAllVmArgs() {
        return allVmArgs;
    }

    public List<String> getVmArgs() {
        return vmArgs;
    }

    public List<String> getProgramArgs() {
        return programArgs;
    }

    public Map<String, String> getSystemProperties() {
        return systemProperties;
    }

    public String getDebugHost() {
        return debugHost;
    }

    public int getDebugConnectPort() {
        return debugConnectPort;
    }

    public boolean isDebugServer() {
        return debugServer;
    }

    public boolean isDebugSuspend() {
        return debugSuspend;
    }

    public String getJdwpParam() {
        return jdwpParam;
    }

    public String getMainClass() {
        return mainClass;
    }

    public boolean isDebugMode() {
        return debugMode;
    }

    public Map<String, String> getProjectProperties() {
        return projectProperties;
    }
    
    public int execute() throws IOException, InterruptedException {
        return 255;
    }
}
