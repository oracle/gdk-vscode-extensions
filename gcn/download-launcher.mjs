/*
 * Copyright (c) 2022, 2024, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import { fileURLToPath } from 'url';
import fs from "fs";
import https from "https";
import path from "path";

const defaultLauncherVersion = 'v4.7.3.2';
const defaultBucketUrl = 'https://objectstorage.us-phoenix-1.oraclecloud.com/n/oraclelabs/b/gcn-js-files';

const launcherVersion = process.env['GDK_LAUNCHER_VERSION'] || defaultLauncherVersion;
const bucketURL = process.env['GDK_LAUNCHER_BUCKET_URL'] || defaultBucketUrl;

const filename = "cloud.graal.gdk.ui.api-single.js";
const fileBucketPath = encodeURIComponent(`${launcherVersion}/${filename}`);

const filePath= fileURLToPath(import.meta.url);
const dirname = path.dirname(filePath);

const fileUrl = `${bucketURL}/o/${fileBucketPath}`;
const dest = path.join(dirname, 'lib', filename);

if (fs.existsSync(dest)) {
  console.log("File already exist, skipping...");
} else {
  const libDir = path.join(dirname, 'lib');
  if (!fs.existsSync(libDir)) {
    fs.mkdirSync(path.join(dirname, 'lib'));
  }
  const file = fs.createWriteStream(dest);
  console.log("Downloading file...");
  https.get(fileUrl, (response) => {
    response.pipe(file);
    file.on("finish", () => {
      file.close(() => console.log("Download complete."));
    });
  }).on("error", (err) => {
    console.error(`Download failed: ${err.message}`);
    process.exit(1);
  });
}

