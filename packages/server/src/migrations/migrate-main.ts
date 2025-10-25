// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { FileBuilder } from '@medplum/core';
import { readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from 'pg';
import type { BuildMigrationOptions } from './migrate';
import { buildMigration, buildSchema, indexStructureDefinitionsAndSearchParameters } from './migrate';

export const SCHEMA_DIR = resolve('./src/migrations/schema');

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
    skipPostDeployActions: process.argv.includes('--skipPostDeploy'),
    allowPostDeployActions: process.argv.includes('--allowPostDeploy'),
    dropUnmatchedIndexes: process.argv.includes('--dropUnmatchedIndexes'),
    analyzeResourceTables: process.argv.includes('--analyzeResourceTables'),
    writeSchema: process.argv.includes('--writeSchema'),
    skipMigration: process.argv.includes('--skipMigration'),
  };

  if (!options.skipMigration) {
    await dbClient.connect();

    const b = new FileBuilder();
    await buildMigration(b, options);

    await dbClient.end();

    if (dryRun) {
      console.log(b.toString());
    } else {
      writeFileSync(`${SCHEMA_DIR}/v${getNextSchemaVersion()}.ts`, b.toString(), 'utf8');
      rewriteMigrationExports();
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

function getNextSchemaVersion(): number {
  const [lastSchemaVersion] = getMigrationFilenames()
    .map(getVersionFromFilename)
    .sort((a, b) => b - a);

  return lastSchemaVersion + 1;
}

function rewriteMigrationExports(): void {
  const b = new FileBuilder();
  const filenamesWithoutExt = getMigrationFilenames()
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
  writeFileSync(`${SCHEMA_DIR}/index.ts`, b.toString(), { flag: 'w' });
}

function getMigrationFilenames(): string[] {
  return readdirSync(SCHEMA_DIR).filter((filename) => /^v\d+\.ts$/.test(filename));
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
