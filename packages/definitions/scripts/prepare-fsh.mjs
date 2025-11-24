// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
/* eslint-disable no-console */

import { copyFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Copy shared sushi-config.yaml to profile directory before running SUSHI
const configSource = resolve(__dirname, '../src/fsh/sushi-config.yaml');
const configDest = resolve(__dirname, '../src/fsh/medplum-base-subscription/sushi-config.yaml');
copyFileSync(configSource, configDest);
console.log('Copied shared sushi-config.yaml to profile directory');

