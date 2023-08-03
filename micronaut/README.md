# GraalVM Tools for Micronaut® &mdash; Micronaut Productivity

## Overview
GraalVM Tools for Micronaut is a powerful extension for using [GraalVM](https://www.oracle.com/java/graalvm/) to develop [Micronaut framework](https://micronaut.io/) applications within VS Code.
Micronaut framework is a lightweight reactive framework that provides a solid foundation for building cloud native Java microservices.

## Features
* [Create a New Micronaut Project](#create-a-new-micronaut-project)✨
* [View Suggested Code Completions](#view-suggested-code-completions)
* [Navigate Micronaut Source Code](#navigate-micronaut-source-code)
* [Run Your Micronaut Application](#run-your-micronaut-application) 
* [Live Reloading of Applications](#live-reloading-of-applications)
* [Debug Your Micronaut Application](#debug-your-micronaut-application)
* [Package Your Micronaut Application](#package-your-micronaut-application)
* [Create a Native Executable from Your Micronaut Application](#create-a-native-executable-from-your-micronaut-application)
* [Build a Container Image and Deploy Your Micronaut Application to a Container Registry](#build-a-container-image-and-deploy-your-micronaut-application-to-a-container-registry)
* [Deploy Your Application to Oracle Cloud Infrastructure](#deploy-your-application-to-oracle-cloudinfrastructure)
* [Connect to an Oracle Autonomous Database](#connect-to-an-oracle-autonomous-database)
* [Create Entity and Repository Classes From an Existing Database Schema](#create-entity-and-repository-classes-from-an-existing-database-schema)

## Requirements
- VS Code (version 1.76.0 or later).
- The [Extension Pack for Java from Microsoft](https://marketplace.visualstudio.com/items?itemName=vscjava.vscode-java-pack).
VS Code will prompt you to install the extension when you open a Micronaut project (for more information, see [Java in VS Code](https://code.visualstudio.com/docs/languages/java)).
- [Apache NetBeans Language Server for Java](https://marketplace.visualstudio.com/items?itemName=ASF.apache-netbeans-java).
- (Optional.) The A Java Development Kit (JDK) installation (JDK 17 or later).
[Oracle GraalVM](https://www.oracle.com/java/graalvm/) is a fast and efficient JDK from Oracle.

## Installing the Extension
Click **Install** on the banner above, or from the Extensions side bar in VS Code, by searching for "GraalVM Tools for Micronaut".

You can also find the extension listed on the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=oracle-labs-graalvm.micronaut).

The Micronaut Tools page opens as soon as the extension is installed.
You can also open this page using the Command Palette command **Micronaut: Show Micronaut Tools Page**.

 ![Micronaut Tools Page](images/micronaut_tools_page.png)

## Usage

### Create a New Micronaut Project

To create a new project, select **Command Palette** from the **View** menu.
Enter "micronaut" and invoke the **Micronaut: Create Micronaut Project** command.
The wizard will prompt you to:

- Pick the Micronaut version
- Pick the application type
- Pick the Java version
- Enter a project name (or use the default "demo")
- Enter a base package name (or use the default "com.example")
- Pick the project language (Java, Kotlin, or Groovy)
- Pick the project features
  ![Micronaut Project Features](images/micronaut-project-features_view.png)
- Pick the build tool (Gradle or Maven)
- Pick the test framework (JUnit, Spock, or Kotlintest)
- Select the destination directory

Finally, select whether to open the new project in a new window or add it to the current workspace.

The extension adds a new view to the Explorer container: it displays Micronaut projects in the current workspace.

### View Suggested Code Completions

The extension suggests code completions for your YAML configuration files.
(The available configuration properties and their values are collected by scanning your source code and the Micronaut libraries.)

The extension also provides code completion for your Java source code via the [Extension Pack for Java from Microsoft](https://marketplace.visualstudio.com/items?itemName=vscjava.vscode-java-pack).
This gives you all the IDE features that you would expect from [Intellisense](https://code.visualstudio.com/docs/editor/intellisense), as well as automatically highlighting errors as you type.

### Navigate Micronaut Source Code

You can easily navigate to Micronaut-specific elements of your source code via the **Go to Symbol in Workspace** command.

Run the **Go to Symbol in Workspace** command using Ctrl+T (Cmd+T on macOS) and enter the prefix:
* `@/` to show all defined request mappings
* `@+` to show all defined beans

![Navigate Micronaut Source Code](images/micronaut-navigation.png)

### Run Your Micronaut Application

The easiest way to run your Micronaut application is to open the application's main class in editor and click on the **Run** code len that appears above the main method.

![Run Micronaut Application](images/run_main_method.png)

Alternatively, you can either select the **Run and Debug** (Ctrl+Shift+D) activity bar item and (without the **launch.json** file created) click on the **Run and Debug** button,
or you can navigate to the **Run** menu item and then select **Run Without Debugging** Ctrl+F5. If a request to select debugger appears, select **Java**. The selected debugger
will run out-of-box by automatically finding the main class and generating a default launch configuration in memory to launch your application.

![Select Debugger in Run and Debug Activity](images/run_debug_activity.png)

To customize and persist your launch configuration, select the **create a launch.json file** link in the **Run and Debug** view. For more details on how to create the launch.json, read [Launch configurations](https://code.visualstudio.com/docs/editor/debugging#_launch-configurations); for more details on configuration options for Java, you can read [Configuration options](https://code.visualstudio.com/docs/java/java-debugging#_configuration-options).

### Live Reloading of Applications

One of the nice Micronaut features is an ability to automatically recompile and restart the application (or its parts) when changes to the source files are detected.
To run your Micronaut application with the automatic restarts enabled, open the application's main class in editor and click on the **Run with Micronaut Continuous Mode** code len that appears above the main method.

![Run Micronaut Application in Continuous Mode](images/run-continuous.png)

Alternatively, you can select the **Run and Debug** (Ctrl+Shift+D) activity bar item and select the **create a launch.json file** link. Within the created **launch.json** file,
add a new configuration, make sure to set the **JDT_LAUNCHWRAP_MICRONAUT_CONTINUOUS** environment variable to **true**, then select the newly added configuration in the **Run and Debug** view, and finally click on the **Run** icon or press Ctrl+F5.

![Select Launch Configuration to Run Micronaut Application in Continuous Mode](images/run-continuous-config.png)

### Debug Your Micronaut Application

The easiest way to start debugging your Micronaut application is to open the application's main class in editor and click on the **Debug** code len that appears above the main method.

![Debug Micronaut Application](images/debug_main_method.png)

Alternatively, you can either select the **Run and Debug** (Ctrl+Shift+D) activity bar item and (without the **launch.json** file created) click on the **Run and Debug** button,
or you can navigate to the **Run** menu item and then select **Start Debugging** F5. If a request to select debugger appears, select **Java**. The selected debugger
will run out-of-box by automatically finding the main class and generating a default launch configuration in memory to launch your applicationin in debug mode.

![Select Debugger in Run and Debug Activity](images/run_debug_activity.png)

To customize and persist your launch configuration, select the **create a launch.json file** link in the **Run and Debug** view. For more details on how to create the launch.json, read [Launch configurations](https://code.visualstudio.com/docs/editor/debugging#_launch-configurations); for more details on configuration options for Java, you can read [Configuration options](https://code.visualstudio.com/docs/java/java-debugging#_configuration-options).

### Package Your Micronaut Application

To package your application as a runnable JAR file, follow these steps:

1. Select **Command Palette** from the **View** menu.
Enter "micronaut" and invoke the **Micronaut: Build...** command.

2. Select the **compile** build goal from a list of available goals.

    ![Micronaut Build Commands](images/micronaut-build-commands.png)

3. When the compilation completes, invoke the **Micronaut: Build...** command again.
This time, select the **package** goal, which will package your application into a JAR file.

### Create a Native Executable from Your Micronaut Application

[comment]: <> (Why does this not use the **Micronaut: Build Native Image** command?)

If you have installed Oracle GraalVM, you can use GraalVM Native Image create a native executable from your application.
GraalVM Native Image creates an executable file with all the application classes, dependent library classes, dependent JDK classes, and a snapshot of the application heap. 
Whilst building a native executable can take some time, the benefits include a dramatic reduction in startup time and reduced overall memory consumption.

> **Note**: The time to build an executable depends on application size and complexity.

To create a native executable, follow these steps:

1. Select **Command Palette** from the **View** menu.
Enter "micronaut" and invoke the **Micronaut: Build...** command.

2. Select the **compile** build goal from a list of available goals.

    ![Micronaut Build Commands](images/micronaut-build-commands.png)

3. When the compilation completes, invoke the **Micronaut: Build...** command again.
This time, select the **nativeImage** goal, which creates a native executable from your application.

    * If your application is built with Maven, the goal runs the command `mvnw package -Dpackaging=native-image`.
    The resulting native executable will in the _target/native-image/_ directory.

    * If your application is built with Gradle, the goal runs the command `gradlew nativeCompile`.
    The resulting native executable will in the _build/native/nativeCompile/_ directory.

To run your Micronaut application as a native executable, open a terminal by selecting **New Terminal** from the **Terminal** menu, then run the following command: 

* If you used Maven: `./target/<executable-name>`
* If you used Gradle: `./build/native/nativeCompile/<executable-name>`

For more information, see the [Micronaut documentation](https://guides.micronaut.io/latest/micronaut-creating-first-graal-app.html).

> **Note**: If you are using VS Code on the Windows platform, invoke the **Micronaut: Build Native Image** command from the Command Palette. 

### Build a Container Image and Deploy Your Micronaut Application to a Container Registry

You can build a container image of your Micronaut application, or create a container image of an executable created by GraalVM Native Image. You can then deploy the container image.

To build and deploy a container image of your application, follow these steps:

1. Select **Command Palette** from the **View** menu.
Enter "micronaut" and invoke the **Micronaut: Deploy ...** command.

2. Select select one of the goals from the list:
    - To deploy a containerized Micronaut application, select the **dockerPush** goal.
    - To deploy a containerized native executable, select the **dockerPushNative** goal.


To configure your application's container registry, see the [Micronaut Deploying Application](https://micronaut-projects.github.io/micronaut-maven-plugin/latest/examples/deploy.html) documentation.

**TODO** What is the equivalent Gradle documentation?

### Deploy Your Application to Oracle Cloud Infrastructure

**TODO** : Short intro the OCI DevOps extension and a link to install it. List the benefits and what it can do: Deploy Spring Boot, GCN and Java apps to the OCI DevOps service for building. For GCN and Spring Boot apps it will set up build and deployment pipelines that will create containers for you apps and deploy them to an OKE cluster. Include an animated GIF screenshot of the deployment targets?

### Connect to an Oracle Autonomous Database

**TODO** : Describe the feature that allows you to create a DB Connection to an ATP instance in OCI. Show updating connection properties. Describe that the password for the DB is stored in the secure platform specific system, keychain on OSX for example, so that you aren't prompted repeatedly to enter passwords.
**TODO** : Show how to manage DB connections.

### Create Entity and Repository Classes From an Existing Database Schema

**TODO** : Show how you can use the New from Micronaut Template action to create an entity class from an existing table in DB that you are connected to.
**TODO** : Show how can use the New from Micronaut Template action to create a repository class from an existing table in DB that you are connected to.
**TODO** : Show how you can run this locally, talking to a remote DB.

## Extension Settings

The extension contributes the following settings:

**TODO** These need more explanation. Why are they optional?

* __micronaut.home__ - the optional path to the Micronaut CLI installation -> specify local Micronaut CLI installation to be used
* __micronaut.showWelcomePage__ - show the Micronaut Tools Page on extension activation
* __micronaut.launchUrl__ - Optional Micronaut Launch URL (e.g. 'https://launch.micronaut.io') -> specifies additional Micronaut version source for project creation

## Micronaut Commands

Invoke the Micronaut commands from the Command Palette, then search for "Micronaut".
To open the Command Palette, select **Command Palette** from the **View** menu.
The Command Palette can be also opened by pressing F1, or `Ctrl+Shift+P` (`Command+Shift+P` for macOS). 
The following commands are available for Micronaut project development:

**TODO** This is out of date.

* **Micronaut: Show Micronaut Tools Page**: show the Micronaut Tools Page
* **Micronaut: Create Micronaut Project** create a Micronaut project based on [project creation wizard](https://micronaut.io/launch)

  ![Micronaut VS Code Commands](images/micronaut-vs-code-commands.png)

### Feedback

If you have suggestions for new features, or if you have found a bug or issue, we would love to hear from you. Use the links below to do so:

* [Request a feature](https://github.com/graalvm/vscode-extensions/issues/new?labels=enhancement)
* [File a bug](https://github.com/graalvm/vscode-extensions/issues/new?labels=bug)

## Contributing

To submit pull requests to vscode-extensions, you need to sign the [Oracle Contributor Agreement](http://www.oracle.com/technetwork/community/oca-486395.html).

Project members with write access to the repository will determine and assign an appropriate [Assignee](https://help.github.com/articles/assigning-issues-and-pull-requests-to-other-github-users/) for the pull request. The assignee will work with the pull request owner to address any issues and then merge the pull request.

## Release Notes

Refer to [CHANGELOG](CHANGELOG.md)