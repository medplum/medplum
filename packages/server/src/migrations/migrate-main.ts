// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { FileBuilder } from '@medplum/core';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Client } from 'pg';
import * as semver from 'semver';
import packageJson from '../../package.json';
import { exitAfterStdoutDrain, globalLogger } from '../logger';
import type { BuildMigrationOptions } from './migrate';
import {
  buildSchema,
  generateMigrationActions,
  indexStructureDefinitionsAndSearchParameters,
  writePostDeployActionsToBuilder,
  writePreDeployActionsToBuilder,
} from './migrate';

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
        globalLogger.write(preDeployBuilder.toString());
      } else {
        writeFileSync(`${SCHEMA_DIR}/v${getNextVersion(SCHEMA_DIR)}.ts`, preDeployBuilder.toString(), 'utf8');
        rewriteMigrationExports(SCHEMA_DIR);
      }
    }

    if (actions.postDeploy.length) {
      const postDeployBuilder = new FileBuilder();
      writePostDeployActionsToBuilder(postDeployBuilder, actions.postDeploy);

      if (dryRun) {
        globalLogger.write(postDeployBuilder.toString());
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
      globalLogger.write(schemaBuilder.toString());
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

export function buildMigrationExports(versions: number[]): string {
  const b = new FileBuilder();
  b.append(
    '// organize-imports-ignore - https://github.com/simonhaenisch/prettier-plugin-organize-imports?tab=readme-ov-file#skip-files'
  );
  b.newLine();

  let previousDigits = 0;
  for (const version of versions) {
    const digits = version.toString().length;
    if (previousDigits && digits !== previousDigits) {
      b.append('/* CAUTION: LOAD-BEARING COMMENT */');
      b.append(
        '/* This comment prevents auto-organization of imports in VSCode which would break the numeric ordering of the migrations. */'
      );
    }
    b.append(`export * as v${version} from './v${version}';`);
    previousDigits = digits;
  }

  return b.toString();
}

function rewriteMigrationExports(dir: string): void {
  const versions = getMigrationFilenames(dir)
    .map(getVersionFromFilename)
    .sort((a, b) => a - b);
  writeFileSync(`${dir}/index.ts`, buildMigrationExports(versions), { flag: 'w' });
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

export async function runFromCli(): Promise<void> {
  try {
    await main();
  } catch (reason) {
    globalLogger.error('Migration failed', reason as Error);
    await exitAfterStdoutDrain();
  }
}

if (import.meta.main) {
  // We should never hit the catch block here but we can't do top-level await due to how we transpile to CJS for Jest
  runFromCli().catch(console.error);
}
