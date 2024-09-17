# Change Log

## Version 0.9.10
* Create OCI DevOps Project action now checks kubectl configuration in advance to prevent error when creating OKE CronJob for Secret rotation

## Version 0.9.9
* Faster redeployments to OKE from deployment pipelines created by OCI DevOps extension
* Various bug fixes and improvements

## Version 0.9.8
* GitHub repo renamed to GDK
* Various bug fixes

## Version 0.9.7
* Helidon SE projects support
* Added possibility to easily report issues directly to GitHub
* Bug fixes in handling OCI DevOps project deployment
* 3rd party libraries updated

## Version 0.9.6
* JDK 21 is default Java for OCI DevOps pipeline builds.
* Removed possibility to use local active GraalVM version for the remote build
* `openjdk:21` container image used for JVM based containers

## Version 0.9.5
* Open sourcing changes

## Version 0.9.4
* Fix OKE subsequent deployments from OCI DevOps pipeline failed
* Fix space in path to handle oci\config and ssh config on Windows
* Build spec updates to reflect project updates

## Version 0.9.3
* Fixes to provision OCI DevOps build pipelines for Micronaut 4.0.x Gradle projects
* 3rd party libraries updated
* When deploying to OCI Micronaut 4.0.0 Gradle project it is recommended to update `aot` plugin to version `4.0.1` in `build.gradle` file, see [issue #781](https://github.com/micronaut-projects/micronaut-gradle-plugin/issues/781). Otherwise native image builds fail.

## Version 0.9.2
* Support for GraalVM 23

## Version 0.9.1
* Documentation updated 

## Version 0.9.0
* Initial release published on Visual Studio Marketplace, Technology Preview