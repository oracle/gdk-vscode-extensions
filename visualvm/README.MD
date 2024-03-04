# VisualVM Integration
[![Visual Studio Marketplace](https://img.shields.io/visual-studio-marketplace/v/oracle-labs-graalvm.visualvm-integration?style=for-the-badge&label=VS%20Marketplace&logo=visual-studio-code)](https://marketplace.visualstudio.com/items?itemName=oracle-labs-graalvm.visualvm-integration)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/oracle-labs-graalvm.visualvm-integration?style=for-the-badge)](https://marketplace.visualstudio.com/items?itemName=oracle-labs-graalvm.visualvm-integration)
[![License](https://img.shields.io/github/license/oracle/gcn-vscode-extensions?style=for-the-badge&logo=upl)](https://github.com/oracle/gcn-vscode-extensions/blob/main/LICENSE.txt)

Provides integration of the [VisualVM](https://visualvm.github.io) monitoring and troubleshooting tool with the Visual Studio Code.

## Features
* Download of the latest VisualVM release
* Integration with starting a project from the Visual Studio Code
  - Project process configured to display its folder name in VisualVM
  - Project process PID detected to invoke VisualVM actions when needed
  - Project process can be automatically opened in VisualVM when started
* Shortcuts to VisualVM actions like Thread dump, Heap dump, Start sampling, etc. available in a dedicated view in Visual Studio Code
* CPU Sampler filter can be automatically configured to include only project classes
* Go to Source action in VisualVM results opens the source code back in Visual Studio Code

## Requirements
These tools are required for the core functionality like selecting a running process and opening it in VisualVM, or invoking VisualVM actions for it:

* VisualVM 2.1+ (using the latest VisualVM is highly recommended)
* Any JDK 8+ to run VisualVM and detect running processes using `jps`

To integrate with project startup, and to support project classes filter and Go to Source functionality, at least one of these extensions must be installed and configured:

* [Language Server for Java by Apache NetBeans](https://marketplace.visualstudio.com/items?itemName=ASF.apache-netbeans-java)
* [Extension Pack for Java](https://marketplace.visualstudio.com/items?itemName=vscjava.vscode-java-pack)

The extension also tightly integrates with the following extensions to provide the best monitoring and profiling experience for special project types:

* [Micronaut Tools](https://marketplace.visualstudio.com/items?itemName=oracle-labs-graalvm.micronaut-tools)
  - VisualVM view can be easily displayed in the Micronaut Tools activity
  - CPU Sampler configured for the selected GCN application subproject
  - Go to Source configured for the selected GCN application subproject

## Quick Start
Follow these steps to start using VisualVM with Visual Studio Code:

1. Install the *VisualVM Integration* extension
2. Install *Language Server for Java by Apache NetBeans* or *Extension Pack for Java* (or both)
3. Open your project configured to run with the above extensions
4. Click the *Download Latest VisualVM* button in the *VisualVM* view, and complete the required steps
5. Invoke the *Configure* action displayed for the *When started node* in the *VisualVM* view, and select the *Open Process* option
6. Start the project using the *Run Without Debugging* or *Start Debugging* action

At this point the project should start, and eventually its process should be opened in VisualVM, displayed using its Visual Studio Code folder name.

The Go to Source action in various VisualVM views like CPU or Memory Sampler/Profiler results, Heap Viewer, etc., should open the source code back in the Visual Studio Code.

## Documentation

<details>
<summary>Configuring VisualVM</summary>

To download the latest VisualVM release from [https://visualvm.github.io](https://visualvm.github.io), use the *Download Latest VisualVM* action. Depending on the host OS, this will either download a .zip archive or a macOS .dmg disk image. The .zip archive will be automatically extracted and registered for the extension. The .dmg disk image needs to be installed and registered manually (see the next paragraph).

If an existing local VisualVM installation is already available on the system, or after manually installing a macOS disk image, use the *Select Local VisualVM Installation* action and point to the VisualVM installation folder. The extension supports VisualVM 2.1+, or the corresponding GraalVM component (select the GraalVM installation folder). Using the latest standalone VisualVM is highly recommended.

To manually register an existing local VisualVM installation, or to configure specific VisualVM installation for the workspace, use the `visualvm-integration.installation.visualvmPath` property to point to the VisualVM installation folder.

Custom VisualVM startup parameters (like `--userdir`) incl. VM arguments (like `-Xmx...`) can be defined using the `visualvm-integration.startup.visualvmParameters` property.

By default, VisualVM runs using the defined/automatically found local JDK (see the Configuring JDK section). To define a custom JDK for running VisualVM, set the `visualvm-integration.startup.useJdkPathForVisualvm` property to `false`, and use the `--jdkhome` VisualVM startup parameter.
</details>

<details>
<summary>Configuring JDK</summary>

The extension uses a JDK for these purposes:

* Running VisualVM (if not disabled, see the Configuring VisualVM section)
* Detecting locally running processes using the `jps` utility, either when starting a project, or for manual process selection
* For configuring the JDK source roots for the Go to Source functionality

Since VisualVM can run and detect processes using virtually any JDK, the JDK should resolve to the instance which actually runs the project, to make sure the Go to Source action works as expected. The extension searches for values of these properties and environment variables to detect the JDK to be used, in the following order:

* Properties: `netbeans.jdkhome`, `java.jdt.ls.java.home`, `java.home`, `graalvm.home`
* Environment variables: `JDK_HOME`, `JAVA_HOME`

To override the JDK to be used, or to configure specific JDK for the workspace, use the `visualvm-integration.java.jdkPath` property to point to a local JDK installation folder.
</details>

<details>
<summary>Using VisualVM Actions</summary>

#### Start VisualVM Action
*Start VisualVM* action in the VisualVM view toolbar starts the VisualVM, or brings its window to front if already running.

#### Process Node
*Select Process* action shows a list of all running processes available for monitoring, except of those already being monitored.

*Show in VisualVM* action opens the currently selected process in VisualVM, and preselects the defined view. Use the `visualvm-integration.behavior.preselectProcessView` property to define the view to be preselected (`Current` for no change).

*Stop Monitoring* action clears the currently selected process. Technically it doesn't stop the process or its monitoring in the VisualVM tool.

#### When Started Node
*Configure* action defines the action to be taken when a new project process is started by the Visual Studio Code. When configured, the process can be automatically opened in VisualVM, and a preconfigured sampling or flight recording session can be started.

Note: The *When started* node is only displayed if the automatic project process selection is enabled (`visualvm-integration.integration.automaticallySelectProjectProcess` property is set to `true`), and no process has been selected yet, or it has not been selected manually using the *Select Process* action.

#### Thread Dump Node
*Take Thread Dump* action takes a thread dump from the monitored process, and selects the corresponding view in VisualVM.

#### Heap Dump Node
*Take Heap Dump* action takes a heap dump from the monitored process, and selects the corresponding view in VisualVM.

#### CPU Sampler Node
*Start CPU Sampling* action starts a new CPU sampling session for the monitored process, and selects its view in VisualVM. The sampling session settings are defined by the subnodes *Filter* and *Sampling rate*.

*Take Snapshot of Sampler Results* action takes a snaphshot of the currently collected data, and selects the corresponding view in VisualVM.

*Stop Sampling* action terminates the current sampling session, and selects its view in VisualVM.

#### Memory Sampler Node
*Start Memory Sampling* action starts a new memory sampling session for the monitored process, and selects its view in VisualVM. The sampling session settings are defined by the subnode *Sampling rate*.

*Take Snapshot of Sampler Results* action takes a snaphshot of the currently collected data, and selects the corresponding view in VisualVM.

*Stop Sampling* action terminates the current sampling session, and selects its view in VisualVM.

#### JFR Node
*Start Flight Recording* action starts a new flight recording for the monitored process. The flight recorder preset to be used for the recording is defined by the subnode *Settings*.

*Dump Flight Recording Data* action dumps the data for the current flight recording, and selects the corresponding view in VisualVM.

*Stop Flight Recording* action terminates the current flight recording.
</details>

<details>
<summary>Monitoring Multiple Processes Simultaneously</summary>

While monitoring multiple processes at the same time is not a typical scenario, it is supported by the VisualVM Integration extension.

To start monitoring another process using VisualVM, start another project process using the *Run Without Debugging* or *Start Debugging* action, or use the *VisualVM: Select Process* command from the Command Palette.

Note: The *When started* node is not available for the subsequent monitored processes, and their respective *Process* node is removed immediately after monitoring of the process has been stopped.
</details>

<details>
<summary>Troubleshooting</summary>

The VisualVM Integration extension customizes the way Visual Studio Code starts projects by adding extra VM arguments to the used launch configuration. If the project process fails to start, it may be needed to disable these customizations by setting the following properties to `false`:

* `visualvm-integration.integration.automaticallySelectProjectProcess`
* `visualvm-integration.integration.customizeDisplayNameForProjectProcess`

The extension also controls the VisualVM startup parameters. If the VisualVM fails to start, you may want to disable or tweak the following properties:

* `visualvm-integration.startup.visualvmParameters`
* `visualvm-integration.startup.useJdkPathForVisualvm`
* `visualvm-integration.integration.enableGoToSource`

In case the VisualVM fails to open source code using the Go to Source action back in the Visual Studio Code, or it opens another Visual Studio Code window to display the source code, you may want to tweak the following property:

* `visualvm-integration.integration.visualStudioCodeParameters`

For detailed analysis of any issues when using the extension, please see the *VisualVM Integration* log in the Visual Studio Code *Output* view. You may also want to see logs of any other extensions involved, or the *Extension Host* log.

For VisualVM specific troubleshooting, please refer to the [VisualVM Troubleshooting Guide](https://visualvm.github.io/troubleshooting.html).
</details>

## Settings

| Name | Description | Default Value |
|---|---|---|
| `visualvm-integration.java.jdkPath` | Path to a local JDK installation folder (leave empty to find automatically) |  |
| `visualvm-integration.startup.useJdkPathForVisualvm` | Use defined/automatically found local JDK installation to run VisualVM (not applicable if the selected VisualVM installation is a GraalVM component) | `true` |
| `visualvm-integration.installation.visualvmPath` | Path to a local VisualVM 2.1+ installation folder (using the latest VisualVM is highly recommended) |  |
| `visualvm-integration.startup.visualvmParameters` | Optional parameters for starting VisualVM (`--userdir`, `-J-Xmx`, etc.) |  |
| `visualvm-integration.behavior.visualvmWindowToFront` | Bring VisualVM window to front when invoked an action in VisualVM | `true` |
| `visualvm-integration.behavior.preselectProcessView` | Preselected view for a process shown in VisualVM (either Show in VisualVM action, or Open Process option in When started) | Monitor |
| `visualvm-integration.integration.automaticallySelectProjectProcess` | Automatically select started project process for monitoring | `true` |
| `visualvm-integration.integration.customizeDisplayNameForProjectProcess` | Configure started project process to display its folder name in VisualVM | `true` |
| `visualvm-integration.integration.enableGoToSource` | Enable opening sources from VisualVM results in Visual Studio Code using the Go to Source action | `true` |
| `visualvm-integration.integration.visualStudioCodeParameters` | Optional parameters for invoking Visual Studio Code launcher to open sources from VisualVM (`--user-data-dir`, `--extensions-dir`, etc.) |  |

## Provide Feedback or Seek Help

* [Request a feature](https://github.com/oracle/gcn-vscode-extensions/issues/new?labels=enhancement)
* [File a bug](https://github.com/oracle/gcn-vscode-extensions/issues/new?labels=bug)

## Contributing

To submit a pull request for the VisualVM Integration extension, you need to sign the [Oracle Contributor Agreement](http://www.oracle.com/technetwork/community/oca-486395.html).

Project members with write access to the repository will determine and assign an appropriate [Assignee](https://help.github.com/articles/assigning-issues-and-pull-requests-to-other-github-users/) for the pull request. The assignee will work with the pull request owner to address any issues and then merge the pull request.

## Release Notes

See the [CHANGELOG](CHANGELOG.md)
