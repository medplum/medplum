// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getReferenceString } from '@medplum/core';
import type { PackageManifest, TargetEnv, ValidationIssue } from '@medplum/package-types';
import { buildPackage, loadManifest, validateManifestObject, validateManifestSource } from '@medplum/package-types';
import { Option } from 'commander';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { publishPackage } from './package-publish';
import { createMedplumClient } from './util/client';
import { addSubcommand, MedplumCommand } from './utils';

const TARGETS: TargetEnv[] = ['local', 'staging', 'production'];

const packageValidateCommand = new MedplumCommand('validate');
const packageBuildCommand = new MedplumCommand('build');
const packagePublishCommand = new MedplumCommand('publish');

export const packageCommand = new MedplumCommand('package');
addSubcommand(packageCommand, packageValidateCommand);
addSubcommand(packageCommand, packageBuildCommand);
addSubcommand(packageCommand, packagePublishCommand);

packageCommand.description('Build and publish Medplum marketplace packages');

function targetOption(): Option {
  return new Option('-t, --target <target>', 'Deployment target the manifest is compiled for')
    .choices(TARGETS)
    .default('staging');
}

function printIssues(issues: ValidationIssue[]): void {
  for (const issue of issues) {
    const where = issue.path ? ` (${issue.path})` : '';
    console.log(`  ${issue.severity.toUpperCase()} [${issue.code}] ${issue.message}${where}`);
  }
}

function manifestPathFor(packageDir: string): string {
  const path = resolve(packageDir, 'manifest.ts');
  if (!existsSync(path)) {
    throw new Error(`No manifest.ts found at ${path}`);
  }
  return path;
}

/**
 * Source-validates a manifest module, then evaluates it.
 *
 * Source validation gates loading rather than running alongside it. `loadManifest`
 * executes the module in this process — which, for `publish`, holds super-admin
 * credentials — and the AST rules (no top-level side effects, no value imports
 * beyond `@medplum/package-types`) exist to forbid exactly what executing an
 * unvetted module would run. Evaluating first and reporting afterwards would make
 * them decorative.
 * @param manifestPath - Absolute path to the package's `manifest.ts`.
 * @returns The evaluated manifest, plus any issues the source check raised.
 */
async function loadValidatedSource(
  manifestPath: string
): Promise<{ manifest: PackageManifest; issues: ValidationIssue[] }> {
  const sourceResult = validateManifestSource(readFileSync(manifestPath, 'utf8'), manifestPath);
  if (!sourceResult.ok) {
    printIssues(sourceResult.issues);
    throw new Error('Manifest module failed source validation; it was not evaluated.');
  }
  return { manifest: await loadManifest(manifestPath), issues: sourceResult.issues };
}

/**
 * Loads a manifest and requires it to pass both source and semantic validation.
 * @param packageDir - Directory containing the package's `manifest.ts`.
 * @returns The validated manifest.
 */
async function loadValidManifest(packageDir: string): Promise<PackageManifest> {
  const { manifest, issues } = await loadValidatedSource(manifestPathFor(packageDir));
  const semantic = validateManifestObject(manifest);
  const all = [...issues, ...semantic.issues];
  for (const warning of all.filter((x) => x.severity === 'warning')) {
    console.warn(`  WARNING [${warning.code}] ${warning.message}`);
  }
  const errors = all.filter((x) => x.severity === 'error');
  if (errors.length > 0) {
    printIssues(errors);
    throw new Error(`Manifest has ${errors.length} validation error(s); aborting.`);
  }
  return manifest;
}

packageValidateCommand
  .description('Validate a package manifest without contacting a server')
  .argument('[packageDir]', 'Package directory containing manifest.ts', '.')
  .option(
    '--existing-versions <versions>',
    'Comma-separated versions already published, to reject a version collision'
  )
  .action(async (packageDir, options) => {
    const manifestPath = manifestPathFor(packageDir);
    console.log(`Validating ${manifestPath}`);

    const existingVersions = String(options.existingVersions ?? '')
      .split(',')
      .filter(Boolean);

    const { manifest, issues } = await loadValidatedSource(manifestPath);
    const semantic = validateManifestObject(manifest, { existingVersions });

    const all = [...issues, ...semantic.issues];
    printIssues(all);

    const errors = all.filter((x) => x.severity === 'error').length;
    const warnings = all.filter((x) => x.severity === 'warning').length;
    console.log(`\n${semantic.ok ? 'PASS' : 'FAIL'} — ${errors} error(s), ${warnings} warning(s)`);
    if (!semantic.ok) {
      throw new Error(`Manifest has ${errors} validation error(s).`);
    }
  });

packageBuildCommand
  .description('Compile a package manifest into an install Bundle and impl Bot specs')
  .argument('[packageDir]', 'Package directory containing manifest.ts', '.')
  .addOption(targetOption())
  .option('-o, --out <dir>', 'Output directory (defaults to <packageDir>/dist/package/<target>)')
  .action(async (packageDir, options) => {
    const target = options.target as TargetEnv;
    const resolvedDir = resolve(packageDir);
    const manifest = await loadValidManifest(resolvedDir);
    const artifacts = buildPackage(manifest, { target, packageDir: resolvedDir });

    const destination = options.out ? resolve(options.out) : resolve(resolvedDir, 'dist', 'package', target);
    mkdirSync(destination, { recursive: true });
    writeFileSync(resolve(destination, 'install-bundle.json'), JSON.stringify(artifacts.installBundle, null, 2));
    writeFileSync(resolve(destination, 'impl-bots.json'), JSON.stringify(artifacts.implBots, null, 2));
    const summary = {
      packageId: artifacts.packageId,
      version: artifacts.version,
      majorVersion: artifacts.majorVersion,
      target: artifacts.target,
      implProject: artifacts.implProject,
      installEntryCount: artifacts.installBundle.entry?.length ?? 0,
      implBotCount: artifacts.implBots.length,
      envConstants: artifacts.envConstants,
      hooks: artifacts.hooks,
      configQuestionnaire: artifacts.configQuestionnaire,
      setupBotIdentifier: artifacts.setupBotIdentifier,
    };
    writeFileSync(resolve(destination, 'build-manifest.json'), JSON.stringify(summary, null, 2));

    console.log(`Built ${artifacts.packageId}@${artifacts.version} (${target}) -> ${destination}`);
    console.log(`  install bundle entries: ${summary.installEntryCount}`);
    console.log(`  impl bots: ${summary.implBotCount}`);
    console.log(`  impl project: ${summary.implProject}`);
  });

packagePublishCommand
  .description('Publish a package to a Medplum server (requires super-admin credentials)')
  .argument('[packageDir]', 'Package directory containing manifest.ts', '.')
  .addOption(targetOption())
  // Dry-run is the default. Publishing deploys bot code into a shared impl project
  // and registers an immutable release, so the writes are opt-in rather than opt-out.
  .option('--apply', 'Perform server writes (without this, validate and build only)')
  .option('--smoke', 'Apply the install Bundle in the caller project to prove it is well-formed, then clean up')
  .option('--force', 'Overwrite an already-published version instead of refusing')
  .option('--catalog-project <projectId>', 'Project to publish Package/PackageRelease/Binary into')
  .action(async (packageDir, options) => {
    const target = options.target as TargetEnv;
    const resolvedDir = resolve(packageDir);

    console.log('=== Marketplace package publish ===');
    console.log(`package-dir: ${resolvedDir}`);
    console.log(`target:      ${target}`);
    console.log(`mode:        ${options.apply ? 'APPLY (writes enabled)' : 'DRY-RUN (no writes)'}`);
    if (options.force) {
      console.log('force:       ON (--force) — version immutability is waived');
    }
    console.log('');

    const manifest = await loadValidManifest(resolvedDir);
    const artifacts = buildPackage(manifest, { target, packageDir: resolvedDir });
    console.log(
      `built ${artifacts.implBots.length} impl bots, ${artifacts.installBundle.entry?.length ?? 0} install entries`
    );

    if (!options.apply) {
      console.log('\nDRY-RUN: skipping all server writes. Re-run with --apply to publish.');
      return;
    }

    const medplum = await createMedplumClient(options);
    // `Package.author` and the publish AuditEvent both need a profile. An access
    // token alone does not populate one, so fetch it before anything else runs.
    const profile = medplum.getProfile() ?? (await medplum.getProfileAsync());
    if (!profile) {
      throw new Error('Not authenticated — no active profile.');
    }
    console.log(`authenticated as ${getReferenceString(profile)} @ ${medplum.getBaseUrl()}\n`);

    const summary = await publishPackage(medplum, manifest, resolvedDir, target, {
      smoke: !!options.smoke,
      force: !!options.force,
      catalogProject: options.catalogProject,
    });

    console.log('\n=== PUBLISH SUMMARY ===');
    console.log(JSON.stringify(summary, null, 2));

    // A publish whose audit record did not land is not a clean publish. It is not
    // worth undoing the release over, but it must not read as success either.
    if (summary.auditRecorded === false) {
      throw new Error(
        'Publish completed but its AuditEvent could not be written; the publish is not attributable. See the warning above.'
      );
    }
  });
