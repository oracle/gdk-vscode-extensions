/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

declare namespace NodeJS {
  /**Env variables */
  interface ProcessEnv {
    GRAALVM_HOME: string;
    MICRONAUT_SERVER_PORT: string;
    DEBUG: string;
    TIMEOUT_MULTIPLICATOR: string;
  }
}
