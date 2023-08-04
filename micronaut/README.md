# GraalVM Tools for Micronaut&reg; &mdash; Micronaut Productivity

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

It is recommended to install [Graal Cloud Native Extension Pack](https://marketplace.visualstudio.com/items?itemName=oracle-labs-graalvm.graal-cloud-native-pack) which contains this and all other extensions for Graal Cloud Native development.

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

The easiest way to run your Micronaut application is to view the `Application` class in the editor and click **Run** above the `main()` method, as shown here.

![Run Micronaut Application](images/run_main_method.png)

Alternatively, select **Run Without Debugging** from the **Run** menu.

### Live Reloading of Applications

Micronaut has the ability to automatically recompile and restart your application (or its parts) when it detects changes to your source code.
(This is called "Continuous Mode".)
To run your Micronaut application in this mode, view the `Application` class in the editor and click **Run with Micronaut Continuous Mode** above the `main()` method, as shown here.

![Run Micronaut Application in Continuous Mode](images/run-continuous.png)

Alternatively, select **Run and Debug** in the activity bar and click **create a launch.json file**.
When prompted, select **Java** as the debugger.
Add a new configuration named "Continuous Application" to the _launch.json_ file and set the value of the its `JDT_LAUNCHWRAP_MICRONAUT_CONTINUOUS` environment variable to `true` (as shown below).
Select the newly added configuration in the **Run and Debug** view, and finally click **Run**.

![Select Launch Configuration to Run Micronaut Application in Continuous Mode](images/run-continuous-config.png)

### Debug Your Micronaut Application

The easiest way to run your Micronaut application is to view the `Application` class in the editor and click **Debug** above the `main()` method, as shown here.

![Debug Micronaut Application](images/debug_main_method.png)

Alternatively, select **Start Debugging** from the **Run** menu.

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

You can build a container image of your Micronaut application, or create a container image of an executable created by GraalVM Native Image.
You can then deploy the container image.

To build and deploy a container image of your application, follow these steps:

1. Select **Command Palette** from the **View** menu.
Enter "micronaut" and invoke the **Micronaut: Deploy ...** command.

2. Select select one of the goals from the list:
    - To deploy a containerized Micronaut application, select the **dockerPush** goal.
    - To deploy a containerized native executable, select the **dockerPushNative** goal.


To configure your application's container registry, see the [Micronaut Deploying Application](https://micronaut-projects.github.io/micronaut-maven-plugin/latest/examples/deploy.html) Maven documentation or [Gradle Plugin Documentation](https://micronaut-projects.github.io/micronaut-gradle-plugin/latest/). 

### Deploy Your Application to Oracle Cloud Infrastructure

Micronaut extension is part of [Graal Cloud Native Extension Pack](https://marketplace.visualstudio.com/items?itemName=oracle-labs-graalvm.graal-cloud-native-pack) which also provides [OCI DevOps Tools extension](https://marketplace.visualstudio.com/items?itemName=oracle-labs-graalvm.oci-devops). This extension simplifies deployment and build of not only Micronaut application in Oracle Cloud Infrastructure.
It is recommended to install OCI DevOps Extension when working with OCI. Supported technologies are:
   1. Micronaut
   2. Graal Cloud Native
   3. Spring Boot

   * Gradle or Maven projects.

When used OCI DevOps extension provisions build and deployment pipelines for these projects including build of:
   1. OCI Native Executable Container - docker container with application compiled in GraalVM native image
   2. OCI JVM container - docker container with application built into Jar files

It also provisions OKE cluster to run these containers in Kubernetes service.
Read [Using OCI DevOps Tools Extensions in VS Code](https://www.graal.cloud/gcn/get-started/using-gcn-vscode-tools/) to see all the support for OCI DevOps available in VSCode.

### Connect to an Oracle Autonomous Database

[comment]: <> (Adapted from https://ol-confluence.us.oracle.com/display/GCN/Documentation+for+Database+Features)

**Prerequisites:**
* An Oracle Cloud Infrastructure (OCI) account.
* The [GCN Database Support](https://marketplace.visualstudio.com/items?itemName=oracle-labs-graalvm.gcn-database-drivers) extension. 
(This adds a **DATABASES** view to the Explorer Panel.)

To create a new connection to an Oracle Autonomous Database, follow the steps below:

1. Expand the **DATABASES** view in the Explorer panel and click **Add Oracle Autonomous DB**.
If there are existing databases in the view, you can skip to step **6**.
2. From the list of compartments, select the compartment that contains your database.
3. From the list of databases, select your database.
4. Enter the username for the database.
5. Enter the password for the database.
The database will be added to the **DATABASES** view in the Explorer panel.
6. Select the database in the view, then right-click. 
Select **Connect to Database** from the menu.

To change the properties of a database connection, select the database in the **DATABASES** view, right-click and then select **Properties** from the menu.
> **Note**: Disconnect from the database before attempting to change its properties. You cannot change the properties of a _connected_ database. 

To select a database as the _Default Connection_, select the database in the **DATABASES** view, right-click and then select **Set as Default Connection** from the menu.

**TODO** : Describe that the password for the DB is stored in the secure platform specific system, keychain on OSX for example, so that you aren't prompted repeatedly to enter passwords.

**TODO** : Show how to manage DB connections.

### Create Entity and Repository Classes From an Existing Database Schema

[comment]: <> (Adapted from https://ol-confluence.us.oracle.com/display/GCN/Documentation+for+Database+Features)

**Prerequisites:**
* You have created a connection to a database with an existing schema. 
(See above.)
* You have selected the database as the _Default Connection_.
(See above.)

To create entity classes, follow these steps:
1. Create a new Micronaut project in VS Code (or open an existing one).
2. Create a new Java package in your project, for example, `com.example.micronaut.entities`.
3. Right-click the package name and select **New From Template...** from the menu.
4. When prompted, select **Micronaut**, then **Micronaut Data Entity Classes from Database**.
5. From the list of tables, select the tables for which you want to create corresponding entities. 
6. Click **Enter**.

To create repository classes, follow these steps:
1. Create a new Micronaut project in VS Code (or open an existing one).
2. Create a new Java package in your project, for example, `com.example.micronaut.repositories`.
3. Right-click the package name and select **New From Template...** from the menu.
4. When prompted, select **Micronaut**, then **Micronaut Data Repository Interfaces from Entity**.
5. From the list of entities, select the entities for which you want to create corresponding repositories. 
6. Click **Enter**.

**TODO** : Show how you can run this locally, talking to a remote DB.

## Extension Settings

The extension contributes the following settings:

* __micronaut.home__ - the optional path to the Micronaut CLI installation -> specify local Micronaut CLI installation to be used in addition to default used https://micronaut.io/launch/, eg. `/usr/me/micronaut-cli-4.0.1`
 ![Micronaut CLI Set](images/micronaut-cli-setting.png)
* __micronaut.showWelcomePage__ - show the Micronaut Tools Page on extension activation when set to True.
* __micronaut.launchUrl__ - Optional Micronaut Launch URL (e.g. 'https://launch.micronaut.io') -> specify additional Micronaut launch service for project creation in addition to default https://micronaut.io/launch/

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