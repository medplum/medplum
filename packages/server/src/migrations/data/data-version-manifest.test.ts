// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as dataMigrations from './index';

const dataMigrationsDir = dirname(fileURLToPath(import.meta.url));

describe('Data version manifest', () => {
  test('Manifest should be consistent with data migrations', async () => {
    const migrations = Object.keys(dataMigrations);
    const file = await readFile(join(dataMigrationsDir, 'data-version-manifest.json'), 'utf8');
    const manifest = JSON.parse(file);
    const manifestEntries = Object.keys(manifest);

    expect(migrations.length).toStrictEqual(manifestEntries.length);
    expect(migrations).toStrictEqual(expect.arrayContaining(manifestEntries));
  });
});
