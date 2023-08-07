#!/usr/bin/env bash

if [ -n "$JDT_LAUNCHWRAP_PROJECT_LAUNCHER" ] ; then
    LAUNCHER_DIR=$JDT_LAUNCHWRAP_PROJECT_LAUNCHER
else 
    DIR="$(dirname "$(readlink -f "$0")")"
    LAUNCHER_DIR=$DIR/../../agent
fi  
JAVA_BIN=$1

echo "Commandline is: $@"

#DEBUG=-agentlib:jdwp=transport=dt_socket,server=y,suspend=y,address=5011

$JAVA_BIN $DEBUG -jar $LAUNCHER_DIR/build-agent-0.1.0.jar "$@"
