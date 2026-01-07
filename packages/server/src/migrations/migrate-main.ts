// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { FileBuilder } from '@medplum/core';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Client } from 'pg';
import * as semver from 'semver';
import type { BuildMigrationOptions } from './migrate';
import {
  generateMigrationActions,
  buildSchema,
  indexStructureDefinitionsAndSearchParameters,
  writePreDeployActionsToBuilder,
  writePostDeployActionsToBuilder,
} from './migrate';
import packageJson from '../../package.json';

export const SCHEMA_DIR = resolve('./src/migrations/schema');
export const DATA_DIR = resolve('./src/migrations/data');

export async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dryRun');

  indexStructureDefinitionsAndSearchParameters();

  const dbClient = new Client({
    host: 'localhost',
    port: 5432,
    database: 'medplum',
    user: 'medplum',
    password: 'medplum',
  });
  const options: BuildMigrationOptions = {
    dbClient,
    dropUnmatchedIndexes: process.argv.includes('--dropUnmatchedIndexes'),
    analyzeResourceTables: process.argv.includes('--analyzeResourceTables'),
    writeSchema: process.argv.includes('--writeSchema'),
    skipMigration: process.argv.includes('--skipMigration'),
  };

  if (!options.skipMigration) {
    await dbClient.connect();
    const actions = await generateMigrationActions(options);
    await dbClient.end();

    if (actions.preDeploy.length) {
      const preDeployBuilder = new FileBuilder();
      writePreDeployActionsToBuilder(preDeployBuilder, actions.preDeploy);

      if (dryRun) {
        console.log(preDeployBuilder.toString());
      } else {
        writeFileSync(`${SCHEMA_DIR}/v${getNextVersion(SCHEMA_DIR)}.ts`, preDeployBuilder.toString(), 'utf8');
        rewriteMigrationExports(SCHEMA_DIR);
      }
    }

    if (actions.postDeploy.length) {
      const postDeployBuilder = new FileBuilder();
      writePostDeployActionsToBuilder(postDeployBuilder, actions.postDeploy);

      if (dryRun) {
        console.log(postDeployBuilder.toString());
      } else {
        const id = `v${getNextVersion(DATA_DIR)}`;
        writeFileSync(`${DATA_DIR}/${id}.ts`, postDeployBuilder.toString(), 'utf8');
        rewriteMigrationExports(DATA_DIR);
        addDataMigrationToManifest(id);
      }
    }
  }

  if (options.writeSchema) {
    const schemaBuilder = new FileBuilder();
    buildSchema(schemaBuilder);
    if (dryRun) {
      console.log(schemaBuilder.toString());
    } else {
      writeFileSync(`${SCHEMA_DIR}/schema.sql`, schemaBuilder.toString(), 'utf8');
    }
  }
}

function getNextVersion(dir: string = SCHEMA_DIR): number {
  const [lastVersion] = getMigrationFilenames(dir)
    .map(getVersionFromFilename)
    .sort((a, b) => b - a);

  return lastVersion + 1;
}

function rewriteMigrationExports(dir: string): void {
  const b = new FileBuilder();
  b.append(
    '// organize-imports-ignore - https://github.com/simonhaenisch/prettier-plugin-organize-imports?tab=readme-ov-file#skip-files'
  );
  b.newLine();
  const filenamesWithoutExt = getMigrationFilenames(dir)
    .map(getVersionFromFilename)
    .sort((a, b) => a - b)
    .map((version) => `v${version}`);
  for (const filename of filenamesWithoutExt) {
    b.append(`export * as ${filename} from './${filename}';`);
    if (filename === 'v9') {
      b.append('/* CAUTION: LOAD-BEARING COMMENT */');
      b.append(
        '/* This comment prevents auto-organization of imports in VSCode which would break the numeric ordering of the migrations. */'
      );
    }
  }
  writeFileSync(`${dir}/index.ts`, b.toString(), { flag: 'w' });
}

export function addDataMigrationToManifest(version: string): void {
  const path = join(DATA_DIR, 'data-version-manifest.json');
  const manifest = JSON.parse(readFileSync(path, 'utf8'));
  manifest[version] = { serverVersion: semver.inc(packageJson.version, 'patch') };
  writeFileSync(path, JSON.stringify(manifest, null, 2) + '\n');
}

function getMigrationFilenames(dir: string = SCHEMA_DIR): string[] {
  return readdirSync(dir).filter((filename) => /^v\d+\.ts$/.test(filename));
}

function getVersionFromFilename(filename: string): number {
  return Number.parseInt(filename.replace('v', '').replace('.ts', ''), 10);
}

if (import.meta.main) {
  main().catch((reason) => {
    console.error(reason);
    process.exit(1);
  });
}
