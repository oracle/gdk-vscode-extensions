# Graal Cloud Native Tools

[Graal Cloud Native](https://graal.cloud/) is a cloud-agnostic development framework, built on top of
[Micronaut](http://micronaut.io). Using Graal Cloud Native you can write once and then run the same code on multiple cloud platforms.

This extension provides a wizard for easily creating a new Graal Cloud Native Project.

## <a name='gcn-projects-generation-wizard'></a>Create New Project Wizard
​
The wizard supports generating different types of Graal Cloud Native applications and serverless applications. You can select
which of the Graal Cloud Natives features you would like included in your project.

1. Go to **View**, **Command Palette**, search for "Graal Cloud Native", and invoke the **Graal Cloud Native: Create New Project** quick action.

    ![Create New Proct Action](images/gcn-vscode-actions.png)

2. Follow the command prompts to generate a new Maven or Gradle project. For example, to create a simple Java-based Graal Cloud Native application:
    - Select the Micronaut version, only one is supported currently
    - Select an Application type
    - Select an installed JDK to use
    - Provide a name for the project
    - Provide a base package
    - Pick the Graal Cloud Native services to be included in the project
    - Select a build tool: Maven; Gradle
    - Select a unit test framework: JUnit; Spock; Kotest;
    - Select cloud providers to support: OCI; AWS; But more are coming;

3. Finally, you are asked where you would like to save this project. You then choose to open it in a new VS Code window or add it to a Workspace in the current VS Code window.

You now have a new Graal CLoud Native application, complete with example code showing you how to start using the [Graal Cloud Native](https://graal.cloud/) framework.

## <a name='provide-feedback-or-seek-help'></a>Provide Feedback or Seek Help

* [Request a feature](https://github.com/graalvm/vscode-extensions/issues/new?labels=enhancement)
* [File a bug](https://github.com/graalvm/vscode-extensions/issues/new?labels=bug)

### <a name='privacy-policy'></a>Privacy Policy

Read the [Oracle Privacy Policy](https://www.oracle.com/legal/privacy/privacy-policy.html) to learn more.
