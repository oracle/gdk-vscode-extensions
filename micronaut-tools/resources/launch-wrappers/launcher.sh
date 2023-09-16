#!/usr/bin/env bash
#
# Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
# DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
#
# Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
#
if [ -n "$JDT_LAUNCHWRAP_PROJECT_LAUNCHER" ] ; then
    LAUNCHER_DIR="$JDT_LAUNCHWRAP_PROJECT_LAUNCHER"
else 
    DIR="$(dirname "$(readlink -f "$0")")"
    LAUNCHER_DIR="$DIR/../../agent"
fi  
export JAVACMD="$1"

echo "Commandline is: $@"

#DEBUG=-agentlib:jdwp=transport=dt_socket,server=y,suspend=y,address=5011
"$JAVACMD" $DEBUG -jar "$LAUNCHER_DIR/build-agent-0.1.0.jar" "$@"
