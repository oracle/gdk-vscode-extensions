# Proxy setup

In case of network behind the proxy, the following variables must be set:

- `http_proxy` - URL to proxy, incl. protocol and port, e.g. http://acme.com:80
- `no_proxy`   - URL patterns that must not use proxy. In particular, corporate/internal NPM module repositories must be enumerated in no_proxy env var.

Internally (in package.json), the globalAgent/bootstrap is used with `GLOBAL_AGENT_{HTTP,NO}_PROXY`
set to the appropriate env variable. The environment variables `http_proxy` and `no_proxy` are read by npm package manager.

The test fixture projects use *gradle* build system. If behind a proxy, you *must update your gradle configuration* as follows:
```
systemProp.http.proxyHost=http://acme.com:80
systemProp.https.proxyHost=http://acme.com:80
```
Use the same proxy specification as in `http_proxy` environment variable. 

# Prepare for testing
Ensure that all necessary npm modules are installed. Run
- `npm install`
to update the local node_modules module cache, if any changes were pulled for `package.json`.

You need to compile the extensions itself, and the test code before launching the tests.
- `npm run dependency-compile`
- `npm run compile`

# Run the tests from the CLI
Tests can be executed by `npm run test`. The test bootstrap will download a separate installation of vscode into `vscode-test` directory. The testing environment will use a **separate** extensions dir (`.vscode-test/extensions`) and user dir (`.vscode-test/user-data`). The tested vscode installation is completely separated from the development one.

# Run the tests from the vscode UI
You can select 'Extension Tests' from the launch menu. Note that in this mode, the debugged test host **shares the extensions and settings** with the development installation. You need to install **all required extensions** into the development vscode. The recommended setup is to **disable** the extensions needed for our extensions but not needed for the development **in workspace only**, which affects the development environment.
The tested instance will use a different workspace, and will default to enabled state for these extensions.

The list of required extensions (the source of truth is in `src/runTest.js`) is:
- asf.apache-netbeans-java
- redhat.java
- oracle-labs-graalvm.graalvm
- vscjava.vscode-java-pack
- ms-kubernetes-tools.vscode-kubernetes-tools

# Project generators
Some tests require to have project generated before the run. Run `npm run generate` to generate them.

# Run UI tests from the CLI/vscode UI
UI tests allow for interactive extension testing from within vscode UI itself by controlling vscode with a chrome webdriver. Running `npm run test-ui` will start the tests. First run will download the latest vscode instance and chrome webdrive into `./test-resources` folder. Executing environment will share currently installed extensions.

# Developing new tests
There are several options how to devolop a test.
Run `npm run dependency-compile` before the first test run or after you do a change in source code.
Run `npm run compile` before the first test run or after you do a change in test source code.

- API tests
    Fast and reliable tests. You can also execute vscode commands. Tests can access source code so that they can create new projects. However, you cannot open a new instance (tests would not know about other instances of vscode). To open a vscode in a specific project, specify `testSpecification.ts.` After that, run `npm run generate` to generate the projects. When you run the `npm run test` for each project, a new instance of VSCode will be opened. All tests in a given folder will run on each project automatically.

- UI tests
    Time consuming and not so reliable tests. If you are facing undeterministic errors, add a sleep (eg `await new Promise((f) => setTimeout(f, 1000));`) between API calls. UI tests cannot execute vscode commands and cannot access source code => cannot create projects. But they can open projects. To create a project, specify `testSpecification.ts.` After that, run `npm run generate` to generate the projects. When you run the `npm run tes-ui` UI tests are executed and are not opened in any project. To open project in your vscode, you need to do it explicitely in your test. Take inspiration from `codelense.ui-test.ts`.

# Future improvements
- Run only selected test
- Utility for handling env variables - passwords etc.
- Fix reporting with mocha awesome / change workspaces with `vscode.workspace.updateWorkspaceFolders`
- Make api for UI tests to run tests on multiple project easily

# Developing new tests
There are several options on how to develop a test.
Run `npm run dependency-compile` before the first test run or after you change the source code.
Run `npm run compile` before the first test run or after you change the test source code.

- API tests
    Fast and reliable tests. You can execute VSCode commands. Tests can access source code so that they can create new projects. However, you cannot open a new instance (tests would not know about other instances of VSCode). To open a vscode in a specific project, specify `testSpecification.ts` After that, run `npm run generate` to generate the projects. When you run the `npm run test` for each project, a new instance of VSCode will be opened. All tests in a given folder will run on each project automatically.

- UI tests
    Time consuming and not-so-reliable tests. If you are facing nondeterministic errors, add a sleep (e.g., `await new Promise((f) => setTimeout(f, 1000));`) between API calls. UI tests cannot execute vscode commands and cannot access source code => and not create projects. But they can open projects. To create a project, specify `testSpecification.ts` After that, run `npm run generate` to generate the projects. When you run the `npm run test-ui`, UI tests are executed and are not opened in any project. To open a project in your vscode, you must do it explicitly in your test. Take inspiration from `codelense.ui-test.ts.`

# Configuring tests
- `TIMEOUT_MULTIPLICATOR` - ENV variable that customizes test timeout. If not defined, than default value is 0. Can be any number. Example: to extend test's timeout twice, you can write `TIMEOUT_MULTIPLICATOR=2`
- `DEBUG` - ENV variable that enables debug mode, in which inner proces' output is displayed in your console. If not defined it is set to false. To set debug flag to true use `DEBUG=true`. All other values are considered as false.
- `MICRONAUT_SERVER_PORT` - ENV variable that customizes the port you want to run the server on (eg `MICRONAUT_SERVER_PORT=8080`)

# Other documentation
- https://github.com/redhat-developer/vscode-extension-tester
- https://code.visualstudio.com/api/working-with-extensions/testing-extension

# Future improvements
- Run only selected test
- Utility for handling env variables - passwords, etc.
- Fix reporting with mocha awesome / change workspaces with `vscode.workspace.updateWorkspaceFolders.`
- Make API for UI tests to run tests on multiple projects easily

