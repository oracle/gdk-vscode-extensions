@echo off
rem
rem  Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
rem  DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
rem
rem  Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
rem
if "%JDT_LAUNCHWRAP_PROJECT_LAUNCHER%" == "" (
    SET "DIR=%~dp0"
    SET "LAUNCHER_DIR=%DIR%..\..\agent"
) else (
    SET "LAUNCHER_DIR=%JDT_LAUNCHWRAP_PROJECT_LAUNCHER%"
)
SET "JAVACMD=%1"
rem echo "Commandline is: %*"

rem DEBUG=-agentlib:jdwp=transport=dt_socket,server=y,suspend=y,address=5011

%JAVACMD% -jar "%LAUNCHER_DIR%\build-agent-0.1.0.jar" %*
