// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { FileBuilder } from '@medplum/core';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { Client } from 'pg';
import type { GenerateMigrationResult } from './migrate';
import {
  buildSchema,
  generateSeparatedMigrationActions,
  indexStructureDefinitionsAndSearchParameters,
  writeActionsToBuilder,
  writePostDeployActionsToBuilder,
} from './migrate';

export const SCHEMA_DIR = resolve('./src/migrations/schema');
export const DATA_DIR = resolve('./src/migrations/data');
const MANIFEST_PATH = resolve(DATA_DIR, 'data-version-manifest.json');

interface CliOptions {
  dryRun: boolean;
  yes: boolean;
  preDeployOnly: boolean;
  postDeployOnly: boolean;
  serverVersion: string | undefined;
  dropUnmatchedIndexes: boolean;
  analyzeResourceTables: boolean;
  writeSchema: boolean;
  skipMigration: boolean;
}

function parseCliOptions(): CliOptions {
  const args = process.argv.slice(2);
  return {
    dryRun: args.includes('--dryRun'),
    yes: args.includes('--yes') || args.includes('-y'),
    preDeployOnly: args.includes('--preDeployOnly'),
    postDeployOnly: args.includes('--postDeployOnly'),
    serverVersion: getArgValue(args, '--serverVersion'),
    dropUnmatchedIndexes: args.includes('--dropUnmatchedIndexes'),
    analyzeResourceTables: args.includes('--analyzeResourceTables'),
    writeSchema: args.includes('--writeSchema'),
    skipMigration: args.includes('--skipMigration'),
  };
}

function getArgValue(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx !== -1 && idx + 1 < args.length) {
    return args[idx + 1];
  }
  return undefined;
}

export async function main(): Promise<void> {
  const options = parseCliOptions();

  indexStructureDefinitionsAndSearchParameters();

  if (options.writeSchema) {
    const schemaBuilder = new FileBuilder();
    buildSchema(schemaBuilder);
    if (options.dryRun) {
      console.log(schemaBuilder.toString());
    } else {
      writeFileSync(`${SCHEMA_DIR}/schema.sql`, schemaBuilder.toString(), 'utf8');
      console.log('✓ Schema written to schema.sql');
    }
  }

  if (options.skipMigration) {
    return;
  }

  const dbClient = new Client({
    host: 'localhost',
    port: 5432,
    database: 'medplum',
    user: 'medplum',
    password: 'medplum',
  });

  await dbClient.connect();

  const result = await generateSeparatedMigrationActions({
    dbClient,
    dropUnmatchedIndexes: options.dropUnmatchedIndexes,
    analyzeResourceTables: options.analyzeResourceTables,
  });

  await dbClient.end();

  const hasPreDeploy = result.preDeployActions.length > 0;
  const hasPostDeploy = result.postDeployActions.length > 0;

  if (!hasPreDeploy && !hasPostDeploy) {
    console.log('✓ No migrations needed. Database schema is up to date.');
    return;
  }

  if (hasPreDeploy && !options.postDeployOnly) {
    await handlePreDeployMigration(result, options);
  }

  if (hasPostDeploy && !options.preDeployOnly) {
    await handlePostDeployMigration(result, options);
  }
}

async function handlePreDeployMigration(result: GenerateMigrationResult, options: CliOptions): Promise<void> {
  const version = getNextSchemaVersion();
  const filename = `v${version}.ts`;

  console.log('\n📦 Pre-deploy Migration');
  console.log('═══════════════════════');
  console.log(`Actions: ${result.preDeployActions.length}`);
  console.log(`File: ${SCHEMA_DIR}/${filename}`);

  if (!options.yes) {
    console.log('\nPreview:');
    const previewBuilder = new FileBuilder();
    writeActionsToBuilder(previewBuilder, result.preDeployActions);
    const preview = previewBuilder.toString();
    const lines = preview.split('\n');
    const previewLines = lines.slice(0, Math.min(20, lines.length));
    console.log(previewLines.join('\n'));
    if (lines.length > 20) {
      console.log(`... and ${lines.length - 20} more lines`);
    }

    const confirmed = await promptConfirmation('Generate pre-deploy migration?');
    if (!confirmed) {
      console.log('Skipping pre-deploy migration.');
      return;
    }
  }

  if (options.dryRun) {
    console.log('\n[Dry run] Would write pre-deploy migration:');
    const builder = new FileBuilder();
    writeActionsToBuilder(builder, result.preDeployActions);
    console.log(builder.toString());
  } else {
    const builder = new FileBuilder();
    writeActionsToBuilder(builder, result.preDeployActions);
    writeFileSync(`${SCHEMA_DIR}/${filename}`, builder.toString(), 'utf8');
    rewriteSchemaMigrationExports();
    console.log(`✓ Pre-deploy migration written to ${filename}`);
  }
}

async function handlePostDeployMigration(result: GenerateMigrationResult, options: CliOptions): Promise<void> {
  const version = getNextDataVersion();
  const filename = `v${version}.ts`;

  console.log('\n🚀 Post-deploy Migration');
  console.log('════════════════════════');
  console.log(`Actions: ${result.postDeployActions.length}`);
  console.log(`File: ${DATA_DIR}/${filename}`);
  console.log('\nPost-deploy actions:');
  for (const desc of result.postDeployDescriptions) {
    console.log(`  • ${desc}`);
  }

  let serverVersion = options.serverVersion;
  if (!options.yes && !serverVersion) {
    serverVersion = await promptServerVersion();
  }

  if (!serverVersion) {
    serverVersion = getPackageVersion();
    console.log(`Using current package version: ${serverVersion}`);
  }

  if (!options.yes) {
    console.log('\nPreview:');
    const previewBuilder = new FileBuilder();
    writePostDeployActionsToBuilder(previewBuilder, result.postDeployActions);
    const preview = previewBuilder.toString();
    const lines = preview.split('\n');
    const previewLines = lines.slice(0, Math.min(25, lines.length));
    console.log(previewLines.join('\n'));
    if (lines.length > 25) {
      console.log(`... and ${lines.length - 25} more lines`);
    }

    const confirmed = await promptConfirmation('Generate post-deploy migration?');
    if (!confirmed) {
      console.log('Skipping post-deploy migration.');
      return;
    }
  }

  if (options.dryRun) {
    console.log('\n[Dry run] Would write post-deploy migration:');
    const builder = new FileBuilder();
    writePostDeployActionsToBuilder(builder, result.postDeployActions);
    console.log(builder.toString());
    console.log(`\n[Dry run] Would update data-version-manifest.json with v${version}: serverVersion=${serverVersion}`);
    console.log(`[Dry run] Would update data/index.ts with v${version} export`);
  } else {
    const builder = new FileBuilder();
    writePostDeployActionsToBuilder(builder, result.postDeployActions);
    writeFileSync(`${DATA_DIR}/${filename}`, builder.toString(), 'utf8');
    updateDataVersionManifest(version, serverVersion);
    rewriteDataMigrationExports();
    console.log(`✓ Post-deploy migration written to ${filename}`);
    console.log(`✓ Updated data-version-manifest.json`);
    console.log(`✓ Updated data/index.ts`);
  }
}

// ============================================================================
// Helper utilities
// ============================================================================

function getNextSchemaVersion(): number {
  const versions = getSchemaMigrationFilenames()
    .map(getVersionFromFilename)
    .sort((a, b) => b - a);
  return (versions[0] ?? 0) + 1;
}

function getNextDataVersion(): number {
  const versions = getDataMigrationFilenames()
    .map(getVersionFromFilename)
    .sort((a, b) => b - a);
  return (versions[0] ?? 0) + 1;
}

function getPackageVersion(): string {
  try {
    const packageJson = JSON.parse(readFileSync(resolve('./package.json'), 'utf8'));
    return packageJson.version;
  } catch {
    return '0.0.0';
  }
}

function getSchemaMigrationFilenames(): string[] {
  return readdirSync(SCHEMA_DIR).filter((filename) => /^v\d+\.ts$/.test(filename));
}

function getDataMigrationFilenames(): string[] {
  return readdirSync(DATA_DIR).filter((filename) => /^v\d+\.ts$/.test(filename));
}

function getVersionFromFilename(filename: string): number {
  return Number.parseInt(filename.replace('v', '').replace('.ts', ''), 10);
}

function rewriteSchemaMigrationExports(): void {
  const b = new FileBuilder();
  const versions = getSchemaMigrationFilenames()
    .map(getVersionFromFilename)
    .sort((a, b) => a - b);
  for (const version of versions) {
    b.append(`export * as v${version} from './v${version}';`);
    if (version === 9) {
      b.append('/* CAUTION: LOAD-BEARING COMMENT */');
      b.append(
        '/* This comment prevents auto-organization of imports in VSCode which would break the numeric ordering of the migrations. */'
      );
    }
  }
  writeFileSync(`${SCHEMA_DIR}/index.ts`, b.toString(), { flag: 'w' });
}

function rewriteDataMigrationExports(): void {
  const b = new FileBuilder();
  b.append('// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors');
  b.append('// SPDX-License-Identifier: Apache-2.0');
  const versions = getDataMigrationFilenames()
    .map(getVersionFromFilename)
    .sort((a, b) => a - b);
  for (const version of versions) {
    b.append(`export * as v${version} from './v${version}';`);
    if (version === 9) {
      b.append(
        '/* This comment prevents auto-organization of imports in VSCode which would break the numeric ordering of the migrations. */'
      );
    }
  }
  writeFileSync(`${DATA_DIR}/index.ts`, b.toString(), { flag: 'w' });
}

function updateDataVersionManifest(version: number, serverVersion: string): void {
  let manifest: Record<string, { serverVersion: string; requiredBefore?: string }> = {};
  try {
    manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  } catch {
    // Start fresh if file doesn't exist or is invalid
  }

  manifest[`v${version}`] = { serverVersion };

  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
}

// ============================================================================
// Interactive prompts
// ============================================================================

function createPromptInterface(): ReturnType<typeof createInterface> {
  return createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

async function promptConfirmation(question: string): Promise<boolean> {
  const rl = createPromptInterface();
  return new Promise((resolve) => {
    rl.question(`${question} (y/n) `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

async function promptServerVersion(): Promise<string | undefined> {
  const rl = createPromptInterface();
  const defaultVersion = getPackageVersion();
  return new Promise((resolve) => {
    rl.question(`Server version for manifest (default: ${defaultVersion}): `, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultVersion);
    });
  });
}

if (import.meta.main) {
  main().catch((reason) => {
    console.error(reason);
    process.exit(1);
  });
}
