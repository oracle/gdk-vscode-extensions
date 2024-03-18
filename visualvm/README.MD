# VisualVM Integration
[![Visual Studio Marketplace](https://img.shields.io/visual-studio-marketplace/v/oracle-labs-graalvm.visualvm-integration?style=for-the-badge&label=VS%20Marketplace&logo=visual-studio-code)](https://marketplace.visualstudio.com/items?itemName=oracle-labs-graalvm.visualvm-integration)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/oracle-labs-graalvm.visualvm-integration?style=for-the-badge)](https://marketplace.visualstudio.com/items?itemName=oracle-labs-graalvm.visualvm-integration)
[![License](https://img.shields.io/github/license/oracle/gcn-vscode-extensions?style=for-the-badge&logo=upl)](https://github.com/oracle/gcn-vscode-extensions/blob/main/LICENSE.txt)

The extension provides integration of the [VisualVM](https://visualvm.github.io) monitoring and troubleshooting tool with Visual Studio Code (VS Code).

## Features
* Downloading the latest VisualVM version
* Integration with starting an application from the VS Code
  - Application process configured to display its folder name in VisualVM
  - Application process PID detected to invoke VisualVM actions when needed
  - Application process can be automatically opened in VisualVM when started
* Shortcuts to VisualVM actions like Thread dump, Heap dump, Start sampling, and so on, available in a dedicated view in VS Code
* CPU Sampler filter can be automatically configured to include only application classes
* Go to Source action in VisualVM results opens the application source code back in VS Code

## Requirements
These tools are required for the core functionality like selecting a running process and opening it in VisualVM, or invoking VisualVM actions for it:

* VisualVM 2.1+ (we recommend using the latest version of VisualVM)
* Any JDK 8+ to run VisualVM and detect running processes using `jps`

To integrate with an application startup, and to support application classes filter and Go to Source feature, at least one of these extensions must be installed and configured:

* [Language Server for Java by Apache NetBeans](https://marketplace.visualstudio.com/items?itemName=ASF.apache-netbeans-java)
* [Extension Pack for Java](https://marketplace.visualstudio.com/items?itemName=vscjava.vscode-java-pack)

The extension also tightly integrates with the following extensions to provide the best monitoring and profiling experience for special application types:

* [Micronaut Tools](https://marketplace.visualstudio.com/items?itemName=oracle-labs-graalvm.micronaut-tools)
  - VisualVM view can be easily displayed in the Micronaut Tools activity
  - CPU Sampler configured for the selected GCN application subproject (OCI, AWS, GCP)
  - Go to Source configured for the selected GCN application subproject (OCI, AWS, GCP)

## Quick Start
Follow these steps to start using VisualVM with VS Code:

1. Install the **VisualVM Integration** extension.
2. Install **Language Server for Java by Apache NetBeans** or **Extension Pack for Java** (or both).
3. Open your application sources. Make sure it is configured correctly before integrating it with VisualVM.
4. Click **Download Latest VisualVM** in the VisualVM view, and complete the required steps.
5. Invoke the **Configure** action displayed for the *When started node* in the *VisualVM* view, and select **Open Process**.
6. Start the application using the *Run Without Debugging* or *Start Debugging* action.

At this point the application starts, and eventually its process is opened in VisualVM, displayed using its VS Code directory name.

The Go to Source action in various VisualVM views like CPU or Memory Sampler/Profiler results, Heap Viewer, and so on, opens the source code back in VS Code.

## Documentation

<details>
<summary>Configuring VisualVM</summary>

To download the latest VisualVM release from [https://visualvm.github.io](https://visualvm.github.io), use the **Download Latest VisualVM** action. Depending on the host OS, this will either download a ZIP archive or a macOS disk image (.dmg) file. The ZIP archive will be automatically extracted and registered for the extension. The macOS disk image needs to be installed and registered manually (see the next paragraph).

If an existing local VisualVM installation is already available on the system, or after manually installing a macOS disk image, use the *Select Local VisualVM Installation* action and point to the VisualVM installation directory. The extension supports VisualVM 2.1+, or the corresponding GraalVM component (select the GraalVM installation directory). We recommend using the latest version of VisualVM.

To manually register an existing local VisualVM installation, or to configure specific VisualVM installation for the workspace, use the `visualvm-integration.installation.visualvmPath` property to point to the VisualVM installation directory.

Custom VisualVM startup parameters (such as `--userdir`) including VM arguments (such as `-Xmx...`) can be defined using the `visualvm-integration.startup.visualvmParameters` property.

By default, VisualVM runs using a defined/automatically found local JDK (see the Configuring JDK section). To define a custom JDK for running VisualVM, set the `visualvm-integration.startup.useJdkPathForVisualvm` property to `false`, and use the `--jdkhome` VisualVM startup parameter.
</details>

<details>
<summary>Configuring JDK</summary>

The extension uses a JDK for these purposes:

* Running VisualVM (if not disabled, see the Configuring VisualVM section)
* Detecting locally running processes using the `jps` utility, either when starting an application or for a manual process selection
* For configuring the JDK source roots used by the Go to Source feature

Since VisualVM can run and detect processes using any JDK, the JDK should resolve to the instance which actually runs the application, to make sure the Go to Source action works as expected. The extension searches for values of the following properties and environment variables to detect a necessary JDK, in the following order:

* Properties: `netbeans.jdkhome`, `java.jdt.ls.java.home`, `java.home`, `graalvm.home`
* Environment variables: `JDK_HOME`, `JAVA_HOME`

To override the JDK to be used, or to configure a specific JDK for the workspace, use the `visualvm-integration.java.jdkPath` property to point to a local JDK installation directory.
</details>

<details>
<summary>Using VisualVM Actions</summary>

#### Start VisualVM
*Start VisualVM* (action in the VisualVM view toolbar) starts the VisualVM, or brings its window to front if already running.

#### Process Node
*Select Process* shows a list of all running processes available for monitoring, except of those already being monitored.

*Show in VisualVM* opens the currently selected process in VisualVM, and preselects the defined view. Use the `visualvm-integration.behavior.preselectProcessView` property to define the view to be preselected (use `Current` for no change).

*Stop Monitoring* clears the currently selected process, but does not stop the process or its monitoring in the VisualVM tool.

#### When Started Node
*Configure* defines the action to be taken when a new application process is started by VS Code. When configured, the process can be automatically opened in VisualVM, and a preconfigured sampling or flight recording session can be started.

Note: The *When started* node is only displayed if the automatic application process selection is enabled (`visualvm-integration.integration.automaticallySelectProjectProcess` property is set to `true`), and no process has been selected yet, or it has not been selected manually using the *Select Process* action.

#### Thread Dump Node
*Take Thread Dump* takes a thread dump from a monitored process, and selects the corresponding view in VisualVM.

#### Heap Dump Node
*Take Heap Dump* takes a heap dump from a monitored process, and selects the corresponding view in VisualVM.

#### CPU Sampler Node
*Start CPU Sampling* starts a new CPU sampling session for a monitored process, and selects its view in VisualVM. The sampling session settings are defined by the *Filter* and *Sampling rate* subnodes.

*Take Snapshot of Sampler Results* takes a snapshot of the collected data, and selects a corresponding view in VisualVM.

*Stop Sampling* terminates the current sampling session, and selects its view in VisualVM.

#### Memory Sampler Node
*Start Memory Sampling* starts a new memory sampling session for the monitored process, and selects its view in VisualVM. The sampling session settings are defined by the *Sampling rate* subnode.

*Take Snapshot of Sampler Results* takes a snapshot of the collected data, and selects a corresponding view in VisualVM.

*Stop Sampling* terminates the current sampling session, and selects its view in VisualVM.

#### JFR Node
*Start Flight Recording* starts a new flight recording for a monitored process. The flight recorder preset to be used for the recording is defined by the *Settings* subnode.

*Dump Flight Recording Data* dumps the data for the current flight recording, and selects a corresponding view in VisualVM.

*Stop Flight Recording* terminates the current flight recording.
</details>

<details>
<summary>Monitoring Multiple Processes Simultaneously</summary>

While monitoring multiple processes at the same time is not a typical scenario, it is supported by the VisualVM Integration extension.

To start monitoring another process using VisualVM, start another application process using the *Run Without Debugging* or *Start Debugging* action, or use the *VisualVM: Select Process* command from the Command Palette.

Note: The *When started* node is not available for a subsequent monitored process, and its respective *Process* node is removed immediately after monitoring of the process has been stopped.
</details>

<details>
<summary>Troubleshooting</summary>

The VisualVM Integration extension customizes the way VS Code runs an application by adding extra VM arguments to the launch configuration. If the application process fails to start, it may be needed to disable these customizations by setting the following properties to `false`:

* `visualvm-integration.integration.automaticallySelectProjectProcess`
* `visualvm-integration.integration.customizeDisplayNameForProjectProcess`

The extension also controls the VisualVM startup parameters. If the VisualVM fails to start, disable or tweak the following properties:

* `visualvm-integration.startup.visualvmParameters`
* `visualvm-integration.startup.useJdkPathForVisualvm`
* `visualvm-integration.integration.enableGoToSource`

In case VisualVM fails to open source code using the Go to Source action in VS Code, or it opens another VS Code window to display the source code, configure the following property:

* `visualvm-integration.integration.visualStudioCodeParameters`

For detailed analysis of any issues when using the extension, see the *VisualVM Integration* log in the VS Code *Output* view. Additionally, see the logs of any other extensions involved, or the *Extension Host* log.

For VisualVM specific troubleshooting, refer to the [VisualVM Troubleshooting Guide](https://visualvm.github.io/troubleshooting.html).
</details>

## Settings

| Name | Description | Default Value |
|---|---|---|
| `visualvm-integration.java.jdkPath` | Path to a local JDK installation directory (leave empty to find automatically) |  |
| `visualvm-integration.startup.useJdkPathForVisualvm` | Use a defined/automatically found local JDK installation to run VisualVM (not applicable if the selected VisualVM installation is a GraalVM component) | `true` |
| `visualvm-integration.installation.visualvmPath` | Path to a local VisualVM 2.1+ installation directory (we recommend using the latest version of VisualVM) |  |
| `visualvm-integration.startup.visualvmParameters` | Optional parameters for starting VisualVM (`--userdir`, `-J-Xmx`, and so on) |  |
| `visualvm-integration.behavior.visualvmWindowToFront` | Bring a VisualVM window to front when invoked with an action in VisualVM | `true` |
| `visualvm-integration.behavior.preselectProcessView` | Preselected view for a process shown in VisualVM (either the Show in VisualVM action, or the Open Process action when started) | Monitor |
| `visualvm-integration.integration.automaticallySelectProjectProcess` | Automatically select a started application process for monitoring | `true` |
| `visualvm-integration.integration.customizeDisplayNameForProjectProcess` | Configure a started application process to display its folder name in VisualVM | `true` |
| `visualvm-integration.integration.enableGoToSource` | Enable opening source code from VisualVM results in VS Code using the Go to Source action | `true` |
| `visualvm-integration.integration.visualStudioCodeParameters` | Optional parameters for invoking VS Code launcher to open source code from VisualVM (`--user-data-dir`, `--extensions-dir`, and so on) |  |

## Provide Feedback or Seek Help

* [Request a feature](https://github.com/oracle/gcn-vscode-extensions/issues/new?labels=enhancement)
* [File a bug](https://github.com/oracle/gcn-vscode-extensions/issues/new?labels=bug)

## Contributing

To submit a pull request for the VisualVM Integration extension, sign the [Oracle Contributor Agreement](http://www.oracle.com/technetwork/community/oca-486395.html).

Project members with write access to the repository will determine and assign an appropriate [Assignee](https://help.github.com/articles/assigning-issues-and-pull-requests-to-other-github-users/) for the pull request. The assignee will work with the pull request owner to address any issues and then merge the pull request.

## Release Notes

See the [CHANGELOG](CHANGELOG.md)
