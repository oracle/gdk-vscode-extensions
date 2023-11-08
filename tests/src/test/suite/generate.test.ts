/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as path from 'path';
import { getDescriptors } from '../../Common/helpers';

suite('Creating projects', function () {
  this.timeout(0);
  generate('API');
  generate('UI');
});

async function generate(target: string) {
  let descs = getDescriptors(path.join(__dirname, 'Gates', target));
  test(
    `Generating ${target} Projects: ` + descs.map((d) => d.getProjectDescriptions().length).reduce((n1, n2) => n1 + n2),
    async () => {
      for (const desc of descs) await desc.createProjects();
    },
  );
}
