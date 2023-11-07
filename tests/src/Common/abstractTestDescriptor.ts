import path from "path";
import * as fs from 'fs';
import { ProjectDescription } from './types';
import { copyProject } from './helpers';

export abstract class AbstractTestDescriptor {
    readonly directory: string;
    readonly projPath: string;
    descriptions: ProjectDescription[] = [];
    environment: Record<string, string> = {};
    constructor(directory: string) {
        this.directory = directory;
        this.projPath = path.join(this.directory, 'projects');
    }

    public async clean() {
        fs.rmSync(this.projPath, { recursive: true, force: true });
    }

    public getProjectDescriptions(): ProjectDescription[] { return this.descriptions; }

    public getProjectEnvironment(): Record<string, string> { return this.environment; }

    public async createProjects() {
        const generator = require('./project-generator');
        for (const desc of this.getProjectDescriptions())
            if (desc._type === "generated")
                await generator.createGcnProject(desc.buildTool, desc.features, this.projPath, desc.java)
            else if (desc._type === 'copied')
                await copyProject(desc, this.projPath);
    }
}