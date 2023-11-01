# Micronaut® Tools
*** Technology Preview ***

## Overview
Micronaut Tools is a powerful extension for using [GraalVM](https://www.oracle.com/java/graalvm/) to develop [Micronaut framework](https://micronaut.io/) and [Graal Cloud Native](https://graal.cloud/) applications within VS Code.

It is recommended to install [Graal Cloud Native Extension Pack](https://marketplace.visualstudio.com/items?itemName=oracle-labs-graalvm.graal-cloud-native-pack) which contains this extension and others.

## Features
* [View Suggested Code Completions](#view-suggested-code-completions)
* [Navigate Micronaut Source Code](#navigate-micronaut-source-code)
* [View Defined Beans and Endpoints](#view-defined-beans-and-endpoints)
* [Compose REST Queries](#compose-rest-queries)
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
- (Optional.) The A Java Development Kit (JDK) installation (JDK 17 or later).
[Oracle GraalVM](https://www.oracle.com/java/graalvm/) is a fast and efficient JDK from Oracle.

## Installing the Extension
Click **Install** on the banner above, or from the Extensions side bar in VS Code, by searching for "Micronaut Tools".

You can also find the extension listed on the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=oracle-labs-graalvm.micronaut).

The Micronaut Tools page opens as soon as the extension is installed.
You can also open this page using the Command Palette command **Micronaut Tools: Show Micronaut Tools Page**.

> Note: This extension is part of the [Graal Cloud Native Extensions Pack](https://marketplace.visualstudio.com/items?itemName=oracle-labs-graalvm.graal-cloud-native-pack). We recommend you install the Graal Cloud Native Extensions Pack as it provides additional extensions for Micronaut development, including the [Micronaut Launch](https://marketplace.visualstudio.com/items?itemName=oracle-labs-graalvm.micronaut) extension.

## Usage

### View Suggested Code Completions

The extension suggests code completions for your YAML configuration files.
(The available configuration properties and their values are collected by scanning your source code and the Micronaut libraries.)

The extension also provides code completion for your Java source code via the [Extension Pack for Java from Microsoft](https://marketplace.visualstudio.com/items?itemName=vscjava.vscode-java-pack).
This gives you all the IDE features that you would expect from [IntelliSense](https://code.visualstudio.com/docs/editor/intellisense), as well as automatically highlighting errors as you type.

### Navigate Micronaut Source Code

You can easily navigate to Micronaut-specific elements of your source code via the **Go to Symbol in Workspace** command.

Run the **Go to Symbol in Workspace** command using Ctrl+T (Cmd+T on macOS) and enter the prefix:
* `@/` to show all defined request mappings
* `@+` to show all defined beans

![Navigate Micronaut Source Code](images/micronaut-navigation.png)

### View Defined Beans and Endpoints
All beans and request mappings defined by a Micronaut or GCN application can be displayed in the Beans and Endpoints views of the Micronaut Tools activity.

The items of these views can be searched/filtered using a dedicated action available in the view captions, or invoked using the Ctrl+F shortcut.

Clicking a node in one of these views navigates to the corresponding source code similar to the Go to Symbol in Workspace command. This can be also invoked using a dedicated context menu action:
* **Go to Symbol** to open the bean or request mapping source code

Request mapping nodes in the Endpoints view provide two additional actions:
* **Open in Browser** to open the GET endpoint in a web browser
* **Compose REST Query** to insert the corresponding query into a dedicated text document. See the following section Compose REST Queries for details.

Similar actions are available also in the code editor as Code Lens actions.

For endpoints containing parameters a dialog is opened to provide concrete values before opening in a browser or generating a REST query. Tip: type a parameter value and submit by Enter to move to another parameter.

The base address of the running Micronaut or GCN application is by default configured to `http://localhost:8080` and can be customized using the Edit Target Application Address action in the Endpoints view caption or next to a folder node in case multiple folders are opened in the workspace.

![Beans and Endpoints views](images/beans_endpoints_view.png)


### Compose REST Queries
To easily debug and test the application REST API, the Endpoints view provides a smooth integration with a third party extension [REST Client](https://marketplace.visualstudio.com/items?itemName=humao.rest-client).

To start composing a REST query, invoke the Compose REST Query action for an endpoint either from the Endpoints view or using the corresponding Code Lens action in code editor. A dedicated text document is opened and the corresponding query is inserted. Use the REST Client features to invoke and process the query.

Note: If the REST Client extension is not installed when invoking the Compose REST Query action, a notification is displayed offering to quick install it.

![Compose REST Query](images/compose_rest_query.png)

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
A configuration that will be labeled with "Continuous" will be created for your Micronaut application main class(es), similar to this example:
![Select Launch Configuration to Run Micronaut Application in Continuous Mode](images/run-continuous-config.png)

Select the newly added configuration in the **Run and Debug** view, and finally click **Run**.

### Debug Your Micronaut Application

The easiest way to run your Micronaut application is to view the `Application` class in the editor and click **Debug** above the `main()` method, as shown here.

![Debug Micronaut Application](images/debug_main_method.png)

Alternatively, select **Start Debugging** from the **Run** menu.

### Package Your Micronaut Application

To package your application as a runnable JAR file, follow these steps:

1. Select **Command Palette** from the **View** menu.
Enter "Micronaut Tools" and invoke the **Micronaut Tools: Build...** command.

2. Select the **compile** build goal from a list of available goals.

    ![Micronaut Build Commands](images/micronaut-build-commands.png)

3. When the compilation completes, invoke the **Micronaut Tools: Build...** command again.
This time, select the **package** goal, which will package your application into a JAR file.

### Create a Native Executable from Your Micronaut Application

If you have installed Oracle GraalVM, you can use GraalVM Native Image to create a native executable from your application.
GraalVM Native Image creates an executable file with all the application classes, dependent library classes, dependent JDK classes, and a snapshot of the application heap. 
Whilst building a native executable can take some time, the benefits include a dramatic reduction in startup time and reduced overall memory consumption.

> **Note**: The time to build an executable depends on application size and complexity.

To create a native executable, follow these steps:

1. Select **Command Palette** from the **View** menu.
Enter "Micronaut Tools" and invoke the **Micronaut Tools: Build...** command.

2. Select the **compile** build goal from a list of available goals.

    ![Micronaut Build Commands](images/micronaut-build-commands.png)

3. When the compilation completes, invoke the **Micronaut Tools: Build...** command again.
This time, select the **nativeImage** goal, which creates a native executable from your application.

    * If your application is built with Maven, the goal runs the command `mvnw package -Dpackaging=native-image`.
    The resulting native executable will in the _target/native-image/_ directory.

    * If your application is built with Gradle, the goal runs the command `gradlew nativeCompile`.
    The resulting native executable will in the _build/native/nativeCompile/_ directory.

To run your Micronaut application as a native executable, open a terminal by selecting **New Terminal** from the **Terminal** menu, then run the following command: 

* If you used Maven: `./target/<executable-name>`
* If you used Gradle: `./build/native/nativeCompile/<executable-name>`

For more information, see the [Micronaut documentation](https://guides.micronaut.io/latest/micronaut-creating-first-graal-app.html).

> **Note**: If you are using VS Code on the Windows platform, invoke the **Micronaut Tools: Build Native Image** command from the Command Palette. 

### Build a Container Image and Deploy Your Micronaut Application to a Container Registry

You can build a container image of your Micronaut application, or create a container image of an executable created by GraalVM Native Image.
You can then deploy the container image.

To build and deploy a container image of your application, follow these steps:

1. Select **Command Palette** from the **View** menu.
Enter "Micronaut Tools" and invoke the **Micronaut Tools: Deploy...** command.

2. Select select one of the goals from the list:
    - To deploy a containerized Micronaut application, select the **dockerPush** goal.
    - To deploy a containerized native executable, select the **dockerPushNative** goal.

To configure your application's container registry, see the documentation for [Micronaut Maven Plugin](https://micronaut-projects.github.io/micronaut-maven-plugin/latest/)/[Micronaut Gradle Plugin](https://micronaut-projects.github.io/micronaut-gradle-plugin/latest/). 

### Deploy Your Application to Oracle Cloud Infrastructure

**Prerequisites:**
* An Oracle Cloud Infrastructure (OCI) account.
* The [OCI DevOps Tools extension](https://marketplace.visualstudio.com/items?itemName=oracle-labs-graalvm.oci-devops) (part of the [Graal Cloud Native Extension Pack](https://marketplace.visualstudio.com/items?itemName=oracle-labs-graalvm.graal-cloud-native-pack)).

The OCI DevOps Tools extension provisions build and deployment pipelines for:
* An OCI native executable container: a containerized native executable
* An OCI Java container: a containerized Micronaut application

It can also provision a cluster to run your container on Oracle's [Container Engine for Kubernetes](https://docs.oracle.com/iaas/Content/ContEng/Concepts/contengoverview.htm).
For more information about using the OCI DevOps Tools Extension, see [Using OCI DevOps Tools Extensions in VS Code](https://www.graal.cloud/gcn/get-started/using-gcn-vscode-tools/).

### Connect to an Oracle Autonomous Database

**Prerequisites:**
* An Oracle Cloud Infrastructure (OCI) account.

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

Database Password is stored in OS specific safe storage - macOS keychain, KDE Wallet, GNOME/Keyring, Windows Data Protection API.
For Debug / Run of micronaut application, VSCode creates temporary file with Micronaut properties incl. Database Username and Password.
This temporary file is readable only by user running VSCode and is deleted as soon as debugging session ends.

### Create Entity and Repository Classes From an Existing Database Schema

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
5. Choose if **Repository Interfaces** should to be based on **CRUD**, or **Pageable**. The default is **CRUD**.
6. From the list of entities, select the entities for which you want to create corresponding repositories.
7. Click **Enter**.

## Extension Settings

The extension contributes the following settings:

* __micronaut-tools.showWelcomePage__ - when set to `true` (default), show the Micronaut Tools page on extension activation.
* __micronaut-tools.jdt.buildsystemExecution__ - if set to `true` (default), enables enhanced Run support for Micronaut applications.
* __micronaut-tools.targetApplicationAddress__ - default Micronaut or Graal Cloud Native application address, by default configured to `http://localhost:8080` (to be customized in `settings.json` in project folder).

## Micronaut Commands

Invoke the Micronaut commands from the Command Palette, then search for "Micronaut Tools".
To open the Command Palette, select **Command Palette** from the **View** menu.

The following commands are available for Micronaut project development:

* **Micronaut Tools: Show Micronaut Tools Page**: show the Micronaut Tools page with basic information describing this extension
* **Micronaut Tools: Build Native Executable**: build a native executable of your application using GraalVM native image
* **Micronaut Tools: Build...**: offers several the most important build tasks/targets wrapped as predefined commands for your Micronaut project
* **Micronaut Tools: Deploy...**: deploys either a JVM container or native executable container into Container registry.
Container registry MUST be configured in docker toolchain on the machine from which deployment is initiated.
See your docker tools documentation.
* **Micronaut Tools: Create Kubernetes Deployment Resource**: create a Kubernetes deployment resource for your application
* **Micronaut Tools: Create Kubernetes Service Resource**: create a Kubernetes service resource for your application
* **Micronaut Tools: Deploy to Kubernetes**: deploy to running Kubernetes services. The service must be configured in Kubernetes tools (kubectl) on the machine from which deployment is initiated.
See your Kubernetes tools documentation.
* **Micronaut Tools: Run in Kubernetes**:  run already deployed application in Kubernetes service.
Command performs port forwarding at the end and running application can be accessed from browser on your machine.
* **Micronaut Tools: Edit Target Application Address**: Customization of the base address of the running Micronaut or GCN application, default is `http://localhost:8080`
* **Micronaut Tools: Search/Filter Beans**: Search or filter the items of the Beans view
* **Micronaut Tools: Search/Filter Endpoints**:  Search or filter the items of the Endpoints view

## Troubleshooting
This extension modifies Run for **Java** environment so that the application is launched using the build system (Gradle, Maven). In some scenarios the support may not support all customizations necessary for the user project and has to be turned off.

To enable or disable the enhanced Run feature, navigate to `File - Preferences - Settings`, locate `Micronaut Tools` extension section and turn on/off the `Use build system to run or debug applications`. The relevant setting (in JSON format) is `micronaut-tools.buildsystemExecution`

Apache NetBeans Language Server for Java does not work on Linux and macOS when VSCode extensions directory contains space in path, e.g. `/User/great code/.vscode/extensions`. This extension depends on Apache NetBeans Lang Server. Extensions directory is where all VSCode extensions are installed. Default location is:
* Windows `%USERPROFILE%\.vscode\extensions`
* macOS `~/.vscode/extensions`
* Linux `~/.vscode/extensions`

This location can be changed to path without space:
* Permanently by setting environment variable `VSCODE_EXTENSIONS` for OS shell (bash, zsh, sh,...) modifying corresponding profile file (`.bash_profile`, `.zshrc`,...). Or
* Temporarily by launching VSCode from command line with switch `--extensions-dir`, e.g. `$ code --extensions-dir "/User/code_user/extensions_dir"`
* It cannot be changed in VSCode Settings.

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
