/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */
package com.oracle.jdtls.ext.core;

import java.util.List;

import org.apache.commons.lang3.StringUtils;
import org.eclipse.core.runtime.IProgressMonitor;
import org.eclipse.jdt.ls.core.internal.IDelegateCommandHandler;

public class CommandHandler implements IDelegateCommandHandler {

    @Override
    public Object executeCommand(String commandId, List<Object> arguments, IProgressMonitor monitor) throws Exception {
         if (!StringUtils.isBlank(commandId)) {
            switch (commandId) {
                case "extension.micronaut-tools.java.codeLens":
                    return JavaCodeLens.collect(arguments, monitor);
                case "extension.micronaut-tools.java.project.type":
                    // see FindProjectTypeParams & FindProjectTypeResult.
                    return JavaCodeLens.findProjectType(arguments, monitor);
                default:
                    break;
            }
        }
        throw new UnsupportedOperationException(String.format("Not supported commandId: '%s'.", commandId));
    }
}
