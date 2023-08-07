package com.oracle.jdtls.ext.core;

import org.eclipse.xtext.xbase.lib.Pure;

/**
 * Result produced by "micronaut.java.project.type" command. 
 */
public class FindProjectTypeResult {
    /**
     * Project type. Can be either 'gradle' or 'maven'. Other build systems are not recognized at the moment.
     */
    private String type;

    /**
     * Root project's directory, as a pathname. In case the queried project is a subproject, the root should point
     * to the outermost project in the (maven) "reactor" or (gradle) multi-project.
     */
    private String root;

    /**
     * Project directory. When resolving the project form the class or location, the project directory is important
     * for project build/description files.
     */
    private String projectDir;

    /**
     * Container technology used by the project, which may determine different buildsystem plugin(s) to use for operation.
     */
    private String container;

    public FindProjectTypeResult() {}

    public void setContainer(String container) {
        this.container = container;
    }

    public void setProjectDir(String projectDir) {
        this.projectDir = projectDir;
    }

    @Pure
    public String getProjectDir() {
        return projectDir;
    }

    public void setType(String type) {
        this.type = type;
    }

    public void setRoot(String root) {
        this.root = root;
    }

    @Pure
    public String getType() {
        return type;
    }

    @Pure
    public String getRoot() {
        return root;
    }

    @Pure
    public String getContainer() {
        return container;
    }
}
