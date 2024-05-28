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

You need to compile the GDK extension itself, and the test code before launching the tests.
- `npm run compile`
- `npm run test-compile`

# Run the tests from the CLI
Tests can be executed by `npm run test`. The test bootstrap will download a separate installation of vscode into `vscode-test` directory. The testing environment will use a **separate** extensions dir (`.vscode-test/extensions`) and user dir (`.vscode-test/user-data`). The tested vscode installation is completely separated from the development one.

# Run the tests from the vscode UI
You can select 'Extension Tests' from the launch menu. Note that in this mode, the debugged test host **shares the extensions and settings** with the development installation. You need to install **all required extensions** into the development vscode. The recommended setup is to **disable** the extensions needed for GDK but not needed for the development **in workspace only**, which affects the development environment.
The tested instance will use a different workspace, and will default to enabled state for these extensions.

The list of required extensions (the source of truth is in `src/test/runTest.js`) is:
- asf.apache-netbeans-java
- redhat.java
- oracle-labs-graalvm.graalvm-pack
- oracle-labs-graalvm.graalvm
- vscjava.vscode-java-pack
- vscjava.vscode-java-debug
- ms-kubernetes-tools.vscode-kubernetes-tool

# Order of running tests
If you would like to run `UI tests`, you need to run `normal tests` first to generate some projects UI tests work with. If you would like to add the projects manually, add them to `gcn/out/test/projects`.
Right now these UI tests requires resources:
- codelense.ui-test.ts

# Run UI tests from the CLI/vscode UI
UI tests allow for interactive extension testing from within vscode UI itself by controlling vscode with a chrome webdriver. Running `npm run test-ui` will start the tests. First run will download the latest vscode instance and chrome webdrive into `./test-resources` folder. Executing environment will share currently installed extensions.
