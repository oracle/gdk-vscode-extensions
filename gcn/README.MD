# OCI DevOps Tools
*** **Technology Preview** ***
<!-- vscode-markdown-toc -->

* [GCN Projects Generation Wizard](#gcn-projects-generation-wizard)
* [OCI DevOps Services](#oci-devops-services)
    * [Create DevOps Project](#create-devops-project)
    * [Default Pipelines Setup](#default-pipelines-setup)
* [OCI Kubernetes deployment with OKE](#oci-kubernetes-deployment-with-oke)
* [Project Dependencies Vulnerability Audits](#project-dependencies-vulnerability-audits)
* [Adding more OCI DevOps Services](#adding-more-oci-devops-services)
* [Proxy Setup](#proxy-setup)
* [Provide Feedback or Seek Help](#provide-feedback-or-seek-help)
    * [Privacy Policy](#privacy-policy)

<!-- vscode-markdown-toc-config
	numbering=false
	autoSave=true
	/vscode-markdown-toc-config -->
<!-- /vscode-markdown-toc -->




OCI DevOps Tools extension provides support for Oracle Cloud Infrastructure’s DevOps service in VS Code with generation of build and deployment pipelines along with source code management to make it easy to transition from local development to cloud-based development and deployment. 
The initial release of the extension supports Micronaut and Spring Boot applications with modules for several core cloud services including Object Storage, Authentication, Secret Management, Streaming, etc. 
The GCN extension comes with a project generation wizard to build and configure Micronaut and GCN applications.

### <a name='prerequisites:'></a>Prerequisites:

- [Extension Pack for Java](https://marketplace.visualstudio.com/items?itemName=vscjava.vscode-java-pack) Microsoft extension
- [Kubernetes](https://marketplace.visualstudio.com/items?itemName=ms-kubernetes-tools.vscode-kubernetes-tools) Microsoft extension
​
> Note: The extension depends on the [Apache NetBeans Language Server](https://marketplace.visualstudio.com/items?itemName=ASF.apache-netbeans-java), [GraalVM Extension Pack for Java](https://marketplace.visualstudio.com/items?itemName=oracle-labs-graalvm.graalvm-pack). (VS Code installs these required extensions for you.)

Once Graal Cloud Native Tools and accompanying extensions are installed, notice **Gr** (stands for GraalVM) in the Activity Bar on the left, and the new **DATABASES** and **OCI DEVOPS SERVICES** panels in the Explorer.

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

​
## <a name='oci-devops-services'></a>OCI DevOps Services
​
Graal Cloud Native Tools enable support for the core [Oracle Cloud Infrastructure (OCI)](https://www.oracle.com/cloud/) services in VS Code including Object Storage, Authentication, Secret Management, Streaming, etc. You can create build and deployment pipelines along with source code management to easy transmit from local to cloud-based development and deployment directly using the **OCI DEVOPS SERVICES** panel:
​
To start using OCI DevOps Services, you need to:
- Have a [Oracle Cloud account](https://www.oracle.com/cloud/free/) (free is sufficient)
- [Create .oci/config file](https://docs.oracle.com/en-us/iaas/Content/API/Concepts/sdkconfig.htm) to access OCI services
- [Add API Key](https://docs.oracle.com/en/learn/generate_ssh_keys/index.html)
- [Install OCI CLI](https://docs.oracle.com/en-us/iaas/Content/API/SDKDocs/cliinstall.htm)
- [Create and setup access to a OKE cluster](https://docs.oracle.com/en-us/iaas/Content/ContEng/Tasks/contengcreatingclusterusingoke.htm)

Once you have access to OCI, you can continue and click **Create DevOps Project** to create a pipeline that will build and deploy your project in OCI automatically.

### <a name='create-devops-project'></a>Create DevOps Project
1. Open **OCI DEVOPS SERVICES** panel in VSCode Explorer and click Create DevOps Project button 

![devops-ci-jobs.png](images/create_devops_prj.png)

2. You will be guided through several steps to push the project from local system in OCI DevOps project:
    1. Select your comparment on OCI
    2. Confirm project name on OCI DevOps, this must be unique per tenancy
    3. Depending on your setup you might be asked to:
        a. Confirm SSH keys for git operations and add OCI DevOps git server to SSH **config** and **known_hosts** file
        b. Select existing OKE cluster on OCI or create a new one using [OKE Quick Create](https://docs.oracle.com/en-us/iaas/Content/ContEng/Tasks/contengcreatingclusterusingoke_topic-Using_the_Console_to_create_a_Quick_Cluster_with_Default_Settings.htm#create-quick-cluster) action. OKE is important to be able to test OCI applications Deployed to OKE from local machine

        ![oke_quick_create.png](images/oke_quick_create.png)

        c. When new OKE cluster was created then it is important to complete the last step and set local machine kubeconfig file using VNC-Native Public Endpoint. This is the step when OCI CLI is only used:

        ![set_oke_access.png](images/set_oke_access.png)

 Once you create a DevOps project, the following jobs become available from VS Code:

![devops-ci-jobs.png](images/devops-ci-jobs.png)
### <a name='default-pipelines-setup'></a>Default Pipelines Setup
* **Build Fat JAR**: to package the application with Gradle/Maven and create a runnable JAR file
* **Build Native Executable**: to package the application with Gradle/Maven and generate a native executable using GraalVM Native Image
* **Build OCI Docker Native Executable**: to package the application and build a native executable in a Docker container
* **Deploy OCI Docker Native Executable to OKE**: to package the application, build a native executable in a Docker container and deploy to OKE

Build specs for each pipeline are stored in *project_folder*/.gcn/

## <a name='oci-kubernetes-deployment-with-oke'></a>OCI Kubernetes deployment with OKE
When **Build OCI Docker Native Executable** pipeline succeeds and build is available it can be deployed to OKE using **Deploy OCI Docker Native Executable to OKE** deployment pipeline. It will deploy the application into OKE and run it. When complete the application can be tested in a browser by selecting action **Open in Browser** for Deploy pipeline

![Open OKE application in local browser](images/oke_test_app.png)

It will perform **kubectl** port forwarding from OKE to localhost and is indicated by VSCode status bar ![kubectl port forwarding active](images/kubectl_port_fwd.png)

Browser windows opens with given url for application running in OKE.

## <a name='project-dependencies-vulnerability-audits'></a>Project Dependencies Vulnerability Audits
The extension also performs Project audits for vulnerabilities in 3rd party project libraries, supported project types are Maven and Gradle. Project Audits requires OCI account (**.oci/config** file) and use OCI ADM Knowledgebase which retrieves data from nvd.nist.gov database.
Just select **Run Project Audit** action in Java Projects panel to check for vulnerabilities in opened project. If project contains vulnerable dependency it is shown in PROBLEMS view. 

![Project Audits action and reported errors](images/project_audit.png)

History of Projects audit can be displayed in OCI DevOps Services panel

## <a name='adding-more-oci-devops-services'></a>Adding more OCI DevOps Services
The **OCI DEVOPS SERVICES** feature is not limitted by the four jobs listed in the previous step. There are many more: you can add an existing build pipeline, a build artifact, or a container registry, etc.:

![more-ci-jobs.png](images/more-ci-jobs.png)

## <a name='proxy-setup'></a>Proxy Setup
When working behind firewall over proxy then VSCode Proxy has to be set ON. In VSCode **Settings** set **Http: Proxy Support** to **ON**. Subsequently when working without proxy set this **OFF**.

![HTTP Proxy in VSCode](images/proxy.png)

Many tools used to work on Java projects like Maven, Gradle, kubectl and Docker (if used) could require setting up proxy configuration. 

## <a name='provide-feedback-or-seek-help'></a>Provide Feedback or Seek Help

* [Request a feature](https://github.com/graalvm/vscode-extensions/issues/new?labels=enhancement)
* [File a bug](https://github.com/graalvm/vscode-extensions/issues/new?labels=bug)

### <a name='privacy-policy'></a>Privacy Policy

Read the [Oracle Privacy Policy](https://www.oracle.com/legal/privacy/privacy-policy.html) to learn more.