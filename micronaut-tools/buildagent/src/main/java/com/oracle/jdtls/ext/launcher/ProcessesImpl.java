/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

package com.oracle.jdtls.ext.launcher;

import java.io.PrintWriter;
import java.io.StringWriter;
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

    public static void killTree(Process process) {
        ProcessHandle handle = process.toHandle();
        LauncherDelegate.LOG("Process to be killed: {0}", handle);
        try (Stream<ProcessHandle> s = handle.descendants()) {
            destroy(handle);
            s.forEach(ch -> {
                destroy(ch);
            });
        }
    }

    private static void destroy(ProcessHandle handle) {
        if (!handle.isAlive()) {
            return;
        }
        try {
            LauncherDelegate.LOG("Trying to destroy handle: {0}", handle);
            handle.destroy();
            LauncherDelegate.LOG("-> Success: {0}", handle);
        } catch (IllegalStateException ex) {
            StringWriter sw = new StringWriter();
            PrintWriter pw = new PrintWriter(sw);
            ex.printStackTrace(pw);
            pw.flush();
            LauncherDelegate.LOG("-> Failure: {0}", sw.toString());
            LOGGER.log(Level.INFO, null, ex);
        }
    }

}
