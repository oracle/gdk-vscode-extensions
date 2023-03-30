# Graal Cloud Native Tools
*** **Technology Preview** ***
<!-- vscode-markdown-toc -->

* [GCN Projects Generation Wizard](#gcn-projects-generation-wizard)
* [Provide Feedback or Seek Help](#provide-feedback-or-seek-help)
    * [Privacy Policy](#privacy-policy)

<!-- vscode-markdown-toc-config
	numbering=false
	autoSave=true
	/vscode-markdown-toc-config -->
<!-- /vscode-markdown-toc -->


The GCN extension comes with a project generation wizard to build and configure Micronaut and GCN applications.

### <a name='prerequisites:'></a>Prerequisites:

## <a name='gcn-projects-generation-wizard'></a>GCN Projects Generation Wizard 
​
The extension provides the GCN project creation wizard. The wizard supports generating different types of Micronaut applications including serverless applications and gateway functions.

1. Go to **View**, **Command Palette**, search for "gcn", and invoke the **GCN: Create GCN Project** quick action.

    ![gcn-vscode-actions.png](images/gcn-vscode-actions.png)

2. Follow the command prompts to generate a new Maven or Gradle project. For example, create a simple Java Server application:
    - Pick Micronaut version
    - Pick Application type
    - Pick Project Java
    - Provide project name
    - Provide base package
    - Pick project languae
    - Pick project services
    - Pick build tool
    - Pick test framework
    - Pick cloud platform
    - Choose categories to include features from
    - Pick feature(s) for the selected category (category you selected at the previous step)

3. Finally, you are asked to select the destination directory on your local disk and whether to open the created project in a new window or add it to the current workspace. The project is created and open in the VS Code window.


## <a name='provide-feedback-or-seek-help'></a>Provide Feedback or Seek Help

* [Request a feature](https://github.com/graalvm/vscode-extensions/issues/new?labels=enhancement)
* [File a bug](https://github.com/graalvm/vscode-extensions/issues/new?labels=bug)

### <a name='privacy-policy'></a>Privacy Policy

Read the [Oracle Privacy Policy](https://www.oracle.com/legal/privacy/privacy-policy.html) to learn more.