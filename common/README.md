# Description
This module is intended to unify usage of code across multiple Extensions to avoid duplicate code and problems like bug fixes applied on code only in some Extensions.

# Usage
This module has to built first to be used see [Building](#building).
After building this module all packages can be accessed by importing them directly from _lib_ folder of the module.
```typescript
import * as <package> from '<vscode-extensions>/common/lib/<package>';
```
or
```typescript
import { <imported> } from '<vscode-extensions>/common/lib/<package>';
```
Where _<vscode_extensions>_ means navigating to the top/parent folder.

# Building
To build this module use one of these commands:

```bash
.../vscode-extensions $> npm run build:common
```
```bash
.../vscode-extensions/common $> npm run build
```
This module is also build in prebuild step of base package so it is prepared before building rest of the Extensions.

# Extending
Whenever you encounter a need to use code from another extension, find duplicate or unifiable code in Extensions make use of this module to reference the code from single source.
- The code that can be moved to this module has to be **not** coupled to Extensions functionality or the functionality has to be also movable to this module.
- Make sure to move the code to proper package or create suitable package for the code.
- [Build](#building) the module with new code, this will allow you to access new code from the Extensions.
- [Redirect all imports and usages](#usage) to the modules package.
- Dependencies can be added to this module in _package.json_ but some (Node) modules need to have fallback resolved in _webpack.config.js_ of extension using the code:
```js
resolve: {
  fallback: {
    "fs": false,
    "os": false,
    "path": false,
    "child_process": false
  }
}
```
- Please include [description of shared functionality](#packages) here in this README for easy lookup.

# Packages
- [logUtils.ts](src/logUtils.ts)<details><summary>code used for logging</summary>Contains basic logging code, to use it properly the logging has to be registered during Extension activation by _registerExtensionForLogging_ method.</details>
- [dialogs.ts](src/dialogs.ts)<details><summary>code used for communication with user</summary>Contains most of code to create dialogs mainly _MultistepInput_ for QuickPick.</details>
- [utils.ts](src/utils.ts)<details><summary>misc. code</summary>Contains mostly miscelaneous code, mainly _findExecutable_ and _getJavaVersion_.</details>