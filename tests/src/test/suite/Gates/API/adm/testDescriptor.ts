import { ProjectDescription } from '../../../../../Common/types';
import { AbstractTestDescriptor } from '../../../../../Common/abstractTestDescriptor';
import * as help from '../../../../../Common/helpers';
import path from 'path';
export class TestDescriptor extends AbstractTestDescriptor {
  constructor() {
    super(__dirname);
  }
  descriptions: ProjectDescription[] = [help.copProj(path.join(__dirname, 'project-templates', 'adm', 'oci-adm-g'))];
  environment: Record<string, string> = {
    ADM_SUPPRESS_AUTO_DISPLAY: 'true',
    TEST_ADM_REUSE_PROJECTS: 'true',
  };
}
