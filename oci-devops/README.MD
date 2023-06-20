# OCI DevOps Tools

Enables easy integration with the [Oracle Cloud Infrastructure (OCI) DevOps](https://www.oracle.com/devops/devops-service/) service. The DevOps service can host your source code in Oracle Cloud Infrastructure and build, then deploy, your projects in hosted CI/CD pipelines.

The extension creates a project in the DevOps service, sets up a source code repository, as well as build and deployment pipelines, enabling you to easily transition from local to cloud-based development and deployment.

## Supported Projects and Platforms
Supported project types:
- Maven & Gradle for following technologies: 
  - Micronaut
  - Graal Cloud Native (Oracle Cloud Infrastructure support required)
  - SpringBoot 3.0.5 (GraalVM Native Support dependency must be enabled in project)

Supported GraalVM versions:
- GraalVM 22.x
- GraalVM 23.0, Java 17

## Quickstart

If you are working with a Graal Cloud Native (or Spring Boot) project, the extension will set up build pipelines to build containers for your Java-based application and native executable. The extension will also create deployment pipelines that will deploy these containers to an OKE cluster.

If you have a standard Maven or Gradle project, you can still use this extension to build
your JAR files in the cloud on the Oracle Cloud Infrastructure DevOps service, but as of now deployment pipelines are not created.

For more information, see [Graal Cloud Native](https://graal.cloud/) and [OCI DevOps service](https://www.oracle.com/devops/devops-service/).

To get started, you will need:

- To install the extension, you require
- A Java installation (JDK 17+)
- An [Oracle Cloud account](https://www.oracle.com/cloud/free/) (a free account is OK)
- A [configured _.oci/config_ file](https://docs.oracle.com/iaas/Content/API/Concepts/sdkconfig.htm) to access Oracle Cloud Infrastructure services
- An [API Key](https://docs.oracle.com/en/learn/generate_ssh_keys/index.html)
- The [Oracle Cloud Infrastructure CLI](https://docs.oracle.com/iaas/Content/API/SDKDocs/cliinstall.htm)
- An [OKE cluster](https://docs.oracle.com/iaas/Content/ContEng/Tasks/contengcreatingclusterusingoke.htm). OKE is Oracle Cloud Infrastructure‘s managed Kubernetes service.


Having done the above, and with a [Graal Cloud Native](https://graal.cloud/), or a [Spring Boot](https://spring.io), project, you can
can now create an Oracle Cloud Infrastructure DevOps project.

### <a name='create-devops-project'></a>Create DevOps Project

1. Open the **OCI DEVOPS** panel in VSCode Explorer and click the **Create OCI DevOps Project** button

    ![devops-ci-jobs.png](images/create_devops_prj.png)

2. You will be guided through the process of creating an Oracle Cloud Infrastructure DevOps project:
    - If you are using multiple Oracle Cloud Infrastructure profiles, you will first need to select the Oracle Cloud Infrastructure profile that you wish to use
    - Select your compartment in Oracle Cloud Infrastructure. Your DevOps project will be created here.
    - Confirm the DevOps project name. This must be unique to the tenancy.
    - Depending on your setup, you might be asked to:
        - Confirm the SSH keys for git operations and add the Oracle Cloud Infrastructure DevOps git server to your SSH **config** and **known_hosts** file.
        - Select an existing OKE cluster on Oracle Cloud Infrastructure, or create a new one using the [OKE Quick Create](https://docs.oracle.com/iaas/Content/ContEng/Tasks/contengcreatingclusterusingoke_topic-Using_the_Console_to_create_a_Quick_Cluster_with_Default_Settings.htm#create-quick-cluster) action.

            ![oke_quick_create.png](images/oke_quick_create.png)

    - When the new OKE cluster is created, configure local access to the OKE Kubernetes cluster using the `VNC-Native Public Endpoint`. This is done using the Oracle Cloud Infrastructure CLI and you may have already done this in the prerequisite steps.

        ![set_oke_access.png](images/set_oke_access.png)

Once you create a DevOps project, the following build targets now become available from within VS Code:

![devops-ci-jobs.png](images/devops-ci-jobs.png)

You can run these build targets, which will run in the Cloud in the Oracle Cloud Infrastructure DevOps service and not locally, by clicking on the triangle run icon.

### <a name='default-pipelines-setup'></a>Default Pipelines Setup

* **Build OCI Native Executable Container**: Packages the application as a native executable in a container image.
* **Build OCI JVM Container**: Packages the application as a JVM-based container image.

Once built, the container images can be pulled by clicking on the cloud icon, which provides the command required to pull the containers locally.

The build specification files for each pipeline are stored in _.devops/_. If you update the build specification file, commit and push the change to the DevOps-hosted repository, the build pipelines will be updated to reflect this change. It should be noted that the build pipelines run on custom sized build runners in order to ensure there is sufficient memory to build all native executables using GraalVM Native Image. These can be customized within the Oracle Cloud Console.

## <a name='oci-kubernetes-deployment-with-oke'></a>OCI Kubernetes deployment with OKE

When the build pipeline succeeds, the container image can be deployed to OKE using **Deploy OCI Native Executable Container to OKE**
deployment pipeline. When complete, the application can be tested in a browser by selecting the action **Open in Browser** for Deploy pipeline. This will
set up port forwarding using your local `kubectl`.

![Open OKE application in local browser](images/oke_test_app.png)

It will perform **kubectl** port forwarding from OKE to localhost as indicated by the VSCode status bar.

![kubectl port forwarding active](images/kubectl_port_fwd.png).

## <a name='project-dependencies-vulnerability-audits'></a>Project Dependencies Vulnerability Audits

The extension also performs project audits for vulnerabilities in third-party project libraries; supported project types are Maven and Gradle. Project Audits require an Oracle Cloud Infrastructure account (_.oci/config_ file) and uses an Oracle Cloud Infrastructure ADM Knowledgebase which retrieves data from the nvd.nist.gov database.
Just select the **Run Project Audit** action in the **Java Projects** panel to check for vulnerabilities in an open project. If a project contains a vulnerable dependency, it is shown in the **PROBLEMS** view.

![Project Audits action and reported errors](images/project_audit.png)

When your project is moved into the DevOps service in Oracle Cloud Infrastructure, it is scanned for vulnerabilities by the [Application Dependency Management service](https://docs.oracle.com/iaas/Content/application-dependency-management/home.htm).
The results of this audit can be displayed within the **OCI DevOps** services panel by clicking on the plus icon and selecting **Add Knowledge Base** from the displayed menu.

![Add Knowledge Base](images/add-knowledge_base.png)

## <a name='adding-more-oci-devops-services'></a>Adding more Oracle Cloud Infrastructure DevOps Services
The **OCI DEVOPS SERVICES** feature is not limited by the four jobs listed in the previous step. There are many more: You can
add an existing build pipeline, a build artifact, a container registry, etc.

![more-ci-jobs.png](images/more-ci-jobs.png)


## <a name='prerequisites'></a>Prerequisites

- [Extension Pack for Java](https://marketplace.visualstudio.com/items?itemName=vscjava.vscode-java-pack) Microsoft extension
- [Kubernetes](https://marketplace.visualstudio.com/items?itemName=ms-kubernetes-tools.vscode-kubernetes-tools) Microsoft extension
​
> Note: The extension depends on the [Apache NetBeans Language Server](https://marketplace.visualstudio.com/items?itemName=ASF.apache-netbeans-java), [GraalVM Extension Pack for Java](https://marketplace.visualstudio.com/items?itemName=oracle-labs-graalvm.graalvm-pack). (VS Code installs these required extensions for you.)

## <a name='proxy-setup'></a>Proxy Setup
When working behind firewall over a proxy then VSCode Proxy has to be set ON. In VSCode **Settings** set **Http: Proxy Support** to **ON**. Subsequently when working without proxy set this **OFF**.

![HTTP Proxy in VSCode](images/proxy.png)

Many tools used to work on Java projects, such as Maven, Gradle, `kubectl`, and `docker` (if used), may require proxy configuration.

## <a name='provide-feedback-or-seek-help'></a>Provide Feedback or Seek Help

* [Request a feature](https://github.com/graalvm/vscode-extensions/issues/new?labels=enhancement)
* [File a bug](https://github.com/graalvm/vscode-extensions/issues/new?labels=bug)

### <a name='privacy-policy'></a>Privacy Policy

Read the [Oracle Privacy Policy](https://www.oracle.com/legal/privacy/privacy-policy.html) to learn more.
