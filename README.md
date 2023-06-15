# Graal Cloud Native VSCode extensions

This suite provides extensions to Visual Studio Code that supports development of Graal Cloud Native (GCN) and Micronaut applications, OCI DevOps support and JDBC support for Oracle Database and MySQL for VSCode.

The extensions are Technology Preview.

## Build VSIX package from sources

To build VSIX packages of the GCN extensions, take the following steps:
* Install `npm`
  * Install `vsce` if not installed automatically 
* To build all extensions at once run following command at this top level folder.
```bash
$ npm run build
```
* Build each extension separately, e.g. **gcn** ext:
```bash
npm run build:gcn
```
Specify name of the folder with extension after **`:`**

## Installation

To install the extension into Visual Studio Code, take the following step:

* Install desired package with `code --install-extension <extension.vsix>`
```bash
code --install-extension gcn/gcn-*.vsix
```
## License

Graal Cloud Native VS Code Extension are licensed under [The Universal Permissive License (UPL), Version 1.0](LICENSE)