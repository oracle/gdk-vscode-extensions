/*
 * Copyright (c) 2022, 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

export const RESOURCES = {
    'devbuild_spec_no_output_artifacts.yaml': require('../../resources/oci/devbuild_spec_no_output_artifacts.yaml.handlebars'),
    'devbuild_spec.yaml': require('../../resources/oci/devbuild_spec.yaml.handlebars'),
    'docker_build_spec.yaml': require('../../resources/oci/docker_build_spec.yaml.handlebars'),
    'docker_jvmbuild_spec.yaml': require('../../resources/oci/docker_jvmbuild_spec.yaml.handlebars'),
    'docker_nibuild_spec.yaml': require('../../resources/oci/docker_nibuild_spec.yaml.handlebars'),
    'Dockerfile.jvm': require('../../resources/oci/Dockerfile.jvm.handlebars'),
    'Dockerfile.native': require('../../resources/oci/Dockerfile.native.handlebars'),
    'nibuild_spec_no_output_artifacts.yaml': require('../../resources/oci/nibuild_spec_no_output_artifacts.yaml.handlebars'),
    'nibuild_spec.yaml': require('../../resources/oci/nibuild_spec.yaml.handlebars'),
    'oke_configmap.yaml': require('../../resources/oci/oke_configmap.yaml.handlebars'),
    'oke_deploy_config.yaml': require('../../resources/oci/oke_deploy_config.yaml.handlebars'),
    'oke_pod_deletion.yaml': require('../../resources/oci/oke_pod_deletion.yaml.handlebars'),
    'oke_secret_rotation_cronjob.yaml': require('../../resources/oci/oke_secret_rotation_cronjob.yaml.handlebars'),
    'create_secret_service_account.yaml': require('../../resources/oci/create_secret_service_account.yaml.handlebars'),
};