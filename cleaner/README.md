# OCI Cleaner

This project is a cleaner for OCI devops project resources. It cleans contents of a single compartment from resources whose names match the given regexp. **USE AT YOUR OWN RISK**, the utility DELETES data from the OCI.

It accepts two parameters:
- *compartment name*, as a path from the root compartment.
- *a single regexp* to select project, container images and container registries.
If more names resources should be cleared, use `|` to combine them in the regexp. So for example `"oci-adm-.*|MAVEN_DATABASE_.*|maven_micronaut.*|adm-test-.*"`

The cleaner will enumerate projects with matching names. Deletes build pipelines, artifacts, code repositories. As usual container image and registry names derive from the project name, the cleaner will also list images in the compartment with matching name and delete them as well as container registries.

