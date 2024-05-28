# gcn-extension-tests

## Description
**gcn-extension-tests** is a npm package that provides a test environment for executing VSCode extensions tests. It allows to run pre-written tests that follow a standardized format for VSCode extensions, facilitating automated testing and ensuring the extension stability. More about standard VSCode extension testing can be found at the [official api docs](https://code.visualstudio.com/api/working-with-extensions/testing-extension).

## Installation
To install **gcn-extension-tests**, use the following command:

```
npm install gcn-extension-tests
```

This will download and install the package from the npm registry. At the time of writing of this document, the package has been installed for the `GDK` extension.

## Dependencies
**gcn-extension-tests** relies on the following dependencies:

- **@vscode/test-electron**: This package provides the necessary utilities for running tests on VSCode extensions.
- **mocha**: A widely used JavaScript test framework that provides a simple and expressive syntax for defining tests.

Ensure that these dependencies are installed in the project along with **gcn-extension-tests**.

## Usage
To execute tests for VSCode extension using **gcn-extension-tests**, these steps should be followed:

1. Ensure that the extension's code and test files are set up correctly.
2. Open a terminal or command prompt in your project directory.
3. Run the following command to execute the extension tests:

```
./node_modules/gcn-extension-tests/bin/main.js [args]
```

The value of `[args]` can be one of the following:

- `--runTest` - executes all tests specified in `out/test/site/index.js`
- `--runTest-ui` - runs the UI tests with the [vscode-extension-tester](https://github.com/redhat-developer/vscode-extension-tester) (files `**/**.ui-test.js` are being targeted for execution)

Note: When running the UI tests, make sure that the vscode-extension-tester is installed beforehand.

## Test Script Format
**gcn-extension-tests** supports the standard format for writing tests for VSCode extensions. Refer to the official [VSCode Testing repo](https://github.com/microsoft/vscode-extension-samples/blob/main/helloworld-test-sample/src/test/suite/extension.test.ts) for detailed information/samples on how to structure test files and write tests for the extension.

## Output and Reporting
**gcn-extension-tests** utilizes the Mocha testing framework's standard output format for reporting the results of the test execution. The test runner will provide detailed feedback on the test cases, including the number of tests executed, passed, failed, and any associated error messages or stack traces.

## Error Handling
During test execution, **gcn-extension-tests** relies on the Mocha framework's built-in error handling and assertion mechanisms. If a test case fails or encounters an error, an appropriate error message will be displayed in the test runner's output.

Ensure that your test scripts include relevant assertions to validate the behavior of the VSCode extension.

## Supported Environments
**gcn-extension-tests** supports the following operating systems:

- Linux
- Windows
- macOS

## Troubleshooting
If you encounter any issues while using **gcn-extension-tests**, consider the following troubleshooting steps:

1. Ensure that your VSCode extension's test files are correctly set up and follow the standard format.
2. Verify that the required dependencies, including **@vscode/test-electron** and **mocha**, are installed with required version.
3. Check for any error messages or stack traces provided by the test runner to identify potential issues in your extension or test setup.