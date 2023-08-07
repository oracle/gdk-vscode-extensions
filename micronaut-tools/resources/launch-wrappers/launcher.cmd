@echo off

if NOT "%JDT_LAUNCHWRAP_PROJECT_LAUNCHER%" == "" (
    SET LAUNCHER_DIR=%JDT_LAUNCHWRAP_PROJECT_LAUNCHER%
)
else (
    SET DIR=%~dp0
    SET LAUNCHER_DIR="%DIR%..\..\agent"
)

SET JAVA_BIN=%1

rem echo "Commandline is: %*"

rem DEBUG=-agentlib:jdwp=transport=dt_socket,server=y,suspend=y,address=5011

%JAVA_BIN% -jar "%LAUNCHER_DIR%\build-agent-0.1.0.jar" %*
