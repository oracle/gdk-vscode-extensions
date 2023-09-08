// Copyright (c) 2023, Oracle.
// Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
package com.example;

import io.micronaut.core.annotation.NonNull;

import java.util.Arrays;

import io.micronaut.context.ApplicationContextBuilder;
import io.micronaut.context.ApplicationContextConfigurer;
import io.micronaut.context.annotation.ContextConfigurer;
import io.micronaut.runtime.Micronaut;

public class Application {

    @ContextConfigurer
    public static class Configurer implements ApplicationContextConfigurer {
        @Override
        public void configure(@NonNull ApplicationContextBuilder builder) {
            builder.defaultEnvironments("oraclecloud");
        }
    }
    public static void main(String[] args) { 
        System.err.println("Commandline arguments: " + Arrays.asList(args));
        Micronaut.run(Application.class, args);
    }
}