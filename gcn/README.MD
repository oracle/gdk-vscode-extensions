# Graal Cloud Native Launcher
[![Visual Studio Marketplace](https://img.shields.io/visual-studio-marketplace/v/oracle-labs-graalvm.gcn?style=for-the-badge&label=VS%20Marketplace&logo=visual-studio-code)](https://marketplace.visualstudio.com/items?itemName=oracle-labs-graalvm.gcn)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/oracle-labs-graalvm.gcn?style=for-the-badge)](https://marketplace.visualstudio.com/items?itemName=oracle-labs-graalvm.gcn)
[![License](https://img.shields.io/github/license/oracle/gcn-vscode-extensions?style=for-the-badge&logo=upl)](https://github.com/oracle/gcn-vscode-extensions/blob/main/LICENSE.txt)

*** Technology Preview ***

[Graal Cloud Native](https://graal.cloud/) is a cloud-agnostic development framework, built on top of
[Micronaut](https://micronaut.io/). Using Graal Cloud Native you can write once and then run the same code on multiple cloud platforms.

This extension provides a wizard to easily create a new Graal Cloud Native project.

It is recommended to install [Graal Cloud Native Extension Pack](https://marketplace.visualstudio.com/items?itemName=oracle-labs-graalvm.graal-cloud-native-pack) which contains this extension and others.

## <a name='gcn-projects-generation-wizard'></a>Create New Project Wizard
​
The wizard can generate different types of Graal Cloud Native applications and serverless applications. You can select the Graal Cloud Native features you want your project to include.

1. Go to **View**, **Command Palette**, search for "Graal Cloud Native", and invoke the **Graal Cloud Native: Create New Project** command.

    ![Create New Project Action](images/gcn-vscode-actions.png)

2. Follow the command prompts to generate a new Maven or Gradle project. For example, to create a simple Java-based Graal Cloud Native application:
    - Select the Micronaut version
    - Select an Application type
    - Select an installed JDK
    - Provide a name for the project
    - Provide a base package
    - Pick the Graal Cloud Native services to be included in the project
    - Pick Features to be included in the project. E.g. when Database was selected in Services step then in this step pick Oracle Cloud Autonomous Transaction Processing (ATP) feature which will add necassary dependencies to access Autonomous DB.
    - Select a build tool: Maven or Gradle
    - Select a unit test framework: JUnit, Spock, or Kotest
    - Select cloud providers to support: Oracle Cloud Infrastructure and/or Amazon Web Services; Note: you need to select OCI if you want OCI DevOps support

3. Finally, you are asked where to save your new project. You then choose to open it in a new VS Code window or add it to a Workspace in the current VS Code window.

You now have a new Graal Cloud Native application, complete with example code showing you how to start using [Graal Cloud Native](https://graal.cloud/).

## <a name='gcn-extension-pack'></a>Graal Cloud Native Extension Pack
Graal Cloud Native extension is part of the [Graal Cloud Native Extension Pack](https://marketplace.visualstudio.com/items?itemName=oracle-labs-graalvm.graal-cloud-native-pack) which is recommended to install. The extension pack provides also following support:
1. Oracle Cloud Infrastructure DevOps integration to provision build pipelines for Graal Cloud Native or Micronaut projects. GraalVM Native Image builds are provisioned automatically.
2. Micronaut development support including Micronaut project wizard, REST Explorer and database drivers for Oracle DB and MySQL databases.

## <a name='provide-feedback-or-seek-help'></a>Provide Feedback or Seek Help

* [Request a feature](https://github.com/oracle/gcn-vscode-extensions/issues/new?labels=enhancement)
* [File a bug](https://github.com/oracle/gcn-vscode-extensions/issues/new?labels=bug)

### <a name='privacy-policy'></a>Privacy Policy

Read the [Oracle Privacy Policy](https://www.oracle.com/legal/privacy/privacy-policy.html) to learn more.
