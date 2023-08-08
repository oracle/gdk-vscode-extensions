/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */
package com.oracle.jdtls.ext.core;

import com.google.gson.Gson;

import java.io.File;
import java.net.URI;
import java.net.URISyntaxException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.stream.Stream;
import java.util.stream.Collectors;
import java.util.regex.Pattern;

import org.apache.maven.model.Plugin;
import org.apache.maven.project.MavenProject;
import org.eclipse.buildship.core.GradleBuild;
import org.eclipse.buildship.core.GradleCore;
import org.eclipse.core.resources.IProject;
import org.eclipse.core.runtime.CoreException;
import org.eclipse.core.runtime.IPath;
import org.eclipse.core.runtime.IProgressMonitor;
import org.eclipse.jdt.core.ICompilationUnit;
import org.eclipse.jdt.core.IJavaElement;
import org.eclipse.jdt.core.IJavaProject;
import org.eclipse.jdt.core.IMethod;
import org.eclipse.jdt.core.IType;
import org.eclipse.jdt.core.ITypeRoot;
import org.eclipse.jdt.core.JavaCore;
import org.eclipse.jdt.ls.core.internal.JDTUtils;
import org.eclipse.jdt.ls.core.internal.ProjectUtils;
import org.eclipse.jdt.ls.core.internal.ResourceUtils;
import org.eclipse.lsp4j.CodeLens;
import org.eclipse.lsp4j.CodeLensParams;
import org.eclipse.lsp4j.Command;
import org.eclipse.lsp4j.Location;
import org.eclipse.m2e.core.MavenPlugin;
import org.eclipse.m2e.core.project.IMavenProjectRegistry;
import org.eclipse.m2e.core.project.IMavenProjectFacade;
import org.gradle.tooling.model.GradleProject;


public final class JavaCodeLens {

    private static final Gson gson = new Gson();

    public static Object collect(List<Object> arguments, IProgressMonitor monitor) {
        CodeLensParams params = gson.fromJson(gson.toJson(arguments.get(0)), CodeLensParams.class);
        try {
            ICompilationUnit unit = JDTUtils.resolveCompilationUnit(params.getTextDocument().getUri());
            if (unit != null) {
                List<CodeLens> lenses = new ArrayList<>();
                collectCodeLenses(unit, unit.getChildren(), lenses, monitor);
                return lenses;
            }
        } catch (Exception e) {
            JdtlsExtActivator.logException("Problem with codeActions for " +  params.getTextDocument().getUri(), e);
        }
        return null;
    }

    private static void collectCodeLenses(ITypeRoot typeRoot, IJavaElement[] elements, List<CodeLens> lenses, IProgressMonitor monitor) throws Exception {
		for (IJavaElement element : elements) {
			if (monitor.isCanceled()) {
				return;
			}
			if (element.getElementType() == IJavaElement.TYPE) {
				collectCodeLenses(typeRoot, ((IType) element).getChildren(), lenses, monitor);
			} else if (element.getElementType() == IJavaElement.METHOD) {
                IMethod method = (IMethod) element;
                if (method.isMainMethod()) {
                    IJavaProject javaProject = typeRoot.getJavaProject();
                    if (isMicronautProject(javaProject, monitor)) {
                        Location loc = JDTUtils.toLocation(method);
                        if (loc != null) {
                            lenses.add(new CodeLens(loc.getRange(), new Command("Run with Micronaut Continuous Mode", "extension.micronaut-tools.launch.continuous", Arrays.asList(getProjectURI(javaProject), true)), null));
                        }
                    }
                }
			}
		}
	}

    private static boolean isMicronautProject(IJavaProject javaProject, IProgressMonitor monitor) throws Exception {
        if (ProjectUtils.isMavenProject(javaProject.getProject())) {
            IMavenProjectRegistry registry = MavenPlugin.getMavenProjectRegistry();
            IMavenProjectFacade facade = registry.getProject(javaProject.getProject());
            if (facade != null) {
                MavenProject mvnProject = facade.getMavenProject(monitor);
                Plugin plugin = mvnProject != null ? mvnProject.getPlugin("io.micronaut.build:micronaut-maven-plugin") : null;
                if (plugin != null) {
                    return true;
                }
            }
            return false;
        } else if (ProjectUtils.isGradleProject(javaProject.getProject())) {
            GradleBuild build = GradleCore.getWorkspace().getBuild(javaProject.getProject()).get();
            if (build != null) {
                File projectPath = javaProject.getProject().getLocation().toFile();

                // for some reason, the model is a root project, even for subprojects.
                GradleProject rootProject = build.withConnection(connection -> connection.getModel(GradleProject.class), monitor);
                File gradleDir = rootProject.getProjectDirectory();
                GradleProject gradleProject;
                if (gradleDir.equals(projectPath)) {
                    gradleProject = rootProject;
                } else {
                    gradleProject = rootProject.getChildren().stream().filter(gp -> gp.getProjectDirectory().equals(projectPath)).findAny().orElse(null);
                }
                if (gradleProject == null) {
                    return false;
                }
                Path scriptPath = gradleProject.getBuildScript().getSourceFile().toPath();
                if (Files.exists(scriptPath)) {
                    String script = Files.readString(scriptPath);
                    return Pattern.compile("id\\s*\\(\\s*\\\"io\\.micronaut\\.application\\\"\\s*\\)").matcher(script).find();
                } else {
                    return false;
                }
            }
        }
        return false;
    }

    public static FindProjectTypeResult findProjectType(List<Object> arguments, IProgressMonitor monitor) {
        FindProjectTypeParams params = gson.fromJson(gson.toJson(arguments.get(0)), FindProjectTypeParams.class);
        IProject targetProject = null;

        if (params.getProjectName() != null) {
            targetProject = Stream.of(ProjectUtils.getAllProjects()).filter(ProjectUtils::isJavaProject).filter(
                p -> p.getName().equals(params.getProjectName())).findFirst().orElse(null);
        }
        // Give mainClass a priority, as the workspace folder may be a parent project, while main class may identify a precise file.
        // If mainclass is not a filenam
        if (targetProject == null && params.getMainClass() != null) {
            try {
                Path p = Paths.get(params.getMainClass());
                if (Files.exists(p)) {
                    IPath sourceFolderPath = ResourceUtils.filePathFromURI(p.toUri().toString());
                    targetProject = findBelongedProject(sourceFolderPath);
                }
            } catch (IllegalArgumentException ex) {
                // expected
            }
        }
        if (targetProject == null && params.getLocation() != null) {
            IPath sourceFolderPath = ResourceUtils.filePathFromURI(params.getLocation());
            if (sourceFolderPath != null) {
                targetProject = findBelongedProject(sourceFolderPath);
            }
        }
        FindProjectTypeResult res = new FindProjectTypeResult();
        if (targetProject == null) {
            res.setType("Unknown");
        } else {
            IJavaProject jProject = JavaCore.create(targetProject);
            res.setType(getProjectType(jProject));
            IPath location = targetProject.getLocation();
            if (location != null) {
                res.setProjectDir(location.toOSString());
            }
            try {
                res.setContainer(isMicronautProject(jProject, monitor) ? "micronaut": null);
            } catch (Exception ex) {
                // swallow, cannot determine the container.
            }
            if (ProjectUtils.isMavenProject(jProject.getProject())) {
                IMavenProjectRegistry registry = MavenPlugin.getMavenProjectRegistry();
                IMavenProjectFacade facade = registry.getProject(jProject.getProject());
                if (facade != null) {
                    try {
                        MavenProject mvnProject = facade.getMavenProject(monitor);
                        while (mvnProject.getParent() != null && mvnProject.getParent().getBasedir() != null) {
                            mvnProject = mvnProject.getParent();
                        }
                        res.setRoot(mvnProject.getBasedir().toString());
                    } catch (CoreException ex) {
                        // swallow ?
                    }
                }
            } else if (ProjectUtils.isGradleProject(jProject.getProject())) {
                GradleBuild build = GradleCore.getWorkspace().getBuild(jProject.getProject()).get();
                if (build != null) {
                    try {
                        GradleProject gradleProject = build.withConnection(connection -> connection.getModel(GradleProject.class), monitor);
                        GradleProject root = gradleProject.findByPath(":");
                        res.setRoot(root.getProjectDirectory().toString());
                    } catch (Exception ex) {
                        // swallow
                    }
                }
            }
        }
        return res;
    }

	private static IProject findBelongedProject(IPath sourceFolder) {
		List<IProject> projects = Stream.of(ProjectUtils.getAllProjects()).filter(ProjectUtils::isJavaProject).sorted(new Comparator<IProject>() {
			@Override
			public int compare(IProject p1, IProject p2) {
				return p2.getLocation().toOSString().length() - p1.getLocation().toOSString().length();
			}
		}).collect(Collectors.toList());

		for (IProject project : projects) {
			if (project.getLocation().isPrefixOf(sourceFolder)) {
				return project;
			}
		}

		return null;
	}

    private static String getProjectType(IJavaProject javaProject) {
        if (ProjectUtils.isMavenProject(javaProject.getProject())) {
            return "Maven";
        }
        if (ProjectUtils.isGradleProject(javaProject.getProject())) {
            return "Gradle";
        }
        return "Unknown";
    }

    private static String getProjectURI(IJavaProject javaProject) {
        return ResourceUtils.toClientUri(JDTUtils.getFileURI(javaProject.getProject()));
    }
}
