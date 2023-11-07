import { BuildTool, Feature, ProjectDescription } from '../../../../../Common/types';
import { AbstractTestDescriptor } from '../../../../../Common/abstractTestDescriptor';
import * as help from '../../../../../Common/testHelper';
export class TestDescriptor extends AbstractTestDescriptor {
  constructor() {
    super(__dirname);
  }
  descriptions: ProjectDescription[] = [
    help.genProj(BuildTool.Maven, [Feature.OBJECTSTORE]),
    //help.copProj(path.resolve(this.directory, 'test-projects', 'MyTest')),
  ];
  public getProjectsPath = () => '';
}
