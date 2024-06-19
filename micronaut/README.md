# Launch for Micronaut&reg; framework
[![Visual Studio Marketplace](https://img.shields.io/visual-studio-marketplace/v/oracle-labs-graalvm.micronaut?style=for-the-badge&label=VS%20Marketplace&logo=visual-studio-code)](https://marketplace.visualstudio.com/items?itemName=oracle-labs-graalvm.micronaut)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/oracle-labs-graalvm.micronaut?style=for-the-badge)](https://marketplace.visualstudio.com/items?itemName=oracle-labs-graalvm.micronaut)
[![License](https://img.shields.io/github/license/oracle/gcn-vscode-extensions?style=for-the-badge&logo=upl)](https://github.com/oracle/gcn-vscode-extensions/blob/main/LICENSE.txt)

*** Technology Preview ***

## Overview
Launch for Micronaut® framework is a lightweight extension for creating [Micronaut framework](https://micronaut.io/) applications within VS Code.
The Micronaut framework is a lightweight reactive framework that provides a solid foundation for building cloud native Java microservices.

## Features
* [Create a New Micronaut Project](#create-a-new-micronaut-project)

## Requirements
- VS Code (version 1.76.0 or later).

## Installing the Extension
Click **Install** on the banner above, or from the Extensions side bar in VS Code, by searching for "Launch for Micronaut® framework".

You can also find the extension listed on the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=oracle-labs-graalvm.micronaut).

> Note: This extension is part of the [Graal Development Kit for Micronaut Extension Pack](https://marketplace.visualstudio.com/items?itemName=oracle-labs-graalvm.graal-cloud-native-pack). We recommend installing the _Graal  Development Kit for Micronaut_ Extension Pack as it provides additional extensions for Micronaut development, including the [Tools for Micronaut® framework](https://marketplace.visualstudio.com/items?itemName=oracle-labs-graalvm.micronaut-tools) extension.

## Usage

### Create a New Micronaut Project

To quickly create a new project, select **Command Palette** from the **View** menu.
Enter "Micronaut Launch" and invoke the **Micronaut Launch: Create Micronaut Project** command.
The wizard will prompt you to:

- Pick the Micronaut version
- Pick the application type (for more information, see [Creating a Project](https://docs.micronaut.io/latest/guide/#createProject))
- Select a Java version to be used for the project
- Enter a project name (or use the default "demo")
- Enter a base package name (or use the default "com.example")
- Pick the project language (you can build an application using Java, Groovy, or Kotlin)
- Pick the project features (some of which are listed below)
  ![Micronaut Project Features](images/micronaut-project-features_view.png)
- Pick the build tool (Gradle or Maven)
- Pick the test framework (JUnit, Spock, or Kotlintest)
- Select the destination directory

Finally, select whether to open the new project in a new window or add it to the current workspace.

## Extension Settings

The extension contributes the following settings:

* __micronaut.home__ - the optional path to your local [Micronaut Launch](https://micronaut-projects.github.io/micronaut-starter/latest/guide/index.html#introduction) Command Line Interface (CLI).
Specify the local Micronaut CLI installation to be used in addition to the default [Micronaut Launch web interface](https://micronaut.io/launch/), for example, _/usr/me/micronaut-cli-4.0.1_.
 ![Micronaut CLI Set](images/micronaut-cli-setting.png)
* __micronaut.launchUrl__ - Optional URL for the Micronaut Launch web interface (for example, `https://launch.micronaut.io`).
Specify a URL for the Micronaut Launch web interface in addition to the default (`https://micronaut.io/launch/`).

## Available Commands

To invoke the commands available from the Command Palette, search for "Micronaut Launch".
To open the Command Palette, select **Command Palette** from the **View** menu.

The following command is available for Micronaut project creation:

* **Micronaut Launch: Create Micronaut Project**: create a Micronaut project

## Feedback

If you have suggestions for new features, or if you have found a bug or issue, we would love to hear from you. Use the links below:

* [Request a feature](https://github.com/oracle/gcn-vscode-extensions/issues/new?labels=enhancement)
* [File a bug](https://github.com/oracle/gcn-vscode-extensions/issues/new?labels=bug)

## Contributing

To submit pull requests to vscode-extensions, first sign the [Oracle Contributor Agreement](http://www.oracle.com/technetwork/community/oca-486395.html).

Project members with write access to the repository will identify and assign an appropriate [Assignee](https://help.github.com/articles/assigning-issues-and-pull-requests-to-other-github-users/) for the pull request.
The assignee will work with the pull request owner to address any issues and then merge the pull request.

## Release Notes

Refer to [CHANGELOG](CHANGELOG.md).

Micronaut® is a registered trademark of Object Computing, Inc. Use is for referential purposes and does not imply any endorsement or affiliation with any third-party product. Unauthorized use is strictly prohibited.