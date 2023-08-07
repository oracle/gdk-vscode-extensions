/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */
package com.oracle.jdtls.ext.core;

import org.eclipse.xtext.xbase.lib.Pure;

/**
 * Request parameters for command micronaut.java.project.type. The project is determined either by the project name. If missing, the 
 * project is determined by the mainClass if specified as a filename, as each filename belongs to at most one JDT project. If still unsuccessful,
 * location (as an URI) is used to determine a file, and therefore the project.
 */
public class FindProjectTypeParams {
    /**
     * Location of the anchor file, an URI.
     */
    private String location;

    /**
     * A JDT project name.
     */
    private String projectName;

    /**
     * A main class name, OR a filename of the main class. vscode-java extension allows mainClass launch configuration
     * property to be a file, like ${currentFile}, and that will determine the project that is going to be run.
     */
    private String mainClass;

    public FindProjectTypeParams() {

    }

    public void setLocation(String location) {
        this.location = location;
    }

    public void setProjectName(String projectName) {
        this.projectName = projectName;
    }

    public void setMainClass(String mainClass) {
        this.mainClass = mainClass;
    }

    @Pure
    public String getProjectName() {
        return projectName;
    }

    @Pure
    public String getMainClass() {
        return mainClass;
    }

    @Pure
    public String getLocation() {
        return location;
    }
}
