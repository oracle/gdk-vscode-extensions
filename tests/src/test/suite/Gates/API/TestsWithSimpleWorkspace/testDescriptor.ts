import { ProjectDescription, BuildTool, Feature } from '../../../../../Common/types';
import { AbstractTestDescriptor } from '../../../../../Common/abstractTestDescriptor';
import * as help from '../../../../../Common/helpers';
export class TestDescriptor extends AbstractTestDescriptor {
    constructor() { super(__dirname); }
    descriptions: ProjectDescription[] = [help.genProj(BuildTool.Maven, [Feature.OBJECTSTORE])];
}