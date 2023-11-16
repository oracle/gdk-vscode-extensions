/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import path from 'path';
import { ProjectDescription } from './types';

export abstract class AbstractTestDescriptor {
    readonly directory: string;
    public readonly projectsPath: string;
    descriptions: ProjectDescription[] = [];
    environment: Record<string, string> | undefined;
    protected destructive: boolean = true;

    constructor(directory: string) {
        this.directory = directory;
        this.projectsPath = path.join(this.directory, 'projects');
    }

    public getProjectDescriptions(): ProjectDescription[] {
        return this.descriptions;
    }

    public getProjectEnvironment(): Record<string, string> | undefined {
        return this.environment;
    }
    public isDestructive(): boolean {
        return this.destructive;
    }
}
