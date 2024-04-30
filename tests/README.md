# Proxy setup

In case of network behind the proxy, the following environment variables *must be set*:

- `http_proxy` - URL to proxy, incl. protocol and port, e.g. http://proxy.acme.com:80
- `https_proxy` - URL to proxy for https protocol
- `no_proxy`   - URL patterns that must not use proxy. In particular, corporate/internal NPM module repositories must be enumerated in no_proxy env var.

Internally (in package.json), the globalAgent/bootstrap is used with `GLOBAL_AGENT_{HTTP,NO}_PROXY`
set to the appropriate env variable. The environment variables `http(s)_proxy` and `no_proxy` are read by npm package manager. You can use any working proxy, but you **must replace the proxy host in all the configurations mentioned below**.

The recommended settings are:
```
http_proxy=http://proxy.acme.com:80
https_proxy=http://proxy.acme.com:80
no_proxy=127.0.0.1,127.0.0.0/8,localhost,...
```

The test fixture projects use *gradle* or *maven* build system. If behind a proxy, you *must update your build tool configuration*. These build tools
purposely **do not read** environment variables and follows stricly their configuration files.

## Maven
Maven stores its proxy setting in `~/.m2/settings.xml`. The recommended setting is:
```
<settings>
    <proxies>
        <proxy>
            <id>netbeans-default-proxy</id>
            <active>true</active>
            <protocol>http</protocol>
            <host>proxy.acme.com</host>
            <port>80</port>
            <nonProxyHosts>127.0.0.1|127.0.0.0/8|localhost|...<nonProxyHosts> 
        </proxy>
    </proxies>
</settings>
```
## Gradle
Settings are kept in `~/.gradle/gradle.properties`.
```
systemProp.http.proxyHost=proxy.acme.com
systemProp.http.proxyHost=proxy.acme.com
systemProp.https.proxyPort=80
systemProp.http.nonProxyHosts=127.0.0.1|127.0.0.0/8|localhost|...
systemProp.https.nonProxyHosts=127.0.0.1|127.0.0.0/8|localhost|...
```
Use the same proxy specification as in `http_proxy` environment variable. 

## Switching between VPN and public network
When switching on/off VPN, the following has to be set or adjusted. **Failure to adjust network settings as described may lead to timeouts, uncompilable projects, inability to build test projects, failures of Gradle daemon**.
- `http(s)_proxy`, `no_proxy` environment variables
- `npm_config_registry` NPM registry location
- `gradle` and `maven` proxy configuration
 - for Maven, it is sufficient to turn the `<enabled>` element to `false`
 - for Gradle, the properties must be removed or commented out; it is recommended to keep two copies of gradle settings, one for VPN and other for public network.
 - **all** gradle daemon **must be killed/terminated** as they only read proxy settings at startup. Failing to do so on network switch may cause gradle operations to stall or time out.

# Environment variables and vscode settings

## Mandatory variables and configuration

You **must configure custom SSH options** in `.ssh/config` and host key in `.ssh/known_hosts`. It is sufficient to run `Create OCI project` from the `oci-devops` extension, it will set up the SSH on your machine appropriately.

Since the compartment ID and paths cannot be stored in GIT for everyone, the `launch.json` launch configuration references your vscode's settings. You **must set up** these vscode user settings (in your user or workspace `settings.json`):
- `gcn.test.compartmentOCID` - OCID of your compartment
- `gcn.test.compartmentName` - name of your compartment, including parent compartments, as a path. i.e. `myorg/My_PersonalCompartment`.
- `gcn.test.nodePath` - path to the `node` executable on your machine

You **must** customize your vscode settings:
- `gcn.test.jenkinsBuilders`: set to semicolon (`;`) separated list of Jenkins JSON artifact descriptors.

You may define the environment variables in vsode's Preferences > settings for `Integrated Terminal`, e.g. `terminal.integrated.env.linux` or `terminal.integrated.env.windows`, depending on your system. You may also create scripts that set up the environment for you.

## Customizing Launch configurations
As the `launch.json` are versioned in GIT, it is advised to create a workspace file (Save as workspace) and **copy the launch configuration** to the workspace file. You may customize launch configuration in your workspace file without polluting GIT with your custom local changes. You may also set vscode settings at the workspace level.

## Recognized environment variables
Several environment variables bind the tests to appropriate local or online resources; their location depends on your environment and computer setup.

| Variable | Syntax | Description |
| -------- | ------ | ----------- |
| `TEST_EXTENSION_SOURCE` | marketplace / anything | marketplace will force all extension installations form the Vscode Marketplace. Only useful to test released artifacts |
| `TEST_JENKINS_BUILDERS` |  semicolon (`;`) separated list of Jenkins JSON resources | JSON resources that describe build artifacts, such as `https://ci-builds.apache.org/job/Netbeans/job/netbeans-vscode/lastStableBuild/api/json`. These resources will be fetched and the referenced artifacts downloaded into `downloadedExtensions`.|
| `TEST_EXTENSION_DOWNLOADS` |  list of glob patterns separated by OS path separator | either VSIX files or directories that contain VSIX files. Necessary extensions are located primarily here. These extensions have priority over `TEST_JENKINS_BUILDERS`. |
| `TEST_OCI_CONFIG_PATH` | path | Path to OCI config file, default to `~/.oci/config` |
| `TEST_OCI_PROFILE` | string | Name of the OCI pofile, case-sensitive, defaults to `DEFAULT` |
| `TEST_GIT_USER_EMAIL` | string | E-mail of the user to use for `git` commits from |
| `TEST_SSH_KEYFILE` | path | Path to the SSH private key file to use when accessing OCI GIT |
| `TEST_SSH_USERNAME` | email@tenancy | username to use with OCI GIT services. |
| `TEST_SKIP_EXTENSIONS` | non-empty/empty | If defined, skips download and installation of extensions |
| `TEST_DEPLOY_COMPARTMENT_OCID` | OCID | OCID of the compartment to store data |
| `TEST_DEPLOY_PROJECT_NAME` | string | Name of the OCI project for deployment. Useful for single-project testing |
| `TEST_VSCODE_EXTENSION` | true / anything | Enables some fallbacks and special handling in extension code during testing |
| `TEST_SKIP_EXTENSIONS` | anything / undefined | Skips extension installation entirely. Vscode runs as it is installed in `.vscode-test`. |

## Recognized vscode settings
Launch configurations must define values of environment variables for the executed processes, but the shared configurations **must not** contain credentials, local paths or local network resources. Instead, launch configurations
refer to vscode configuration variables, that should be set in either *User Settings (JSON)* or *Workspace Settings (JSON)*:

| Setting name | Mandatory | Description |
| ------------ | --------- | ----------- |
| `gcn.test.compartmentOCID` |  Yes | OCID of your compartment. Tests will publish / delete resources there |
| `gcn.test.compartmentName` |  Yes | `name of your compartment, including parent compartments, as a path. i.e. `myorg/My_PersonalCompartment`. |
| `gcn.test.nodePath` | Yes | path to the `node` executable on your machine |
| `gcn.test.ssh.userName` | - | Custom OCI SSH login username, in form {email}@{tenancy} |
| `gcn.test.extensionDownloads` | - | Glob paths to VSIX files or folders containing VSIX files. In vscode settings (shared between projects), use absolute paths. |
| `gcn.test.jenkinsBuilders` | - | URL of Jenkins build JSON resources, separated by semicolon (`;`) |
| `gcn.test.clean.regexp` | Yes | regexp to select projects to clean by the OCI cleaner |

# Prepare for testing
Make sure that all necessary environment variables, especially proxies are defined in the terminal.  **Important**: Check if you can access public NPM registry, or you need to set up `npm` to work with e.g. a corporate NPM registry. You need access to NPM registry for the following setup steps, as well as access to **all** extension builders. Check your network and NPM configuration.

Ensure that all necessary npm modules are installed. Run
- `npm install`
to update the local node_modules module cache, if any changes were pulled for `package.json`.

You need to compile the extensions itself, and the test code before launching the tests.
- `npm run dependency-compile`
- `npm run compile`

## Extension locations
The tests download vscode and vscode extensions. Extensions can be downloaded from **marketplace**, from **jenkins builders** or from local folders:
- if `TEST_EXTENSION_SOURCE` environment variable is set to `marketplace`, marketplace extensions are installed. This is only useful to test our relases.
- `TEST_JENKINS_BUILDERS` lists JSON resources of jenkins builders that will be used to collect locations to download the extensions from. An example would be `https://ci-builds.apache.org/job/Netbeans/job/netbeans-vscode/lastStableBuild/api/json`. More URLs can be specified, separated by ';'.
- `TEST_EXTENSION_DOWNLOADS` lists patterns that are globbed and produce files or folders (their contents are used). Files with vsix extensions are inspected for known extension names, most current version is used. A local file for an extension always override remote file acquired from `TEST_JENKINS_BUILDERS`

**Important**: if a required extension is not found in `TEST_JENKINS_BUILDERS` or `TEST_EXTENSION_DOWNLOADS`, it will be installed from the Marketplace. 

For local testing, it is recommended to set `TEST_EXTENSION_DOWNLOADS` to `root-of-vscode-extensions-project/*/`, which should find all locally built VSIXes. 

## Local extensions build
If you intend to test local build of extensions, you need to run
- `npm run prebuild`
- `npm run build`
in the vscode-extensions root directory to build all the `vsix` extensions. 

## Extension installation
The tests can set up and install vscode extensions. The vscode installation is set up in `.vscode-test` subdirectory. Extensions are installed from either
the marketplace, from local directories or Jenkins builders. 

## Installing vscode extensions
You must prepare the `vscode` installation before creating test data or running tests, including necessary extensions:
- if using local extension builds, set up `TEST_EXTENSION_DOWNLOADS` so it points to your built VSIXes, i.e. `/path/to/vscode-extensions/*/` (select all
subdirectories of the `vscode-extensions` that will be searched for vsixes)
- if testing **released** artifact, set `TEST_EXTENSION_SOURCE` to `marketplace`
- if testing extensions build by Jenkins, set `TEST_JENKINS_BUILDERS` appropriately
- execute `npm run prepare-vscode` to install vscode and download+install extensions.

Once environment variables `TEST_JENKINS_BUILDERS` and/or `TEST_EXTENSION_DOWNLOADS` are defined, you can run
- `npm run prepare-vscode`
to download and install the extensions into vscode instance. Running `npm run test` or `npm run test-ui` will NOT automatically download and install necessary extensions.

## Generate test data
You need to `generate` test data projects for testing:
- `npm run generate`

Finally, you need to install necessary extensions
- `npm run prepare-tests`

# Test execution scenarios

## Test suite with multiple projects
The `tests` project contains test suite that can run against multiple projects. Because of how `vscode` container works, each project runs in its separate
`vscode` process. Debugging of test code or extension code is **not possible** in this scenario - if you run this testsuite from `vscode` UI, you can only
debug the testsuite's setup / wrapper code that prepares data and launches `vscode` with tests.

The testsuite runs in a separate installation of `vscode`, which is downloaded and set up in `tests/.vscode-test` directory. Extensions, user data and settings are separated from the development vscode environment.

## Run the tests from the CLI
Follow the procedure of setting up environment variables for extension locations. Then execute
- `npm run test`
The test bootstrap will download a separate installation of vscode into `vscode-test` directory. The testing environment will use a **separate** extensions dir (`.vscode-test/extensions`) and user dir (`.vscode-test/user-data`). The tested vscode installation is completely separated from the development one.

It is possible to run specific test using a glob pattern matching whole file name of the test passed as argument after the task: `npm run test **sometestname**`. The parameter is a *glob pattern* that should select one or more compiler (`*.js`) test files to execute; for example `**/adm/*.test.js`.

**Note:** During the very first run, prompts may appear to add the OCI host to `.ssh/known_hosts` and to `.ssh/config` - test execution will stop until you confirm this. These prompts can be disabled by setting appropriate environment variables (see Troubleshooting)

## Run UI tests from the CLI
UI tests allow for interactive extension testing from within vscode UI itself by controlling vscode with a chrome webdriver. Running `npm run test-ui` will start the tests. First run will download the latest vscode instance and chrome webdrive into `./test-resources` folder. Executing environment will share currently installed extensions.

It is possible to run specific test using a glob pattern matching whole file name of the test passed as argument after the task: `npm run test-ui **sometestname**`

## Run multiple project suite from vscode UI
First make sure that vscode and the extensions are installed. You need to do the same steps as outlined in [Prepare for testing](#Prepare-for-testing):
1. `npm run dependency-compile`
2. `npm run compile`
3. `npm run prepare-vscode`
4. `npm run generate`
5. `npm run prepare-test`

There are preconfigured launch targets: 
- `Prepare tests`, which just executes the above sequence for you
- `Run API tests`
- `Run UI tests`

You can set location(s) of your locally build extensions to `gcn.test.extensionDownloads` vscode setting, for example `{/path/to/vscode-extensions}/*/`, will include all `vsix` files built in this project. The launch configurations will pass `gcn.test.extensionDownloads` and `gcn.test.jenkinsBuilders` in appropriate env variables. Note that you may override `gcn.test.extensionDownloads` in your **workspace settings**: Save your workspace (one level above 
the root of the git clone, for texample) to create workspace file, then add
```
  "gcn.test.extensionDownloads": "/path/to/vscode-extensions/*/"
```
to its `settings` section. Note that you *need* to use absolute paths, as relative ones are resolved relatively to the launch.json's workspace folder. Absolute paths will resolve 

## Test suite with a single project from vscode UI
The `tests` testsuite can be also run in `extensionHost` mode for a **single** user project in workspace. In this mode, you can debug both the testcase and the tested extension. However, the **development instance** of vscode is used to host the extension and tests. It is advised to set up a separate instance of vscode in advance, **install necessary extensions into it**, in their desired versions and then open the `tests` project in that vscode's workspace.

The list of required extensions (the source of truth is in `src/runTest.js`) is:
- asf.apache-netbeans-java
- redhat.java
- oracle-labs-graalvm.graalvm
- vscjava.vscode-java-pack
- ms-kubernetes-tools.vscode-kubernetes-tools

You need to set up the desired user project, by 
- `npm run generate`; the generated projects will be placed in `generated-projects`
- `npm run prepare-tests`; the projects will be placed in `out/test-projects`

Note that changes may be made to those projects; if you want to start tests from a clean state, you need to **delete the folder** and run appropriate `npm run ` again. You may also need to **clean up OCI resources** - see the
Cleaner section.

# Test suites in individual extensions.
The GCN and oci-devops projects have their own test suites, defined from their `launch.json` configurations. They run in usual `extensionHost` mode. It is **recommended** to use one's own *compartment* to run tests, so that one can reliably clean up after failed test cases. **All tests should** honour environment variable `TEST_DEPLOY_COMPARTMENT_OCID`. You need to set up this env variable to the OCID of your personal compartment so the tests do not interfere with CI and other users. 

You **must install** the required extensions into your development vscode instance. You **must disable** the extension that you want to debug/test in the development vscode's workspace settings (or not install it at all).

## Running tests from CLI
Setup necessary environment variables. From the extensions' directory, run
- `npm install` - optional, install libraries. You need to set up network properly to reach NPM registry
- `npm dependency-compile` - optional, compile other projects required for this one
- `npm run compile` - compile the extension itself
- `npm run test` - execute tests.

Check your vscode settings for `gcn.test.compartmentOCID` setting, the predefined launch configuration use it to set up the environment variable.

You can select 'Extension Tests' from the launch menu. Note that in this mode, the debugged test host **shares the extensions and settings** with the development installation. You need to install **all required extensions** into the development vscode. The recommended setup is to **disable** the extensions needed for our extensions but not needed for the development **in workspace only**, which affects the development environment. You must install extensions **from your local build**, or the CI in order to get newest fixes and features into the development environment.
The tested instance will use a different workspace, and will default to enabled state for these extensions.

# Project generators
Some tests require to have project generated before the run. Run `npm run generate` to generate them.

# Debugging tests from the vscode UI
Debugging is tricky as it needs to bypass test setup infrastructure, in order to attach debugger to the vscode process (not the test setup process). You need to use `Development: Extension API Tests` and configure appropriately. The test **run within the development vscode environment**: that means that you **must** install all Oracle extensions in their current development versions, in order to test the right code into your development environment. It is recommended to use a separate instance of vscode using `--extensions-dir` and `--user-data-dir` parameters. The command `npm run vscode-setup` will prepare
such vscode instance in `.vscode-test` for you. Use `npm run vscode-test-env` to launch vscode with extensions and data set up for testing.

- set `TEST_DEPLOY_COMPARTMENT_OCID` to point to your own compartment
- set `TEST_DEPLOY_PROJECT_NAME` to some distinct name in your compartment
- set `testPatterns` to glob pattern for tests to be included, executed. Multiple patterns can be used, separated by `;` (semicolon)
- set the **last item of `args`** config option to the **project directory** of the tested project.
- The test environment must set up environment variable `TEST_VSCODE_EXTENSION=true`. `oci-devops` maintains a workspace storage based log of created resources. If a test is run repeatedly, test suites must be able to reach the storage and clean up the backlog. This env. variable instructs oci-devops to publish the memento so test code can clean it up.

A test run may only work **with a single project** or set of projects in a single workspace. Switching projects or workspace will restart extension host and reinitialize extensions. If you need to work on more projects, copy the launch configuration for each tested project separately.

# The Cleaner
The `./cleaner` is not an extension, but a cleaner that can be executed to delete OCI resources - not only created by the tests, but resources in general. It deletes
- OCI projects, including all the contents:
  - repostories
  - build and deploy pipelines
  - build artifacts
  - knowledgebases
- Artifact repositories, including the images

To use the cleaner, run
- `npm install ; npm run build`
- `npm run main {compartmentName} {regexp}`

The `compartmentName` should be the name of the target compartment to clean; if the compartment is a child of other compartment, you need to specify the full path, i.e. `parentCompartmentName/childCompartmentName`. The `regexp` is a regular expression that must match on project / resource name in order to be deleted.

# Troubleshooting

## Cleaning up test resources
If a folder has been already deployed but not undeployed, there are some leftovers that prevent the folder to be deployed again in the test data. If the test project was not cleanly undeployed from OCI, you need to delete these folders: `.vscode`, `.devops` and `.git`. If vscode is reinstalled or extension (especially apache NBLS) data deleted, it is also necessary to remove `.gradle` directory to clear out trust cache for NBLS.

## Debugging
For debugging, the *debugged extension must not be enabled* in the testing workspace, and `--extensionDevelopmentPath` parameter should point to the debugged extension. If the extension is enabled, it runs from the installed `vsix`, which does not contain `.map` files and stepping through extension code is not possible. Either uninsall the extension completely, or run the tested vscode instance, open the test project folder in it, and choose 'disable extension in workspace'. 

## Installing extensions 
In the `tests` project, one can install an extension manually
- `npm run test-install-extension {extension-vsix-filename}`

will install an extension into the testing vscode instance in `.vscode-test` subfolder. Just one extension can be installed at a time.


# Developing new tests
There are several options how to devolop a test.
Run `npm run dependency-compile` before the first test run or after you do a change in source code.
Run `npm run compile` before the first test run or after you do a change in test source code.

- API tests
    Fast and reliable tests. You can also execute vscode commands. Tests can access source code so that they can create new projects. However, you cannot open a new instance (tests would not know about other instances of vscode). To open a vscode in a specific project, specify `testDescriptor.ts.` After that, run `npm run generate` to generate the projects. When you run the `npm run test` for each project, a new instance of VSCode will be opened. All tests in a given folder will run on each project automatically.

- UI tests
    Time consuming and not so reliable tests. If you are facing undeterministic errors, add a sleep (eg `await new Promise((f) => setTimeout(f, 1000));`) between API calls. UI tests cannot execute vscode commands and cannot access source code => cannot create projects. But they can open projects. To create a project, specify `testDescriptor.ts.` After that, run `npm run generate` to generate the projects. When you run the `npm run test-ui` UI tests are executed and are not opened in any project. To open project in your vscode, you need to do it explicitely in your test. Take inspiration from `codelense.ui-test.ts`.

## TestDescriptor - description
Each folder with tests (files ending on `test.ts`) has to contain file `testDescriptor.ts` that contain class `TestsDescriptor` with default constructor and extending class `AbstractTestDescriptor`, fastest start is to copy already existing `testDescriptor.ts` file from other test folder.
The class handles passing information about tests in folder, mainly projects on which the tests should be run and their generation.
Other responsibilities will be added to this class as needed.
At the moment it also handles test environment variables and keeps information about destructivity of tests.
```typescript
import { ProjectDescription } from '../../../../../Common/types';
import { AbstractTestDescriptor } from '../../../../../Common/abstractTestDescriptor';
import * as help from '../../../../../Common/testHelper'; // contains helper functions for project description generation
import path from 'path';
export class TestDescriptor extends AbstractTestDescriptor {
  constructor() {
    super(__dirname);
  }
  descriptions: ProjectDescription[] = [// descriptions of projects against which the tests will be run
    help.copProj(path.join('test-projects', 'adm', 'oci-adm-g')),// path is handled against root of tests folder
    help.genProj(BuildTool.Maven, [Feature.OBJECTSTORE])// project generated by `npm run generate` task
  ];
  environment: Record<string, string> = {// Object with key:value pairs of type string
    ADM_SUPPRESS_AUTO_DISPLAY: 'true'
  };
  protected destructive: boolean = false;// Flag about destructivity of the tests, if the tests are run against some project and doesn't damage it in any way, this flag allows other tests to run in single vscode instance withou restart
}

```

# Configuring tests
- `TIMEOUT_MULTIPLICATOR` - ENV variable that customizes test timeout. If not defined, than default value is 1. Can be any number. Example: to extend test's timeout twice, you can write `TIMEOUT_MULTIPLICATOR=2`
- `DEBUG` - ENV variable that enables debug mode, in which inner proces' output is displayed in your console. If not defined it is set to false. To set debug flag to true use `DEBUG=true`. All other values are considered as false.
- `MICRONAUT_SERVER_PORT` - ENV variable that customizes the port you want to run the server on (eg `MICRONAUT_SERVER_PORT=8080`)

# Other documentation
- https://github.com/redhat-developer/vscode-extension-tester
- https://code.visualstudio.com/api/working-with-extensions/testing-extension

# Future improvements
- Utility for handling env variables - passwords, etc.
- Make API for UI tests to run tests on multiple projects easily

