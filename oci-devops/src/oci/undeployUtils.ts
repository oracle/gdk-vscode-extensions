/*
 * Copyright (c) 2022, 2024, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as identity from 'oci-identity';
import * as devops from 'oci-devops';
import * as devopsServices from '../devopsServices';
import * as dialogs from '../../../common/lib/dialogs';
import * as model from '../model';
import * as projectUtils from '../projectUtils';
import * as logUtils from '../../../common/lib/logUtils';
import * as folderStorage from '../folderStorage';
import * as ociAuthentication from './ociAuthentication';
import * as ociUtils from './ociUtils';
import * as ociServices from './ociServices';
import * as gitUtils from '../gitUtils';


const ACTION_NAME = 'Delete Folder(s) from OCI DevOps Project';

export type UndeployOptions = {
    autoSelectSingleFolder : boolean;
};

export async function undeploy(folders: devopsServices.FolderData[], deployData: any, dump: model.DumpDeployData): Promise<void> {
    logUtils.logInfo('[undeploy] Invoked undeploy folders from OCI');

    const authentication = await ociAuthentication.resolve(ACTION_NAME, deployData.profile);
    if (!authentication) {
        return;
    }
    const configurationProblem = authentication.getConfigurationProblem();
    if (configurationProblem) {
        dialogs.showErrorMessage(configurationProblem);
        return;
    }
    const provider = authentication.getProvider();

    const error: string | undefined = await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Deleting folder(s) from OCI DevOps project',
        cancellable: false
    }, (progress, _token) => {
        return new Promise(async resolve => {
            const projectName = deployData.project?.name;
            let toCheck = false;
            if (deployData.repositories) {
                const repositoriesCnt = deployData.repositories.length;
                for (const repositoryName in deployData.repositories) {
                    const folderData = deployData.repositories[repositoryName];
                    if (folderData) {
                        if (folderData.subs) {
                            for (const subName in folderData.subs) {
                                const subData = folderData.subs[subName];
                                if (subData) {
                                    if (subData.setupSecretForDeployJvmStage) {
                                        try {
                                            progress.report({ message: `Deleting ${subName} docker jvm image setup secret stage for ${repositoryName}...` });
                                            logUtils.logInfo(`[undeploy] Deleting setup secret stage of deployment to OKE pipeline for ${subName} docker jvm image of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                            await ociUtils.deleteDeployStage(provider, subData.setupSecretForDeployJvmStage, true);
                                        } catch (err) {
                                            toCheck = true;
                                        }
                                        delete subData.setupSecretForDeployJvmStage;
                                        dump(deployData);
                                    } else if (subData.setupSecretForDeployJvmStage !== undefined) {
                                        toCheck = true;
                                    }
                                    if (subData.deployJvmToOkeStage) {
                                        try {
                                            progress.report({ message: `Deleting ${subName} docker jvm image deployment to OKE stage for ${repositoryName}...` });
                                            logUtils.logInfo(`[undeploy] Deleting deploy to OKE stage of deployment to OKE pipeline for ${subName} docker jvm image of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                            await ociUtils.deleteDeployStage(provider, subData.deployJvmToOkeStage, true);
                                        } catch (err) {
                                            toCheck = true;
                                        }
                                        delete subData.deployJvmToOkeStage;
                                        dump(deployData);
                                    } else if (subData.deployJvmToOkeStage !== undefined) {
                                        toCheck = true;
                                    }
                                    if (subData.applyConfigMapStage) {
                                        try {
                                            progress.report({ message: `Deleting ${subName} jvm image apply ConfigMap stage for ${repositoryName}...` });
                                            logUtils.logInfo(`[undeploy] Deleting apply ConfigMap stage of deployment to OKE pipeline for ${subName} docker jvm image of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                            await ociUtils.deleteDeployStage(provider, subData.applyConfigMapStage, true);
                                        } catch (err) {
                                            toCheck = true;
                                        }
                                        delete subData.applyConfigMapStage;
                                        dump(deployData);
                                    } else if (subData.applyConfigMapStage !== undefined) {
                                        toCheck = true;
                                    }
                                    if (subData.applyNativeConfigMapStage) {
                                        try {
                                            progress.report({ message: `Deleting ${subName} native image apply ConfigMap stage for ${repositoryName}...` });
                                            logUtils.logInfo(`[undeploy] Deleting apply ConfigMap stage of deployment to OKE pipeline for ${subName} docker jvm image of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                            await ociUtils.deleteDeployStage(provider, subData.applyNativeConfigMapStage, true);
                                        } catch (err) {
                                            toCheck = true;
                                        }
                                        delete subData.applyNativeConfigMapStage;
                                        dump(deployData);
                                    } else if (subData.applyNativeConfigMapStage !== undefined) {
                                        toCheck = true;
                                    }
                                    if (subData.setupSecretForDeployNativeStage) {
                                        try {
                                            progress.report({ message: `Deleting ${subName} docker native executables setup secret stage for ${repositoryName}...` });
                                            logUtils.logInfo(`[undeploy] Deleting setup secret stage of deployment to OKE pipeline for ${subName} docker native executables of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                            await ociUtils.deleteDeployStage(provider, subData.setupSecretForDeployNativeStage, true);
                                        } catch (err) {
                                            toCheck = true;
                                        }
                                        delete subData.setupSecretForDeployNativeStage;
                                        dump(deployData);
                                    } else if (subData.setupSecretForDeployNativeStage !== undefined) {
                                        toCheck = true;
                                    }
                                    if (subData.deployNativeToOkeStage) {
                                        try {
                                            progress.report({ message: `Deleting ${subName} docker native executables deployment to OKE stage for ${repositoryName}...` });
                                            logUtils.logInfo(`[undeploy] Deleting deploy to OKE stage of deployment to OKE pipeline for ${subName} docker native executables of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                            await ociUtils.deleteDeployStage(provider, subData.deployNativeToOkeStage, true);
                                        } catch (err) {
                                            toCheck = true;
                                        }
                                        delete subData.deployNativeToOkeStage;
                                        dump(deployData);
                                    } else if (subData.deployNativeToOkeStage !== undefined) {
                                        toCheck = true;
                                    }
                                }
                            }
                        }
                        if (folderData.setupSecretForDeployJvmStage) {
                            try {
                                progress.report({ message: `Deleting docker jvm image setup secret stage for ${repositoryName}...` });
                                logUtils.logInfo(`[undeploy] Deleting setup secret stage of deployment to OKE pipeline for docker jvm image of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                await ociUtils.deleteDeployStage(provider, folderData.setupSecretForDeployJvmStage, true);
                            } catch (err) {
                                toCheck = true;
                            }
                            delete folderData.setupSecretForDeployJvmStage;
                            dump(deployData);
                        } else if (folderData.setupSecretForDeployJvmStage !== undefined) {
                            toCheck = true;
                        }
                        if (folderData.deployJvmToOkeStage) {
                            try {
                                progress.report({ message: `Deleting docker jvm image deployment to OKE stage for ${repositoryName}...` });
                                logUtils.logInfo(`[undeploy] Deleting deploy to OKE stage of deployment to OKE pipeline for docker jvm image of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                await ociUtils.deleteDeployStage(provider, folderData.deployJvmToOkeStage, true);
                            } catch (err) {
                                toCheck = true;
                            }
                            delete folderData.deployJvmToOkeStage;
                            dump(deployData);
                        } else if (folderData.deployJvmToOkeStage !== undefined) {
                            toCheck = true;
                        }
                        if (folderData.setupSecretForDeployNativeStage) {
                            try {
                                progress.report({ message: `Deleting docker native executables setup secret stage for ${repositoryName}...` });
                                logUtils.logInfo(`[undeploy] Deleting setup secret stage of deployment to OKE pipeline for docker native executables of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                await ociUtils.deleteDeployStage(provider, folderData.setupSecretForDeployNativeStage, true);
                            } catch (err) {
                                toCheck = true;
                            }
                            delete folderData.setupSecretForDeployNativeStage;
                            dump(deployData);
                        } else if (folderData.setupSecretForDeployNativeStage !== undefined) {
                            toCheck = true;
                        }
                        if (folderData.deployNativeToOkeStage) {
                            try {
                                progress.report({ message: `Deleting docker native executables deployment to OKE stage for ${repositoryName}...` });
                                logUtils.logInfo(`[undeploy] Deleting deploy to OKE stage of deployment to OKE pipeline for docker native executables of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                await ociUtils.deleteDeployStage(provider, folderData.deployNativeToOkeStage, true);
                            } catch (err) {
                                toCheck = true;
                            }
                            delete folderData.deployNativeToOkeStage;
                            dump(deployData);
                        } else if (folderData.deployNativeToOkeStage !== undefined) {
                            toCheck = true;
                        }
                    }
                }
                if (toCheck) {
                    try {
                        progress.report({ message: `Deleting docker jvm images and native executables deployment to OKE stages...` });
                        logUtils.logInfo(`[undeploy] Deleting deploy to OKE stages of deployment to OKE pipelines for docker jvm images and native executables of ${deployData.compartment.name}/${projectName}`);
                        await ociUtils.deleteDeployStagesByDeployIDTag(provider, deployData.compartment.ocid, deployData.tag);
                    } catch (err) {
                        resolve(dialogs.getErrorMessage(`Failed to delete docker jvm images and native executables deployment to OKE stages`, err));
                        return;
                    }
                }
                toCheck = false;
                for (const repositoryName in deployData.repositories) {
                    const folderData = deployData.repositories[repositoryName];
                    if (folderData) {
                        if (folderData.subs) {
                            for (const subName in folderData.subs) {
                                const subData = folderData.subs[subName];
                                if (subData) {
                                    if (subData.oke_deployJvmPipeline) {
                                        try {
                                            progress.report({ message: `Deleting ${subName} docker jvm image deployment to OKE pipeline for ${repositoryName}...` });
                                            logUtils.logInfo(`[undeploy] Deleting deployment to OKE pipeline for ${subName} docker jvm image of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                            await ociUtils.deleteDeployPipeline(provider, subData.oke_deployJvmPipeline, true);
                                        } catch (err) {
                                            toCheck = true;
                                        }
                                        delete subData.oke_deployJvmPipeline;
                                        dump(deployData);
                                    } else if (subData.oke_deployJvmPipeline !== undefined) {
                                        toCheck = true;
                                    }
                                    if (subData.oke_deployNativePipeline) {
                                        try {
                                            progress.report({ message: `Deleting ${subName} docker native executables deployment to OKE pipeline for ${repositoryName}...` });
                                            logUtils.logInfo(`[undeploy] Deleting deployment to OKE pipeline for ${subName} docker native executables of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                            await ociUtils.deleteDeployPipeline(provider, subData.oke_deployNativePipeline, true);
                                        } catch (err) {
                                            toCheck = true;
                                        }
                                        delete subData.oke_deployNativePipeline;
                                        dump(deployData);
                                    } else if (subData.oke_deployNativePipeline !== undefined) {
                                        toCheck = true;
                                    }
                                }
                            }
                        }
                        if (folderData.oke_deployJvmPipeline) {
                            try {
                                progress.report({ message: `Deleting docker jvm image deployment to OKE pipeline for ${repositoryName}...` });
                                logUtils.logInfo(`[undeploy] Deleting deployment to OKE pipeline for docker jvm image of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                await ociUtils.deleteDeployPipeline(provider, folderData.oke_deployJvmPipeline, true);
                            } catch (err) {
                                toCheck = true;
                            }
                            delete folderData.oke_deployJvmPipeline;
                            dump(deployData);
                        } else if (folderData.oke_deployJvmPipeline !== undefined) {
                            toCheck = true;
                        }
                        if (folderData.oke_deployNativePipeline) {
                            try {
                                progress.report({ message: `Deleting docker native executables deployment to OKE pipeline for ${repositoryName}...` });
                                logUtils.logInfo(`[undeploy] Deleting deployment to OKE pipeline for docker native executables of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                await ociUtils.deleteDeployPipeline(provider, folderData.oke_deployNativePipeline, true);
                            } catch (err) {
                                toCheck = true;
                            }
                            delete folderData.oke_deployNativePipeline;
                            dump(deployData);
                        } else if (folderData.oke_deployNativePipeline !== undefined) {
                            toCheck = true;
                        }
                    }
                }
                if (toCheck) {
                    try {
                        progress.report({ message: `Deleting docker jvm images and native executables deployment to OKE pipelines...` });
                        logUtils.logInfo(`[undeploy] Deleting deployment to OKE pipelines for docker jvm images and native executables of ${deployData.compartment.name}/${projectName}`);
                        await ociUtils.deleteDeployStagesByDeployIDTag(provider, deployData.compartment.ocid, deployData.tag);
                        await ociUtils.deleteDeployPipelinesByDeployIDTag(provider, deployData.compartment.ocid, deployData.tag);
                    } catch (err) {
                        resolve(dialogs.getErrorMessage(`Failed to delete docker jvm images and native executables deployment to OKE pipelines`, err));
                        return;
                    }
                }
                toCheck = false;
                for (const repositoryName in deployData.repositories) {
                    const folderData = deployData.repositories[repositoryName];
                    if (folderData) {
                        if (folderData.subs) {
                            for (const subName in folderData.subs) {
                                const subData = folderData.subs[subName];
                                if (subData) {
                                    if (subData.docker_jvmbuildPipelineArtifactsStage) {
                                        try {
                                            progress.report({ message: `Deleting ${subName} docker jvm image pipeline artifacts stage for ${repositoryName}...` });
                                            logUtils.logInfo(`[undeploy] Deleting artifacts stage of build pipeline for ${subName} docker jvm image of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                            await ociUtils.deleteBuildPipelineStage(provider, subData.docker_jvmbuildPipelineArtifactsStage, true);
                                        } catch (err) {
                                            toCheck = true;
                                            subData.docker_jvmbuildPipelineBuildStage = false;
                                        }
                                        delete subData.docker_jvmbuildPipelineArtifactsStage;
                                        dump(deployData);
                                    } else if (subData.docker_jvmbuildPipelineArtifactsStage !== undefined) {
                                        toCheck = true;
                                        subData.docker_jvmbuildPipelineBuildStage = false;
                                    }
                                    if (subData.docker_jvmbuildPipelineBuildStage) {
                                        try {
                                            progress.report({ message: `Deleting ${subName} docker jvm image pipeline build stage for ${repositoryName}...` });
                                            logUtils.logInfo(`[undeploy] Deleting build stage of build pipeline for ${subName} docker jvm image of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                            await ociUtils.deleteBuildPipelineStage(provider, subData.docker_jvmbuildPipelineBuildStage, true);
                                        } catch (err) {
                                            toCheck = true;
                                        }
                                        delete subData.docker_jvmbuildPipelineBuildStage;
                                        dump(deployData);
                                    } else if (subData.docker_jvmbuildPipelineBuildStage !== undefined) {
                                        toCheck = true;
                                    }
                                    if (subData.docker_nibuildPipelineArtifactsStage) {
                                        try {
                                            progress.report({ message: `Deleting ${subName} docker native executable pipeline artifacts stage for ${repositoryName}...` });
                                            logUtils.logInfo(`[undeploy] Deleting artifacts stage of build pipeline for ${subName} docker native executable of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                            await ociUtils.deleteBuildPipelineStage(provider, subData.docker_nibuildPipelineArtifactsStage, true);
                                        } catch (err) {
                                            toCheck = true;
                                            subData.docker_nibuildPipelineBuildStage = false;
                                        }
                                        delete subData.docker_nibuildPipelineArtifactsStage;
                                        dump(deployData);
                                    } else if (subData.docker_nibuildPipelineArtifactsStage !== undefined) {
                                        toCheck = true;
                                        subData.docker_nibuildPipelineBuildStage = false;
                                    }
                                    if (subData.docker_nibuildPipelineBuildStage) {
                                        try {
                                            progress.report({ message: `Deleting ${subName} docker native executable pipeline build stage for ${repositoryName}...` });
                                            logUtils.logInfo(`[undeploy] Deleting build stage of build pipeline for ${subName} docker native executable of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                            await ociUtils.deleteBuildPipelineStage(provider, subData.docker_nibuildPipelineBuildStage, true);
                                        } catch (err) {
                                            toCheck = true;
                                        }
                                        delete subData.docker_nibuildPipelineBuildStage;
                                        dump(deployData);
                                    } else if (subData.docker_nibuildPipelineBuildStage !== undefined) {
                                        toCheck = true;
                                    }
                                }
                            }
                        }
                        if (folderData.docker_jvmbuildPipelineArtifactsStage) {
                            try {
                                progress.report({ message: `Deleting docker jvm image pipeline artifacts stage for ${repositoryName}...` });
                                logUtils.logInfo(`[undeploy] Deleting artifacts stage of build pipeline for docker jvm image of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                await ociUtils.deleteBuildPipelineStage(provider, folderData.docker_jvmbuildPipelineArtifactsStage, true);
                            } catch (err) {
                                toCheck = true;
                                folderData.docker_jvmbuildPipelineBuildStage = false;
                            }
                            delete folderData.docker_jvmbuildPipelineArtifactsStage;
                            dump(deployData);
                        } else if (folderData.docker_jvmbuildPipelineArtifactsStage !== undefined) {
                            toCheck = true;
                            folderData.docker_jvmbuildPipelineBuildStage = false;
                        }
                        if (folderData.docker_jvmbuildPipelineBuildStage) {
                            try {
                                progress.report({ message: `Deleting docker jvm image pipeline build stage for ${repositoryName}...` });
                                logUtils.logInfo(`[undeploy] Deleting build stage of build pipeline for docker jvm image of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                await ociUtils.deleteBuildPipelineStage(provider, folderData.docker_jvmbuildPipelineBuildStage, true);
                            } catch (err) {
                                toCheck = true;
                            }
                            delete folderData.docker_jvmbuildPipelineBuildStage;
                            dump(deployData);
                        } else if (folderData.docker_jvmbuildPipelineBuildStage !== undefined) {
                            toCheck = true;
                        }
                        if (folderData.docker_nibuildPipelineArtifactsStage) {
                            try {
                                progress.report({ message: `Deleting docker native executable pipeline artifacts stage for ${repositoryName}...` });
                                logUtils.logInfo(`[undeploy] Deleting artifacts stage of build pipeline for docker native executable of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                await ociUtils.deleteBuildPipelineStage(provider, folderData.docker_nibuildPipelineArtifactsStage, true);
                            } catch (err) {
                                toCheck = true;
                                folderData.docker_nibuildPipelineBuildStage = false;
                            }
                            delete folderData.docker_nibuildPipelineArtifactsStage;
                            dump(deployData);
                        } else if (folderData.docker_nibuildPipelineArtifactsStage !== undefined) {
                            toCheck = true;
                            folderData.docker_nibuildPipelineBuildStage = false;
                        }
                        if (folderData.docker_nibuildPipelineBuildStage) {
                            try {
                                progress.report({ message: `Deleting docker native executable pipeline build stage for ${repositoryName}...` });
                                logUtils.logInfo(`[undeploy] Deleting build stage of build pipeline for docker native executable of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                await ociUtils.deleteBuildPipelineStage(provider, folderData.docker_nibuildPipelineBuildStage, true);
                            } catch (err) {
                                toCheck = true;
                            }
                            delete folderData.docker_nibuildPipelineBuildStage;
                            dump(deployData);
                        } else if (folderData.docker_nibuildPipelineBuildStage !== undefined) {
                            toCheck = true;
                        }
                        if (folderData.nibuildPipelineArtifactsStage) {
                            try {
                                progress.report({ message: `Deleting native executables pipeline artifacts stage for ${repositoryName}...` });
                                logUtils.logInfo(`[undeploy] Deleting artifacts stage of build pipeline for native executables of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                await ociUtils.deleteBuildPipelineStage(provider, folderData.nibuildPipelineArtifactsStage, true);
                            } catch (err) {
                                toCheck = true;
                                folderData.nibuildPipelineBuildStage = false;
                            }
                            delete folderData.nibuildPipelineArtifactsStage;
                            dump(deployData);
                        } else if (folderData.nibuildPipelineArtifactsStage !== undefined) {
                            toCheck = true;
                            folderData.nibuildPipelineBuildStage = false;
                        }
                        if (folderData.nibuildPipelineBuildStage) {
                            try {
                                progress.report({ message: `Deleting native executables pipeline build stage for ${repositoryName}...` });
                                logUtils.logInfo(`[undeploy] Deleting build stage of build pipeline for native executables of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                await ociUtils.deleteBuildPipelineStage(provider, folderData.nibuildPipelineBuildStage, true);
                            } catch (err) {
                                toCheck = true;
                            }
                            delete folderData.nibuildPipelineBuildStage;
                            dump(deployData);
                        } else if (folderData.nibuildPipelineBuildStage !== undefined) {
                            toCheck = true;
                        }
                        if (folderData.devbuildPipelineArtifactsStage) {
                            try {
                                progress.report({ message: `Deleting fat JAR pipeline artifacts stage for ${repositoryName}...` });
                                logUtils.logInfo(`[undeploy] Deleting artifacts stage of build pipeline for fat JARs of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                await ociUtils.deleteBuildPipelineStage(provider, folderData.devbuildPipelineArtifactsStage, true);
                            } catch (err) {
                                toCheck = true;
                                folderData.devbuildPipelineBuildStage = false;
                            }
                            delete folderData.devbuildPipelineArtifactsStage;
                            dump(deployData);
                        } else if (folderData.devbuildPipelineArtifactsStage !== undefined) {
                            toCheck = true;
                            folderData.devbuildPipelineBuildStage = false;
                        }
                        if (folderData.devbuildPipelineBuildStage) {
                            try {
                                progress.report({ message: `Deleting fat JAR pipeline build stage for ${repositoryName}...` });
                                logUtils.logInfo(`[undeploy] Deleting build stage of build pipeline for fat JARs of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                await ociUtils.deleteBuildPipelineStage(provider, folderData.devbuildPipelineBuildStage, true);
                            } catch (err) {
                                toCheck = true;
                            }
                            delete folderData.devbuildPipelineBuildStage;
                            dump(deployData);
                        } else if (folderData.devbuildPipelineBuildStage !== undefined) {
                            toCheck = true;
                        }
                    }
                }
                if (toCheck) {
                    try {
                        progress.report({ message: `Deleting build pipeline stages...` });
                        logUtils.logInfo(`[undeploy] Deleting build pipeline stages of ${deployData.compartment.name}/${projectName}`);
                        await ociUtils.deleteBuildPipelineStagesByDeployIDTag(provider, deployData.compartment.ocid, deployData.tag);
                    } catch (err) {
                        resolve(dialogs.getErrorMessage(`Failed to delete build pipeline stages`, err));
                        return;
                    }
                }
                toCheck = false;
                for (const repositoryName in deployData.repositories) {
                    const folderData = deployData.repositories[repositoryName];
                    if (folderData) {
                        if (folderData.subs) {
                            for (const subName in folderData.subs) {
                                const subData = folderData.subs[subName];
                                if (subData) {
                                    if (subData.docker_jvmbuildPipeline) {
                                        try {
                                            progress.report({ message: `Deleting ${subName} docker jvm image build pipeline for ${repositoryName}...` });
                                            logUtils.logInfo(`[undeploy] Deleting build pipeline for ${subName} docker jvm image of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                            await ociUtils.deleteBuildPipeline(provider, subData.docker_jvmbuildPipeline, true);
                                        } catch (err) {
                                            toCheck = true;
                                        }
                                        delete subData.docker_jvmbuildPipeline;
                                        dump(deployData);
                                    } else if (subData.docker_jvmbuildPipeline !== undefined) {
                                        toCheck = true;
                                    }
                                    if (subData.docker_nibuildPipeline) {
                                        try {
                                            progress.report({ message: `Deleting ${subName} docker native executable build pipeline for ${repositoryName}...` });
                                            logUtils.logInfo(`[undeploy] Deleting build pipeline for ${subName} docker native executable of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                            await ociUtils.deleteBuildPipeline(provider, subData.docker_nibuildPipeline, true);
                                        } catch (err) {
                                            toCheck = true;
                                        }
                                        delete subData.docker_nibuildPipeline;
                                        dump(deployData);
                                    } else if (subData.docker_nibuildPipeline !== undefined) {
                                        toCheck = true;
                                    }
                                }
                            }
                        }
                        if (folderData.docker_jvmbuildPipeline) {
                            try {
                                progress.report({ message: `Deleting docker jvm image build pipeline for ${repositoryName}...` });
                                logUtils.logInfo(`[undeploy] Deleting build pipeline for docker jvm image of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                await ociUtils.deleteBuildPipeline(provider, folderData.docker_jvmbuildPipeline, true);
                            } catch (err) {
                                toCheck = true;
                            }
                            delete folderData.docker_jvmbuildPipeline;
                            dump(deployData);
                        } else if (folderData.docker_jvmbuildPipeline !== undefined) {
                            toCheck = true;
                        }
                        if (folderData.docker_nibuildPipeline) {
                            try {
                                progress.report({ message: `Deleting docker native executable build pipeline for ${repositoryName}...` });
                                logUtils.logInfo(`[undeploy] Deleting build pipeline for docker native executable of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                await ociUtils.deleteBuildPipeline(provider, folderData.docker_nibuildPipeline, true);
                            } catch (err) {
                                toCheck = true;
                            }
                            delete folderData.docker_nibuildPipeline;
                            dump(deployData);
                        } else if (folderData.docker_nibuildPipeline !== undefined) {
                            toCheck = true;
                        }
                        if (folderData.nibuildPipeline) {
                            try {
                                progress.report({ message: `Deleting native executables pipeline for ${repositoryName}...` });
                                logUtils.logInfo(`[undeploy] Deleting build pipeline for native executables of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                await ociUtils.deleteBuildPipeline(provider, folderData.nibuildPipeline, true);
                            } catch (err) {
                                toCheck = true;
                            }
                            delete folderData.nibuildPipeline;
                            dump(deployData);
                        } else if (folderData.nibuildPipeline !== undefined) {
                            toCheck = true;
                        }
                        if (folderData.devbuildPipeline) {
                            try {
                                progress.report({ message: `Deleting fat JAR pipeline for ${repositoryName}...` });
                                logUtils.logInfo(`[undeploy] Deleting build pipeline for fat JARs of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                await ociUtils.deleteBuildPipeline(provider, folderData.devbuildPipeline, true);
                            } catch (err) {
                                toCheck = true;
                            }
                            delete folderData.devbuildPipeline;
                            dump(deployData);
                        } else if (folderData.devbuildPipeline !== undefined) {
                            toCheck = true;
                        }
                    }
                }
                if (toCheck) {
                    try {
                        progress.report({ message: `Deleting build pipelines...` });
                        logUtils.logInfo(`[undeploy] Deleting build pipelines of ${deployData.compartment.name}/${projectName}`);
                        await ociUtils.deleteBuildPipelineStagesByDeployIDTag(provider, deployData.compartment.ocid, deployData.tag);
                        await ociUtils.deleteBuildPipelinesByDeployIDTag(provider, deployData.compartment.ocid, deployData.tag);
                    } catch (err) {
                        resolve(dialogs.getErrorMessage(`Failed to delete build pipelines`, err));
                        return;
                    }
                }
                toCheck = false;
                for (const repositoryName in deployData.repositories) {
                    const folderData = deployData.repositories[repositoryName];
                    if (folderData) {
                        if (folderData.subs) {
                            for (const subName in folderData.subs) {
                                const subData = folderData.subs[subName];
                                if (subData) {
                                    if (subData.oke_configMapArtifact) {
                                        try {
                                            progress.report({ message: `Deleting OKE ConfigMap artifact for ${subName} of ${repositoryName}...` });
                                            logUtils.logInfo(`[undeploy] Deleting OKE ConfigMap artifact for ${subName} of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                            await ociUtils.deleteDeployArtifact(provider, subData.oke_configMapArtifact, true);
                                        } catch (err) {
                                            toCheck = true;
                                        }
                                        delete subData.oke_configMapArtifact;
                                        dump(deployData);
                                    } else if (subData.oke_configMapArtifact !== undefined) {
                                        toCheck = true;
                                    }
                                    if (subData.oke_deployJvmConfigArtifact) {
                                        try {
                                            progress.report({ message: `Deleting OKE jvm deployment configuration artifact for ${subName} of ${repositoryName}...` });
                                            logUtils.logInfo(`[undeploy] Deleting OKE jvm deployment configuration artifact for ${subName} of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                            await ociUtils.deleteDeployArtifact(provider, subData.oke_deployJvmConfigArtifact, true);
                                        } catch (err) {
                                            toCheck = true;
                                        }
                                        delete subData.oke_deployJvmConfigArtifact;
                                        dump(deployData);
                                    } else if (subData.oke_deployJvmConfigArtifact !== undefined) {
                                        toCheck = true;
                                    }
                                    if (subData.oke_deployNativeConfigArtifact) {
                                        try {
                                            progress.report({ message: `Deleting OKE native deployment configuration artifact for ${subName} of ${repositoryName}...` });
                                            logUtils.logInfo(`[undeploy] Deleting OKE native deployment configuration artifact for ${subName} of ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                            await ociUtils.deleteDeployArtifact(provider, subData.oke_deployNativeConfigArtifact, true);
                                        } catch (err) {
                                            toCheck = true;
                                        }
                                        delete subData.oke_deployNativeConfigArtifact;
                                        dump(deployData);
                                    } else if (subData.oke_deployNativeConfigArtifact !== undefined) {
                                        toCheck = true;
                                    }
                                    if (subData.docker_jvmbuildArtifact) {
                                        try {
                                            progress.report({ message: `Deleting ${subName} docker jvm image artifact for ${repositoryName}...` });
                                            logUtils.logInfo(`[undeploy] Deleting ${subName} docker jvm image artifact for ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                            await ociUtils.deleteDeployArtifact(provider, subData.docker_jvmbuildArtifact, true);
                                        } catch (err) {
                                            toCheck = true;
                                        }
                                        delete subData.docker_jvmbuildArtifact;
                                        dump(deployData);
                                    } else if (subData.docker_jvmbuildArtifact !== undefined) {
                                        toCheck = true;
                                    }
                                    if (subData.docker_nibuildArtifact) {
                                        try {
                                            progress.report({ message: `Deleting ${subName} docker native executable artifact for ${repositoryName}...` });
                                            logUtils.logInfo(`[undeploy] Deleting ${subName} docker native executable artifact for ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                            await ociUtils.deleteDeployArtifact(provider, subData.docker_nibuildArtifact, true);
                                        } catch (err) {
                                            toCheck = true;
                                        }
                                        delete subData.docker_nibuildArtifact;
                                        dump(deployData);
                                    } else if (subData.docker_nibuildArtifact !== undefined) {
                                        toCheck = true;
                                    }
                                    if (subData.jvmContainerRepository) {
                                        const containerRepositoryName = repositoriesCnt > 1 ? `${projectName}-${repositoryName}-${subName}-jvm` : `${projectName}-${subName}-jvm`;
                                        try {
                                            progress.report({ message: `Deleting jvm container repository ${containerRepositoryName}...` });
                                            logUtils.logInfo(`[undeploy] Deleting jvm container repository for ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                            await ociUtils.deleteContainerRepository(provider, subData.jvmContainerRepository, true);
                                        } catch (err) {
                                            resolve(dialogs.getErrorMessage(`Failed to delete jvm container repository ${containerRepositoryName}`, err));
                                            return;
                                        }
                                        delete subData.jvmContainerRepository;
                                        dump(deployData);
                                    }
                                    if (subData.nativeContainerRepository) {
                                        const containerRepositoryName = repositoriesCnt > 1 ? `${projectName}-${repositoryName}-${subName}` : `${projectName}-${subName}`;
                                        try {
                                            progress.report({ message: `Deleting native container repository ${containerRepositoryName}...` });
                                            logUtils.logInfo(`[undeploy] Deleting native container repository for ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                            await ociUtils.deleteContainerRepository(provider, subData.nativeContainerRepository, true);
                                        } catch (err) {
                                            resolve(dialogs.getErrorMessage(`Failed to delete native container repository ${containerRepositoryName}`, err));
                                            return;
                                        }
                                        delete subData.nativeContainerRepository;
                                        dump(deployData);
                                    }
                                    if (Object.keys(subData).length === 0) {
                                        delete folderData.subs[subName];
                                        dump(deployData);
                                    }
                                }
                            }
                        }
                        if (folderData.oke_configMapArtifact) {
                            try {
                                progress.report({ message: `Deleting OKE ConfigMap artifact for ${repositoryName}...` });
                                logUtils.logInfo(`[undeploy] Deleting OKE ConfigMap artifact for ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                await ociUtils.deleteDeployArtifact(provider, folderData.oke_oke_configMapArtifact, true);
                            } catch (err) {
                                toCheck = true;
                            }
                            delete folderData.oke_configMapArtifact;
                            dump(deployData);
                        } else if (folderData.oke_configMapArtifact !== undefined) {
                            toCheck = true;
                        }
                        if (folderData.oke_deployJvmConfigArtifact) {
                            try {
                                progress.report({ message: `Deleting OKE jvm deployment configuration artifact for ${repositoryName}...` });
                                logUtils.logInfo(`[undeploy] Deleting OKE jvm deployment configuration artifact for ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                await ociUtils.deleteDeployArtifact(provider, folderData.oke_deployJvmConfigArtifact, true);
                            } catch (err) {
                                toCheck = true;
                            }
                            delete folderData.oke_deployJvmConfigArtifact;
                            dump(deployData);
                        } else if (folderData.oke_deployJvmConfigArtifact !== undefined) {
                            toCheck = true;
                        }
                        if (folderData.oke_deployNativeConfigArtifact) {
                            try {
                                progress.report({ message: `Deleting OKE native deployment configuration artifact for ${repositoryName}...` });
                                logUtils.logInfo(`[undeploy] Deleting OKE native deployment configuration artifact for ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                await ociUtils.deleteDeployArtifact(provider, folderData.oke_deployNativeConfigArtifact, true);
                            } catch (err) {
                                toCheck = true;
                            }
                            delete folderData.oke_deployNativeConfigArtifact;
                            dump(deployData);
                        } else if (folderData.oke_deployNativeConfigArtifact !== undefined) {
                            toCheck = true;
                        }
                        if (folderData.oke_podDeletionCommandArtifact) {
                            try {
                                progress.report({ message: `Deleting OKE pod deletion command spec artifact for ${repositoryName}...` });
                                logUtils.logInfo(`[undeploy] Deleting OKE pod deletion command spec artifact for ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                await ociUtils.deleteDeployArtifact(provider, folderData.oke_podDeletionCommandArtifact, true);
                            } catch (err) {
                                toCheck = true;
                            }
                            delete folderData.oke_podDeletionCommandArtifact;
                            dump(deployData);
                        } else if (folderData.oke_podDeletionCommandArtifact !== undefined) {
                            toCheck = true;
                        }
                        if (folderData.docker_jvmbuildArtifact) {
                            try {
                                progress.report({ message: `Deleting docker jvm image artifact for ${repositoryName}...` });
                                logUtils.logInfo(`[undeploy] Deleting docker jvm image artifact for ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                await ociUtils.deleteDeployArtifact(provider, folderData.docker_jvmbuildArtifact, true);
                            } catch (err) {
                                toCheck = true;
                            }
                            delete folderData.docker_jvmbuildArtifact;
                            dump(deployData);
                        } else if (folderData.docker_jvmbuildArtifact !== undefined) {
                            toCheck = true;
                        }
                        if (folderData.docker_nibuildArtifact) {
                            try {
                                progress.report({ message: `Deleting docker native executable artifact for ${repositoryName}...` });
                                logUtils.logInfo(`[undeploy] Deleting docker native executable artifact for ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                await ociUtils.deleteDeployArtifact(provider, folderData.docker_nibuildArtifact, true);
                            } catch (err) {
                                toCheck = true;
                            }
                            delete folderData.docker_nibuildArtifact;
                            dump(deployData);
                        } else if (folderData.docker_nibuildArtifact !== undefined) {
                            toCheck = true;
                        }
                        if (folderData.jvmContainerRepository) {
                            const containerRepositoryName = repositoriesCnt > 1 ? `${projectName}-${repositoryName}-jvm` : `${projectName}-jvm`;
                            try {
                                progress.report({ message: `Deleting jvm container repository ${containerRepositoryName}...` });
                                logUtils.logInfo(`[undeploy] Deleting jvm container repository for ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                await ociUtils.deleteContainerRepository(provider, folderData.jvmContainerRepository, true);
                            } catch (err) {
                                resolve(dialogs.getErrorMessage(`Failed to delete jvm container repository ${containerRepositoryName}`, err));
                                return;
                            }
                            delete folderData.jvmContainerRepository;
                            dump(deployData);
                        }
                        if (folderData.nativeContainerRepository) {
                            const containerRepositoryName = repositoriesCnt > 1 ? `${projectName}-${repositoryName}` : projectName;
                            try {
                                progress.report({ message: `Deleting native container repository ${containerRepositoryName}...` });
                                logUtils.logInfo(`[undeploy] Deleting native container repository for ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                await ociUtils.deleteContainerRepository(provider, folderData.nativeContainerRepository, true);
                            } catch (err) {
                                resolve(dialogs.getErrorMessage(`Failed to delete native container repository ${containerRepositoryName}`, err));
                                return;
                            }
                            delete folderData.nativeContainerRepository;
                            dump(deployData);
                        }
                        if (folderData.nibuildArtifact) {
                            try {
                                progress.report({ message: `Deleting native executable artifact for ${repositoryName}...` });
                                logUtils.logInfo(`[undeploy] Deleting native executable artifact for ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                await ociUtils.deleteDeployArtifact(provider, folderData.nibuildArtifact, true);
                            } catch (err) {
                                toCheck = true;
                            }
                            delete folderData.nibuildArtifact;
                            dump(deployData);
                        } else if (folderData.nibuildArtifact !== undefined) {
                            toCheck = true;
                        }
                        if (folderData.devbuildArtifact) {
                            try {
                                progress.report({ message: `Deleting fat JAR artifact for ${repositoryName}...` });
                                logUtils.logInfo(`[undeploy] Deleting fat JAR artifact for ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                await ociUtils.deleteDeployArtifact(provider, folderData.devbuildArtifact, true);
                            } catch (err) {
                                toCheck = true;
                            }
                            delete folderData.devbuildArtifact;
                            dump(deployData);
                        } else if (folderData.devbuildArtifact !== undefined) {
                            toCheck = true;
                        }
                    }
                }
                if (toCheck) {
                    try {
                        progress.report({ message: `Deleting artifacts...` });
                        logUtils.logInfo(`[undeploy] Deleting artifacts of ${deployData.compartment.name}/${projectName}`);
                        await ociUtils.deleteDeployArtifactsByDeployIDTag(provider, deployData.compartment.ocid, deployData.tag);
                    } catch (err) {
                        resolve(dialogs.getErrorMessage(`Failed to delete artifacts`, err));
                        return;
                    }
                }
                toCheck = false;
                for (const repositoryName in deployData.repositories) {
                    const folderData = deployData.repositories[repositoryName];
                    if (folderData) {
                        if (folderData.codeRepository) {
                            try {
                                progress.report({ message: `Deleting source code repository for ${repositoryName}...` });
                                logUtils.logInfo(`[undeploy] Deleting source code repository ${deployData.compartment.name}/${projectName}/${repositoryName}`);
                                await ociUtils.deleteCodeRepository(provider, folderData.codeRepository, true);
                            } catch (err) {
                                toCheck = true;
                            }
                            delete folderData.codeRepository;
                            dump(deployData);
                        } else if (folderData.codeRepository !== undefined) {
                            toCheck = true;
                        }
                        if (Object.keys(folderData).length === 0) {
                            delete deployData.repositories[repositoryName];
                            dump(deployData);
                        }
                    }
                    const folder = folders.find(f => removeSpaces(f.folder.name) === repositoryName);
                    if (folder) {
                        const folderPath = folder.folder.uri.fsPath;
                        const configPath = path.join(folderPath, folderStorage.getDefaultLocation());
                        if (fs.existsSync(configPath)) {
                            progress.report({ message : `Deleting OCI DevOps registration ${configPath}` });
                            logUtils.logInfo(`[undeploy] Deleting OCI DevOps registration ${configPath}`);
                            fs.unlinkSync(configPath);
                        }
                        const resourcesDirPath = path.join(folderPath, projectUtils.getDevOpsResourcesDir());
                        if (fs.existsSync(resourcesDirPath)) {
                            progress.report({ message : `Deleting local OCI DevOps resources at ${resourcesDirPath}` });
                            logUtils.logInfo(`[undeploy] Deleting local OCI devops resources at ${resourcesDirPath}`);
                            fs.rmdirSync(resourcesDirPath, { recursive : true });
                        }
                        const gitDirPath = path.join(folderPath, '.git');
                        if (fs.existsSync(gitDirPath)) {
                            progress.report({ message: `Deleting local GIT repository at ${gitDirPath}`});
                            logUtils.logInfo(`[undeploy] Deleting local GIT repository at ${gitDirPath}`);
                            let u = vscode.Uri.file(gitDirPath);
                            await vscode.workspace.fs.delete(u, { recursive: true, useTrash: false });
                            await gitUtils.closeRepository(vscode.Uri.file(folderPath));
                        }
                    }
                }
                if (toCheck) {
                    try {
                        progress.report({ message: `Deleting source code repositories...` });
                        logUtils.logInfo(`[undeploy] Deleting source code repositories of ${deployData.compartment.name}/${projectName}`);
                        await ociUtils.deleteCodeRepositoriesByDeployIDTag(provider, deployData.compartment.ocid, deployData.tag);
                    } catch (err) {
                        resolve(dialogs.getErrorMessage(`Failed to delete source code repositories`, err));
                        return;
                    }
                }
            }
            toCheck = false;
            let knowledgeBase;
            if (deployData.knowledgeBaseOCID) {
                knowledgeBase = deployData.knowledgeBaseOCID;
            } else if (deployData.knowledgeBaseWorkRequest) {
                try {
                    knowledgeBase = await ociUtils.admWaitForResourceCompletionStatus(provider, `Knowledge base for project ${projectName}`, deployData.knowledgeBaseWorkRequest);
                } catch (err) {
                    knowledgeBase = undefined;
                }
            }
            if (knowledgeBase) {
                try {
                    progress.report({ message: `Deleting ADM knowledge base for ${projectName}...` });
                    logUtils.logInfo(`[undeploy] Deleting ADM knowledge base for ${deployData.compartment.name}/${projectName}`);
                    const audits = await ociUtils.listVulnerabilityAudits(provider, deployData.compartment.ocid, knowledgeBase);
                    for (const audit of audits) {
                        await ociUtils.deleteVulnerabilityAudit(provider, audit.id, true);
                    }
                    await ociUtils.deleteKnowledgeBase(provider, knowledgeBase, true);
                } catch (err) {
                    toCheck = true;
                }
                if (deployData.knowledgeBaseOCID) {
                    delete deployData.knowledgeBaseOCID;
                }
                if (deployData.knowledgeBaseWorkRequest) {
                    delete deployData.knowledgeBaseWorkRequest;
                }
                dump(deployData);
            } else if (deployData.knowledgeBaseWorkRequest !== undefined) {
                toCheck = true;
            }
            if (toCheck) {
                try {
                    progress.report({ message: `Deleting ADM knowledge bases by deploy tag for ${projectName}...` });
                    logUtils.logInfo(`[undeploy] Deleting ADM knowledge bases by deploy tag for ${deployData.compartment.name}/${projectName}`);
                    await ociUtils.deleteKnowledgeBasesByDeployIDTag(provider, deployData.compartment.ocid, deployData.tag);
                } catch (err) {
                    resolve(dialogs.getErrorMessage('Failed to delete knowledges bases', err));
                    return;
                }
            }
            toCheck = false;
            if (deployData.okeClusterEnvironment) {
                try {
                    progress.report({ message: `Deleting OKE cluster environment for ${projectName}...` });
                    logUtils.logInfo(`[undeploy] Deleting OKE cluster environment for ${deployData.compartment.name}/${projectName}`);
                    await ociUtils.deleteDeployEnvironment(provider, deployData.okeClusterEnvironment, true);
                } catch (err) {
                    toCheck = true;
                }
                delete deployData.okeClusterEnvironment;
                dump(deployData);
            } else if (deployData.okeClusterEnvironment !== undefined) {
                toCheck = true;
            }
            if (toCheck) {
                try {
                    progress.report({ message: `Deleting OKE cluster environments by deploy tag for ${projectName}...` });
                    logUtils.logInfo(`[undeploy] Deleting OKE cluster environments by deploy tag for ${deployData.compartment.name}/${projectName}`);
                    await ociUtils.deleteDeployEnvironmentsByDeployIDTag(provider, deployData.compartment.ocid, deployData.tag);
                } catch (err) {
                    resolve(dialogs.getErrorMessage('Failed to delete OKE cluster environments', err));
                    return;
                }
            }
            toCheck = false;
            if (deployData.artifactsRepository) {
                try {
                    progress.report({ message: `Deleting artifact repository for ${projectName}...` });
                    logUtils.logInfo(`[undeploy] Deleting artifact repository for ${deployData.compartment.name}/${projectName}`);
                    await ociUtils.deleteArtifactsRepository(provider, deployData.compartment.ocid, deployData.artifactsRepository, true);
                } catch (err) {
                    toCheck = true;
                }
                delete deployData.artifactsRepository;
                dump(deployData);
            } else if (deployData.artifactsRepository !== undefined) {
                toCheck = true;
            }
            if (toCheck) {
                try {
                    progress.report({ message: `Deleting artifact repositories by deploy tag for ${projectName}...` });
                    logUtils.logInfo(`[undeploy] Deleting artifact repositories by deploy tag for ${deployData.compartment.name}/${projectName}`);
                    await ociUtils.deleteArtifactsRepositoriesByDeployIDTag(provider, deployData.compartment.ocid, deployData.tag);
                } catch (err) {
                    resolve(dialogs.getErrorMessage('Failed to delete artifact repositories', err));
                    return;
                }
            }
            toCheck = false;
            if (deployData.projectLogWorkRequest) {
                try {
                    progress.report({ message: `Deleting project log for ${projectName}...` });
                    logUtils.logInfo(`[undeploy] Deleting project log for ${deployData.compartment.name}/${projectName}`);
                    const log = await ociUtils.loggingWaitForResourceCompletionStatus(provider, `Log for project ${projectName}`, deployData.projectLogWorkRequest);
                    if (log) {
                        await ociUtils.deleteLog(provider, log, deployData.logGroup, true);
                    }
                } catch (err) {
                    toCheck = true;
                }
                delete deployData.projectLogWorkRequest;
                dump(deployData);
            } else if (deployData.projectLogWorkRequest !== undefined) {
                toCheck = true;
            }
            if (toCheck) {
                try {
                    progress.report({ message: `Deleting project logs by deploy tag for ${projectName}...` });
                    logUtils.logInfo(`[undeploy] Deleting project logs by deploy tag for ${deployData.compartment.name}/${projectName}`);
                    await ociUtils.deleteLogsByDeployIDTag(provider, deployData.logGroup, deployData.tag);
                } catch (err) {
                    resolve(dialogs.getErrorMessage('Failed to delete project logs', err));
                    return;
                }
            }
            toCheck = false;
            if (deployData.project) {
                try {
                    progress.report({ message: `Deleting devops project ${projectName}...` });
                    logUtils.logInfo(`[undeploy] Deleting devops project ${deployData.compartment.name}/${projectName}`);
                    await ociUtils.deleteDevOpsProject(provider, deployData.project.ocid, true);
                } catch (err) {
                    toCheck = true;
                }
            } else if (deployData.project !== undefined) {
                toCheck = true;
            }
            if (toCheck) {
                try {
                    progress.report({ message: `Deleting devops project by deploy tag...` });
                    logUtils.logInfo(`[undeploy] Deleting devops project by deploy tag from ${deployData.compartment.name}`);
                    await ociUtils.deleteDevOpsProjectsByDeployIDTag(provider, deployData.compartment.ocid, deployData.tag);
                } catch (err) {
                    resolve(dialogs.getErrorMessage('Failed to delete devops project', err));
                    return;
                }
            }
            delete deployData.project;
            dump();

            resolve(undefined);
        });
    });

    if (error) {
        dialogs.showErrorMessage(error);
        logUtils.logInfo(`[undeploy] Failed: ${error}`);
    } else {
        logUtils.logInfo(`[undeploy] Devops project successfully deleted`);
    }
}

export async function undeployFolders(folders: devopsServices.FolderData[]) {
    logUtils.logInfo('[undeploy] Invoked undeploy folders');

    const nblsErr = await projectUtils.checkNBLS();
    if (nblsErr) {
        dialogs.showErrorMessage(nblsErr);
        logUtils.logInfo(`[undeploy] ${nblsErr}`);
        return;
    }

    logUtils.logInfo(`[undeploy] Configured to undeploy ${folders.length} folder(s)`);
    for (const folder of folders) {
        try {
            logUtils.logInfo(`[undeploy] Undeploying folder ${folder.folder.uri.fsPath}`);
            await undeployFolder(folder);
            logUtils.logInfo(`[undeploy] Folder ${folder.folder.uri.fsPath} successfully undeployed`);
        } catch (err) {
            dialogs.showErrorMessage(`Failed to delete folder ${folder.folder.name} from an OCI DevOps project`, err);
        }
    }
}

export async function undeployFolder(folder: devopsServices.FolderData) {
    const services = ociServices.findByFolderData(folder);
    if (services.length === 0) {
        logUtils.logInfo(`[undeploy] No services to undeploy for ${folder.folder.name}`);
        return;
    }

    const oci = services[0].getContext();
    const problem = oci.getConfigurationProblem();
    if (problem) {
        dialogs.showErrorMessage(`Cannot delete folder ${folder.folder.name} from an OCI DevOps project: ${problem}`);
        return;
    }

    const authProvider = oci.getProvider();
    const devopsId = oci.getDevOpsProject();
    const compartmentId = oci.getCompartment();

    const repositoryName = folder.folder.name.replace(/\s+/g, '_');

    const data : [devops.models.Project, identity.models.Compartment | undefined, devops.models.RepositorySummary | undefined, boolean] = await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Validating OCI data for folder ${folder.folder.name}`
    }, async (_progress, _token) => {
        const p = await ociUtils.getDevopsProject(authProvider, devopsId);
        const c = await ociUtils.getCompartment(authProvider, compartmentId);
        const reps = await ociUtils.listCodeRepositories(authProvider, devopsId);
        return [p, c, reps.find(repo => repositoryName === repo.name && repo.freeformTags?.devops_tooling_deployID), reps.length === 1];
    });
    if (!data[0]) {
        dialogs.showErrorMessage(`Cannot delete folder ${folder.folder.name} from an OCI DevOps project: Failed to resolve DevOps Project ${devopsId}`);
        return;
    }
    if (!data[1]) {
        dialogs.showErrorMessage(`Cannot delete folder ${folder.folder.name} from an OCI DevOps project: Failed to resolve Compartment ${compartmentId}`);
        return;
    }
    if (!data[2]) {
        dialogs.showErrorMessage(`Cannot delete folder ${folder.folder.name} from an OCI DevOps project: Either failed to resolve Code Repository ${repositoryName} inside DevOps Project ${data[0].name} or the Code Repository resolved was not created from VSCode`);
        return;
    }

    const repositoryId = data[2].id;
    const isLast = data[3];
    const folderPath = folder.folder.uri.fsPath;

    const compartmentLogname = data[1].name;
    const projectLogname = `${compartmentLogname}/${data[0].name}`;
    logUtils.logInfo(`[undeploy] Folder ${folderPath} will be undeployed from ${projectLogname}`);

    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Deleting ${folder.folder.name} from OCI DevOps project`,
        cancellable: false
    }, async (_progress, _token) => {
        _progress.report({message : 'Listing Build Pipelines'});
        logUtils.logInfo(`[undeploy] Listing all build pipelines in ${projectLogname}`);

        const buildPipelines: devops.models.BuildPipelineSummary[] = await ociUtils.listBuildPipelinesByCodeRepository(authProvider, devopsId, repositoryId);
        for (let pipe of buildPipelines) {
            _progress.report({message : `Processing pipeline ${pipe.displayName}`});
            logUtils.logInfo(`[undeploy] Processing build pipeline ${pipe.displayName} in ${projectLogname}`);

            logUtils.logInfo(`[undeploy] Listing stages of build pipeline ${pipe.displayName} in ${projectLogname}`);
            const stages: Array<devops.models.BuildPipelineStageSummary> = await ociUtils.listBuildPipelineStages(authProvider, pipe.id);
            const orderedStages: devops.models.BuildPipelineStageSummary[] = [];
            const id2Stage: Map<string, devops.models.BuildPipelineStageSummary> = new Map();

            // push leaf stages first.
            const revDeps: Map<string, number> = new Map();
            stages.forEach(s => {
                id2Stage.set(s.id, s);
                if (!revDeps.has(s.id)) {
                    revDeps.set(s.id, 0);
                }
                //console.log(`Stage ${s.displayName} has predecessors: ${s.buildPipelineStagePredecessorCollection?.items.map(pred => pred.id).join(', ')}`)
                for (let p of s.buildPipelineStagePredecessorCollection?.items || []) {
                    if (p.id === s.id || p.id === pipe.id) {
                        // ??? Who invented reference-to-owner in predecessors ??
                        continue;
                    }
                    let n = (revDeps.get(p.id) || 0);
                    revDeps.set(p.id, n + 1);
                }
            });

            while (revDeps.size > 0) {
                let found : boolean = false;
                for (let k of revDeps.keys()) {
                    if (revDeps.get(k) === 0) {
                        found = true;
                        const s = id2Stage.get(k);
                        revDeps.delete(k);
                        if (!s) continue;

                        orderedStages.push(s);
                        //console.log(`Add stage ${s.displayName} = ${s.id}`)
                        for (let p of s.buildPipelineStagePredecessorCollection?.items || []) {
                            if (p.id === s.id || p.id === pipe.id) {
                                continue;
                            }
                            let n = (revDeps.get(p.id) || 1);
                            revDeps.set(p.id, n - 1);
                        }
                    }
                }
                if (!found) {
                    throw new Error('Inconsistent pipeline structure!');
                }
            }

            // console.log(`Deleting ${orderedStages.length} stages before deleting ${pipe.displayName}`);
            for (let stage of orderedStages) {
                _progress.report({message : `Deleting stage ${stage.displayName}`});
                logUtils.logInfo(`[undeploy] Deleting stage ${stage.displayName} of build pipeline ${pipe.displayName} in ${projectLogname}`);
                await ociUtils.deleteBuildPipelineStage(authProvider, stage.id, true);
            }
            _progress.report({message : `Deleting pipeline ${pipe.displayName}`});

            // in theory, pipelines are independent, but it seems the delete operation overlaps on the project OCID, so they must be deleted
            // sequentially.
            logUtils.logInfo(`[undeploy] Deleting build pipeline ${pipe.displayName} in ${projectLogname}`);
            await ociUtils.deleteBuildPipeline(authProvider, pipe.id, true);
        };

        _progress.report({message : 'Listing Deploy Pipelines'});
        logUtils.logInfo(`[undeploy] Listing all deployment pipelines in ${projectLogname}`);

        const buildPipelineIds = buildPipelines.map(pipe => pipe.id);
        const deployPipelines: devops.models.DeployPipelineSummary[] = await ociUtils.listDeployPipelines(authProvider, devopsId);
        for (let pipe of deployPipelines) {
            if (pipe.freeformTags?.devops_tooling_buildPipelineOCID && buildPipelineIds.includes(pipe.freeformTags?.devops_tooling_buildPipelineOCID)) {
                _progress.report({message : `Processing pipeline ${pipe.displayName}`});
                logUtils.logInfo(`[undeploy] Listing stages of deployment pipeline ${pipe.displayName} in ${projectLogname}`);
                const stages: devops.models.DeployStageSummary[] = await ociUtils.listDeployStages(authProvider, pipe.id);
                const orderedStages: devops.models.DeployStageSummary[] = [];
                const id2Stage: Map<string, devops.models.DeployStageSummary> = new Map();

                // push leaf stages first.
                const revDeps: Map<string, number> = new Map();
                stages.forEach(s => {
                    id2Stage.set(s.id, s);
                    if (!revDeps.has(s.id)) {
                        revDeps.set(s.id, 0);
                    }
                    // console.log(`Stage ${s.displayName} has predecessors: ${s.deployStagePredecessorCollection?.items.map(pred => pred.id).join(', ')}`)
                    for (let p of s.deployStagePredecessorCollection?.items || []) {
                        if (p.id === s.id || p.id === pipe.id) {
                            // ??? Who invented reference-to-owner in predecessors ??
                            continue;
                        }
                        let n = (revDeps.get(p.id) || 0);
                        revDeps.set(p.id, n + 1);
                    }
                });

                while (revDeps.size > 0) {
                    let found : boolean = false;
                    for (let k of revDeps.keys()) {
                        if (revDeps.get(k) === 0) {
                            found = true;
                            const s = id2Stage.get(k);
                            revDeps.delete(k);
                            if (!s) continue;

                            orderedStages.push(s);
                            //console.log(`Add stage ${s.displayName} = ${s.id}`)
                            for (let p of s.deployStagePredecessorCollection?.items || []) {
                                if (p.id === s.id || p.id === pipe.id) {
                                    continue;
                                }
                                let n = (revDeps.get(p.id) || 1);
                                revDeps.set(p.id, n - 1);
                            }
                        }
                    }
                    if (!found) {
                        throw new Error('Inconsistent pipeline structure!');
                    }
                }

                // console.log(`Deleting ${orderedStages.length} stages before deleting ${pipe.displayName}`);
                for (let stage of orderedStages) {
                    _progress.report({message : `Deleting stage ${stage.displayName}`});
                    logUtils.logInfo(`[undeploy] Deleting stage ${stage.displayName} of deployment pipeline ${pipe.displayName} in ${projectLogname}`);
                    await ociUtils.deleteDeployStage(authProvider, stage.id, true);
                }
                _progress.report({message : `Deleting pipeline ${pipe.displayName}`});

                // in theory, pipelines are independent, but it seems the delete operation overlaps on the project OCID, so they must be deleted
                // sequentially.
                logUtils.logInfo(`[undeploy] Deleting deployment pipeline ${pipe.displayName} in ${projectLogname}`);
                await ociUtils.deleteDeployPipeline(authProvider, pipe.id, true);
            }
        };

        const projectFolder = await projectUtils.getProjectFolder(folder.folder);
        const cloudSubNames = projectUtils.getCloudSpecificSubProjectNames(projectFolder);
        const deployArtifactNames = [
            `${repositoryName}_dev_fatjar`,
            `${repositoryName}_dev_executable`,
            `${repositoryName}_oke_deploy_ni_configuration`,
            `${repositoryName}_oke_deploy_jvm_configuration`,
            `${repositoryName}_oke_configmap`,
            `${repositoryName}_oke_deploy_docker_secret_setup_command`
        ];
        if (cloudSubNames.length) {
            for (const subName of cloudSubNames) {
                deployArtifactNames.push(`${repositoryName}_${subName}_native_docker_image`);
                deployArtifactNames.push(`${repositoryName}_${subName}_jvm_docker_image`);
            }
        } else {
            deployArtifactNames.push(`${repositoryName}_native_docker_image`);
            deployArtifactNames.push(`${repositoryName}_jvm_docker_image`);
        }
        _progress.report({message: 'Listing deploy artifacts'});
        logUtils.logInfo(`[undeploy] Listing all deploy artifacts in ${projectLogname}`);
        let artifacts = await ociUtils.listDeployArtifacts(authProvider, devopsId);
        for (let a of artifacts) {
            if (a.displayName && deployArtifactNames.includes(a.displayName)) {
                _progress.report({ message: `Deleting artifact ${a.displayName}`});
                logUtils.logInfo(`[undeploy] Deleting artifact ${a.displayName} in ${projectLogname}`);
                // seems that deleteArtifact also transaction-conflicts on the project.
                await ociUtils.deleteDeployArtifact(authProvider, a.id, true);
            } else if (a.freeformTags?.devops_tooling_codeRepoResourcesList && a.freeformTags?.devops_tooling_codeRepoID === repositoryId) {
                _progress.report({ message: `Deleting list of automatically generated code repository resources ${a.displayName}`});
                logUtils.logInfo(`[undeploy] Deleting list of automatically generated code repository resources ${a.displayName} in ${repositoryName}`);
                // seems that deleteArtifact also transaction-conflicts on the project.
                await ociUtils.deleteDeployArtifact(authProvider, a.id, true);
            } else if (isLast && a.freeformTags?.devops_tooling_projectResourcesList) {
                _progress.report({ message: `Deleting list of automatically generated project resources ${a.displayName}`});
                logUtils.logInfo(`[undeploy] Deleting list of automatically generated project resources ${a.displayName} in ${projectLogname}`);
                // seems that deleteArtifact also transaction-conflicts on the project.
                await ociUtils.deleteDeployArtifact(authProvider, a.id, true);
            }
        };

        _progress.report({ message: 'Searching container repositories'});
        logUtils.logInfo(`[undeploy] Listing all container repositories in ${compartmentLogname}`);
        const containerRepositories = await ociUtils.listContainerRepositories(authProvider, compartmentId);
        if (containerRepositories) {
            const containerRepositoryNames: string[] = [];
            if (cloudSubNames.length) {
                for (const subName of cloudSubNames) {
                    containerRepositoryNames.push(`${data[0].name}-${repositoryName}-${subName}`.toLowerCase());
                    containerRepositoryNames.push(`${data[0].name}-${repositoryName}-${subName}-jvm`.toLowerCase());
                    if (isLast) {
                        containerRepositoryNames.push(`${data[0].name}-${subName}`.toLowerCase());
                        containerRepositoryNames.push(`${data[0].name}-${subName}-jvm`.toLowerCase());
                    }
                }
            } else {
                containerRepositoryNames.push(`${data[0].name}-${repositoryName}`.toLowerCase());
                containerRepositoryNames.push(`${data[0].name}-${repositoryName}-jvm`.toLowerCase());
                if (isLast) {
                    containerRepositoryNames.push(data[0].name.toLowerCase());
                    containerRepositoryNames.push(`${data[0].name}-jvm`.toLowerCase());
                }
            }
            for (const repo of containerRepositories) {
                if (containerRepositoryNames.includes(repo.displayName)) {
                    _progress.report({message : `Deleting container repository ${repo.displayName}`});
                    logUtils.logInfo(`[undeploy] Deleting container repository ${repo.displayName} in ${compartmentLogname}`);
                    await ociUtils.deleteContainerRepository(authProvider, repo.id, true);
                }
            }
        }

        _progress.report({ message: `Deleting code repository: ${repositoryName}`});
        logUtils.logInfo(`[undeploy] Deleting code repository ${repositoryName} in ${projectLogname}`);
        await ociUtils.deleteCodeRepository(authProvider, repositoryId, true);

        const gitPath = path.join(folderPath, '.git');
        if (fs.existsSync(gitPath)) {
            _progress.report({ message: `Deleting local GIT repository at ${gitPath}`});
            logUtils.logInfo(`[undeploy] Deleting local GIT repository at ${gitPath}`);
            let u = vscode.Uri.file(gitPath);
            await vscode.workspace.fs.delete(u, { recursive: true, useTrash: false });
            await gitUtils.closeRepository(vscode.Uri.file(folderPath));
        }

        if (isLast) {
            _progress.report({message : 'Listing project logs'});
            logUtils.logInfo(`[undeploy] Listing all logs in ${projectLogname}`);
            const logPromises : Promise<any>[] | undefined = (await ociUtils.listLogsByProject(authProvider, compartmentId, devopsId))?.map(l => {
                _progress.report({message : `Deleting log ${l.displayName}`});
                logUtils.logInfo(`[undeploy] Deleting log ${l.displayName} in ${projectLogname}`);
                return ociUtils.deleteLog(authProvider, l.id, l.logGroupId, true);
            });
            if (logPromises) {
                logUtils.logInfo(`[undeploy] Waiting to complete deletion of all logs in ${projectLogname}`);
                await Promise.all(logPromises);
                logUtils.logInfo(`[undeploy] All logs in ${projectLogname} deleted`);
            }

            _progress.report({ message: 'Searching artifact repositories'});
            logUtils.logInfo(`[undeploy] Listing all artifact repositories in ${compartmentLogname}`);
            const artifactsRepositories = await ociUtils.listArtifactRepositories(authProvider, compartmentId);
            if (artifactsRepositories) {
                for (const repo of artifactsRepositories) {
                    if ((repo.freeformTags?.['devops_tooling_projectOCID'] === devopsId)) {
                        _progress.report({message : `Deleting artifact repository ${repo.displayName}`});
                        logUtils.logInfo(`[undeploy] Deleting artifact repository ${repo.displayName} in ${compartmentLogname}`);
                        await ociUtils.deleteArtifactsRepository(authProvider, compartmentId, repo.id, true);
                    }
                }
            }
            _progress.report({ message: 'Searching OKE cluster environments'});
            logUtils.logInfo(`[undeploy] Listing all OKE cluster environments in ${projectLogname}`);
            const okeClusterEnvironments = await ociUtils.listDeployEnvironments(authProvider, devopsId);
            for (const env of okeClusterEnvironments) {
                _progress.report({message : `Deleting OKE cluster environment ${env.displayName}`});
                logUtils.logInfo(`[undeploy] Deleting OKE cluster environment ${env.displayName} in ${projectLogname}`);
                await ociUtils.deleteDeployEnvironment(authProvider, env.id, true);
            }
            // PENDING: knowledgebase search + deletion should be done by the Services Plugin; need API to invoke it on the OCI configuration.
            _progress.report({ message: 'Searching knowledge bases'});
            logUtils.logInfo(`[undeploy] Listing all knowledge bases in ${compartmentLogname}`);
            let knowledgeBases = await ociUtils.listKnowledgeBases(authProvider, compartmentId);
            for (let kb of knowledgeBases) {
                if ((kb.freeformTags?.['devops_tooling_usage'] === 'oci-devops-adm-audit') &&
                    (kb.freeformTags?.['devops_tooling_projectOCID'] === devopsId)) {
                        _progress.report({ message: 'Deleting vulnerability audits'});
                        logUtils.logInfo(`[undeploy] Deleting all vulnerability audits in ${kb.displayName}`);
                        const audits = await ociUtils.listVulnerabilityAudits(authProvider, compartmentId, kb.id);
                        for (const audit of audits) {
                            await ociUtils.deleteVulnerabilityAudit(authProvider, audit.id, true);
                        }
                        _progress.report({message : `Deleting knowledge base ${kb.displayName}`});
                        logUtils.logInfo(`[undeploy] Deleting knowledge base ${kb.displayName} in ${compartmentLogname}`);
                        await ociUtils.deleteKnowledgeBase(authProvider, kb.id, true);
                }
            }
            _progress.report({message : `Deleting project ${data[0].name}`});
            logUtils.logInfo(`[undeploy] Deleting devops project ${projectLogname}`);
            await ociUtils.deleteDevOpsProject(authProvider, devopsId, true);
            logUtils.logInfo(`[undeploy] Devops project ${projectLogname} deleted`);
        }

        const configPath = path.join(folderPath, folderStorage.getDefaultLocation());
        _progress.report({message : `Deleting OCI DevOps registration ${configPath}`});
        logUtils.logInfo(`[undeploy] Deleting OCI DevOps registration ${configPath}`);
        fs.unlinkSync(configPath); 
        const resourcesDirPath = path.join(folderPath, projectUtils.getDevOpsResourcesDir());
        if (fs.existsSync(resourcesDirPath)) {
            _progress.report({message : 'Deleting local OCI DevOps resources'});
            logUtils.logInfo(`[undeploy] Deleting local OCI devops resources in ${resourcesDirPath}`);
            fs.rmdirSync(resourcesDirPath, { recursive : true});
        }
    });
}

function removeSpaces(name: string): string {
    return name.replace(/\s+/g, '_');
}
