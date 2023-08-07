/**
 * This is an init script, which configures the Exec-class tasks to invoke the specified Main class,
 * use a specified application params, JVM params and JVM debug settings.
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
                case "micronaut.java.codeLens":
                    return JavaCodeLens.collect(arguments, monitor);
                case "micronaut.java.project.type":
                    // see FindProjectTypeParams & FindProjectTypeResult.
                    return JavaCodeLens.findProjectType(arguments, monitor);
                default:
                    break;
            }
        }
        throw new UnsupportedOperationException(String.format("Not supported commandId: '%s'.", commandId));
    }
}
