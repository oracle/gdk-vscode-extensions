/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

package com.oracle.jdtls.ext.launcher;

import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.util.logging.Level;
import java.util.logging.Logger;
import java.util.stream.Stream;

/**
 *
 * @author phejl
 */
public class ProcessesImpl {

    private static final Logger LOGGER = Logger.getLogger(ProcessesImpl.class.getName());

    private static final boolean ENABLED;

    private static final Method PROCESS_TO_HANDLE;

    private static final Method PROCESS_HANDLE_DESCENDANTS;

    private static final Method PROCESS_HANDLE_DESTROY;

    static {
        Method toHandle = null;
        Method descendants = null;
        Method destroy = null;
        try {
            toHandle = Process.class.getDeclaredMethod("toHandle", new Class[]{}); // NOI18N
            if (toHandle != null) {
                Class processHandle = Class.forName("java.lang.ProcessHandle"); // NOI18N
                descendants = processHandle.getDeclaredMethod("descendants", new Class[]{}); // NOI18N
                destroy = processHandle.getDeclaredMethod("destroy", new Class[]{}); // NOI18N
            }
        } catch (NoClassDefFoundError | Exception ex) {
            LOGGER.log(Level.WARNING, null, ex);
        }

        ENABLED = toHandle != null && descendants != null && destroy != null;
        PROCESS_TO_HANDLE = toHandle;
        PROCESS_HANDLE_DESCENDANTS = descendants;
        PROCESS_HANDLE_DESTROY = destroy;
    }

    public static void killTree(Process process) {
        if (!ENABLED) {
            throw new UnsupportedOperationException("The JDK 9 way of killing process tree is not supported"); // NOI18N
        }

        try {
            Object handle = PROCESS_TO_HANDLE.invoke(process, (Object[]) null);
            try (Stream<?> s = (Stream<?>) PROCESS_HANDLE_DESCENDANTS.invoke(handle, (Object[]) null)) {
                destroy(handle);
                s.forEach(ch -> destroy(ch));
            }
        } catch (IllegalAccessException | IllegalArgumentException |InvocationTargetException ex) {
            throw new UnsupportedOperationException("The JDK 9 way of killing process tree has failed", ex); // NOI18N
        }
    }

    private static void destroy(Object handle) {
        try {
            PROCESS_HANDLE_DESTROY.invoke(handle, (Object[]) null);
        } catch (IllegalAccessException | IllegalArgumentException | InvocationTargetException ex) {
            LOGGER.log(Level.INFO, null, ex);
        }
    }

}
