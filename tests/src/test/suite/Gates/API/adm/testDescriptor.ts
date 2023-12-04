import { ProjectDescription } from '../../../../../Common/types';
import { AbstractTestDescriptor } from '../../../../../Common/abstractTestDescriptor';
import * as help from '../../../../../Common/testHelper';
import path from 'path';
export class TestDescriptor extends AbstractTestDescriptor {
  constructor() {
    super(__dirname);
  }
  descriptions: ProjectDescription[] = [
    help.copProj(path.join('test-projects', 'adm', 'oci-adm-g')),
    help.copProj(path.join('test-projects', 'adm', 'oci-adm-g-simple')),
    help.copProj(path.join('test-projects', 'adm', 'oci-adm-m'))
  ];
  environment: Record<string, string> = {
    ADM_SUPPRESS_AUTO_DISPLAY: 'true'
  };
  protected destructive: boolean = false;
}
