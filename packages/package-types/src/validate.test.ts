// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { BotIntegrationArtifacts, DataArtifacts, PackageManifest, PackageManifestBase } from './types';
import { validateManifestObject, validateManifestSource } from './validate';

/** A `bot-integration` manifest, pre-narrowed so tests can reach `artifacts.consumer`. */
type BotManifest = PackageManifestBase & { type: 'bot-integration'; artifacts: BotIntegrationArtifacts };

const RUNTIME = {
  local: { runtimeVersion: 'vmcontext' },
  staging: { runtimeVersion: 'awslambda', timeout: 30 },
  production: { runtimeVersion: 'awslambda', timeout: 30 },
} as const;

function baseManifest(overrides: Partial<PackageManifest> = {}): BotManifest {
  return {
    schemaVersion: 1,
    package: 'demo',
    displayName: 'Demo',
    vendor: 'Acme',
    version: '1.0.0',
    majorVersion: 1,
    type: 'bot-integration',
    channel: 'stable',
    compatibility: { minMedplumVersion: '5.1.7' },
    artifacts: {
      consumer: {
        webhookBots: [{ identifier: 'demo-webhook', delegatesTo: 'demo-impl', runAsUser: false }],
        operations: [{ code: 'demo-op', delegatesTo: 'demo-impl', resource: ['Patient'] }],
        clientApplications: [{ identifier: 'demo-client', name: 'Demo Client', bindings: ['demo-webhook'] }],
      },
      impl: {
        bots: [{ identifier: 'demo-impl', file: 'dist/bots/demo-impl.js', runtime: RUNTIME }],
      },
    },
    ...overrides,
  } as BotManifest;
}

function referenceDataManifest(overrides: { data?: DataArtifacts } = {}): PackageManifest {
  return {
    schemaVersion: 1,
    package: 'demo-data',
    displayName: 'Demo Data',
    vendor: 'Acme',
    version: '1.0.0',
    majorVersion: 1,
    type: 'reference-data',
    channel: 'stable',
    compatibility: { minMedplumVersion: '5.1.7' },
    artifacts: { data: overrides.data ?? { bundles: ['data/seed.json'] } },
  };
}

function errorCodes(manifest: PackageManifest, opts?: { existingVersions?: string[] }): string[] {
  return validateManifestObject(manifest, opts)
    .issues.filter((x) => x.severity === 'error')
    .map((x) => x.code);
}

describe('validateManifestObject', () => {
  it('passes a valid manifest', () => {
    const result = validateManifestObject(baseManifest());
    expect(result.ok).toBe(true);
    expect(result.issues.filter((x) => x.severity === 'error')).toHaveLength(0);
  });

  it('flags a major/version mismatch', () => {
    expect(errorCodes(baseManifest({ majorVersion: 2 }))).toContain('major-mismatch');
  });

  it('flags invalid semver', () => {
    expect(errorCodes(baseManifest({ version: 'v1', majorVersion: 1 }))).toContain('version-semver');
  });

  it('flags a delegatesTo pointing at an unknown impl bot', () => {
    const m = baseManifest();
    m.artifacts.consumer.webhookBots = [{ identifier: 'demo-webhook', delegatesTo: 'typo-impl', runAsUser: false }];
    expect(errorCodes(m)).toContain('delegates-to-unknown');
  });

  it('flags an impl bot that nothing exposes', () => {
    const m = baseManifest();
    // Leaves demo-impl deployed but with no consumer entry point at all.
    m.artifacts.consumer = {};
    expect(errorCodes(m)).toContain('impl-not-exposed');
  });

  it('accepts an unexposed impl bot that is declared internal', () => {
    const m = baseManifest();
    m.artifacts.consumer = {};
    m.artifacts.impl.bots[0].internal = true;
    expect(errorCodes(m)).not.toContain('impl-not-exposed');
  });

  it('accepts an impl bot exposed only by a provider-facing proxy', () => {
    const m = baseManifest();
    m.artifacts.consumer = { proxyBots: [{ identifier: 'demo-bot', delegatesTo: 'demo-impl' }] };
    expect(errorCodes(m)).not.toContain('impl-not-exposed');
  });

  it('accepts an impl bot exposed only as a linked bot', () => {
    const m = baseManifest();
    m.artifacts.consumer = { linkedBots: [{ identifier: 'demo-impl' }] };
    expect(errorCodes(m)).not.toContain('impl-not-exposed');
  });

  it('flags a linked bot that is not a declared impl bot', () => {
    const m = baseManifest();
    m.artifacts.consumer = { linkedBots: [{ identifier: 'ghost-impl' }] };
    expect(errorCodes(m)).toContain('linked-unknown');
  });

  it('flags a linked bot that would run as itself rather than the caller', () => {
    // Reached across the link it would resolve to the impl project's membership,
    // so it would read and write the publisher's project, not the customer's.
    const m = baseManifest();
    m.artifacts.consumer = { linkedBots: [{ identifier: 'demo-impl' }] };
    m.artifacts.impl.bots[0].runAsUser = false;
    expect(errorCodes(m)).toContain('linked-requires-run-as-user');
  });

  it('flags a versioned linked identifier', () => {
    const m = baseManifest();
    m.artifacts.consumer = { linkedBots: [{ identifier: 'demo-impl@1.0.0' }] };
    expect(errorCodes(m)).toContain('linked-identifier-unversioned');
  });

  it('flags a linked identifier reused as a customer-side proxy', () => {
    // Both publish under the same per-package identifier system, and
    // `Bot/$execute?identifier=` spans the customer project and its links, so the
    // caller would match two bots.
    const m = baseManifest();
    m.artifacts.consumer = {
      linkedBots: [{ identifier: 'demo-impl' }],
      proxyBots: [{ identifier: 'demo-impl', delegatesTo: 'demo-impl' }],
    };
    expect(errorCodes(m)).toContain('linked-proxy-identifier-collision');
  });

  it('flags a linked identifier reused as a webhook', () => {
    const m = baseManifest();
    m.artifacts.consumer = {
      linkedBots: [{ identifier: 'demo-impl' }],
      webhookBots: [{ identifier: 'demo-impl', delegatesTo: 'demo-impl', runAsUser: false }],
    };
    expect(errorCodes(m)).toContain('linked-proxy-identifier-collision');
  });

  it('allows a linked bot alongside a differently named proxy', () => {
    const m = baseManifest();
    m.artifacts.consumer = {
      linkedBots: [{ identifier: 'demo-impl' }],
      proxyBots: [{ identifier: 'demo-proxy', delegatesTo: 'demo-impl' }],
    };
    expect(errorCodes(m)).not.toContain('linked-proxy-identifier-collision');
  });

  it('flags duplicate linked identifiers', () => {
    const m = baseManifest();
    m.artifacts.consumer = { linkedBots: [{ identifier: 'demo-impl' }, { identifier: 'demo-impl' }] };
    expect(errorCodes(m)).toContain('linked-identifier-duplicate');
  });

  it('does not warn about a linked identifier diverging from its file basename', () => {
    // A linked identifier names the capability callers already invoke, not the
    // module implementing it, so the two are expected to differ.
    const m = baseManifest();
    m.artifacts.consumer = { linkedBots: [{ identifier: 'ai-resource-summary-sse' }] };
    m.artifacts.impl.bots = [
      { identifier: 'ai-resource-summary-sse', file: 'dist/bots/fhir-summary-bot.js', runtime: RUNTIME },
    ];
    const result = validateManifestObject(m);
    expect(result.issues.map((x) => x.code)).not.toContain('impl-file-basename');
  });

  it('still warns about a basename mismatch on a bot that is not linked', () => {
    const m = baseManifest();
    m.artifacts.impl.bots = [{ identifier: 'demo-impl', file: 'dist/bots/something-else.js', runtime: RUNTIME }];
    const warnings = validateManifestObject(m).issues.filter((x) => x.severity === 'warning');
    expect(warnings.map((w) => w.code)).toContain('impl-file-basename');
  });

  it('flags a streaming bot exposed through an operation, which cannot forward a stream', () => {
    const m = baseManifest();
    m.artifacts.consumer = { operations: [{ code: 'demo-op', delegatesTo: 'demo-impl', resource: ['Patient'] }] };
    m.artifacts.impl.bots[0].streamingEnabled = true;
    expect(errorCodes(m)).toContain('streaming-requires-linked');
  });

  it('accepts a streaming bot exposed as a linked bot', () => {
    const m = baseManifest();
    m.artifacts.consumer = { linkedBots: [{ identifier: 'demo-impl' }] };
    m.artifacts.impl.bots[0].streamingEnabled = true;
    expect(errorCodes(m)).not.toContain('streaming-requires-linked');
  });

  it('flags a proxy bot delegating to an unknown impl', () => {
    const m = baseManifest();
    m.artifacts.consumer.proxyBots = [{ identifier: 'demo-bot', delegatesTo: 'typo-impl' }];
    expect(errorCodes(m)).toContain('delegates-to-unknown');
  });

  it('flags an operation that declares no resource', () => {
    // `resource` is optional on OperationDefinition, so this check is the only
    // thing standing between an author and an operation nothing can dispatch.
    const m = baseManifest();
    m.artifacts.consumer.operations = [{ code: 'demo-op', delegatesTo: 'demo-impl' }];
    expect(errorCodes(m)).toContain('operation-resource-missing');

    m.artifacts.consumer.operations = [{ code: 'demo-op', delegatesTo: 'demo-impl', resource: [] }];
    expect(errorCodes(m)).toContain('operation-resource-missing');
  });

  it('flags a duplicate operation code', () => {
    const m = baseManifest();
    m.artifacts.consumer.operations = [
      { code: 'demo-op', delegatesTo: 'demo-impl', resource: ['Patient'] },
      { code: 'demo-op', delegatesTo: 'demo-impl', resource: ['Observation'] },
    ];
    expect(errorCodes(m)).toContain('operation-code-duplicate');
  });

  it('flags a clientApplication binding to an unknown webhook', () => {
    const m = baseManifest();
    m.artifacts.consumer.clientApplications = [
      { identifier: 'demo-client', name: 'Demo Client', bindings: ['ghost-webhook'] },
    ];
    expect(errorCodes(m)).toContain('binding-unknown');
  });

  it('flags a clientApplication binding to a provider-facing proxy rather than a webhook', () => {
    const m = baseManifest();
    // The identifier exists, so it is not a typo — but a webhook client has no
    // calling user, and a provider-facing proxy runs as one.
    m.artifacts.consumer.proxyBots = [{ identifier: 'demo-bot', delegatesTo: 'demo-impl' }];
    m.artifacts.consumer.clientApplications = [
      { identifier: 'demo-client', name: 'Demo Client', bindings: ['demo-bot'] },
    ];
    expect(errorCodes(m)).toContain('binding-unknown');
  });

  it('flags a proxy bot reusing a webhook bot identifier', () => {
    const m = baseManifest();
    m.artifacts.consumer.proxyBots = [{ identifier: 'demo-webhook', delegatesTo: 'demo-impl' }];
    expect(errorCodes(m)).toContain('proxy-identifier-duplicate');
  });

  it('rejects a package id that is not a slug', () => {
    // These are interpolated into search queries and the impl project name, so a
    // separator here changes what they match.
    expect(errorCodes(baseManifest({ package: 'demo&_count=1' }))).toContain('package-id-format');
    expect(errorCodes(baseManifest({ package: 'Demo' }))).toContain('package-id-format');
  });

  it('rejects an identifier that could alter a conditional upsert', () => {
    const m = baseManifest();
    m.artifacts.consumer.webhookBots = [
      { identifier: 'demo-webhook&name=other', delegatesTo: 'demo-impl', runAsUser: false },
    ];
    expect(errorCodes(m)).toContain('identifier-format');
  });

  it('rejects a non-slug operation code', () => {
    const m = baseManifest();
    m.artifacts.consumer.operations = [{ code: 'Drug Search', delegatesTo: 'demo-impl', resource: ['Patient'] }];
    expect(errorCodes(m)).toContain('identifier-format');
  });

  it('flags a hook naming something that is not a declared impl bot', () => {
    const m = baseManifest({ hooks: { postInstall: 'demo-post-install' } });
    expect(errorCodes(m)).toContain('hook-unknown');
  });

  it('flags a hook bot that would run as itself rather than the installing admin', () => {
    const m = baseManifest({ hooks: { postInstall: 'demo-hook' } });
    m.artifacts.impl.bots.push({
      identifier: 'demo-hook',
      file: 'dist/hooks/post-install.js',
      runAsUser: false,
      runtime: {
        local: { runtimeVersion: 'vmcontext' },
        staging: { runtimeVersion: 'awslambda', timeout: 30 },
        production: { runtimeVersion: 'awslambda', timeout: 30 },
      },
    });
    expect(errorCodes(m)).toContain('hook-run-as-bot');
  });

  it('accepts a hook bot without requiring internal, since hooks have no customer-side name', () => {
    const m = baseManifest({ hooks: { postInstall: 'demo-hook' } });
    m.artifacts.impl.bots.push({
      identifier: 'demo-hook',
      file: 'dist/hooks/post-install.js',
      runAsUser: true,
      runtime: {
        local: { runtimeVersion: 'vmcontext' },
        staging: { runtimeVersion: 'awslambda', timeout: 30 },
        production: { runtimeVersion: 'awslambda', timeout: 30 },
      },
    });
    const codes = errorCodes(m);
    expect(codes).not.toContain('impl-not-exposed');
    expect(codes).not.toContain('hook-unknown');
    expect(codes).not.toContain('hook-run-as-bot');
  });

  it('does not require internal on reference-data impl bots, which have no exposure mechanism', () => {
    const m = baseManifest();
    const refData = {
      ...referenceDataManifest(),
      artifacts: { data: { bundles: ['data/seed.json'] }, impl: m.artifacts.impl },
    } as PackageManifest;
    expect(errorCodes(refData)).not.toContain('impl-not-exposed');
  });

  it('accepts a reference-data package with no impl bots at all', () => {
    // The point of the type: a Bundle and nothing else, so no impl project and no
    // bots to deploy.
    const codes = errorCodes(referenceDataManifest());
    expect(codes).not.toContain('impl-empty');
    expect(codes).toHaveLength(0);
  });

  it('flags a reference-data package that declares no data', () => {
    expect(errorCodes(referenceDataManifest({ data: { bundles: [] } }))).toContain('data-empty');
  });

  it('still requires impl bots on a bot-integration package', () => {
    const m = baseManifest();
    m.artifacts.impl.bots = [];
    expect(errorCodes(m)).toContain('impl-empty');
  });

  it('flags duplicate impl identifiers', () => {
    const m = baseManifest();
    m.artifacts.impl.bots.push({ ...m.artifacts.impl.bots[0] });
    expect(errorCodes(m)).toContain('impl-identifier-duplicate');
  });

  it('flags a missing runtime target', () => {
    const m = baseManifest();
    m.artifacts.impl.bots = [
      {
        identifier: 'demo-impl',
        file: 'dist/bots/demo-impl.js',
        runtime: { local: { runtimeVersion: 'vmcontext' } } as BotManifest['artifacts']['impl']['bots'][0]['runtime'],
      },
    ];
    expect(errorCodes(m)).toContain('runtime-incomplete');
  });

  it('flags version collision against the registry', () => {
    expect(errorCodes(baseManifest(), { existingVersions: ['1.0.0'] })).toContain('version-not-unique');
  });

  it('warns on env-constant asymmetry', () => {
    const m = baseManifest({
      envConstants: {
        local: { A: '1' },
        staging: { A: '1', B: '2' },
        production: { A: '1' },
      },
    });
    const warnings = validateManifestObject(m).issues.filter((x) => x.severity === 'warning');
    expect(warnings.some((w) => w.code === 'env-constant-asymmetry')).toBe(true);
  });

  it('accepts migrations listed in strictly ascending semver order', () => {
    const codes = errorCodes(
      baseManifest({
        migrations: [
          { version: '1.0.0', file: 'migrations/1.0.0.js' },
          { version: '1.1.0', file: 'migrations/1.1.0.js' },
          { version: '2.0.0-alpha.1', file: 'migrations/2.0.0-alpha.1.js' },
          { version: '2.0.0', file: 'migrations/2.0.0.js' },
        ],
      })
    );
    expect(codes).not.toContain('migration-order');
    expect(codes).not.toContain('migration-version-semver');
  });

  it('flags migrations that are not strictly ascending', () => {
    expect(
      errorCodes(
        baseManifest({
          migrations: [
            { version: '1.2.0', file: 'migrations/1.2.0.js' },
            { version: '1.1.0', file: 'migrations/1.1.0.js' },
          ],
        })
      )
    ).toContain('migration-order');
  });

  it('flags a duplicate migration version as out of order', () => {
    expect(
      errorCodes(
        baseManifest({
          migrations: [
            { version: '1.1.0', file: 'migrations/a.js' },
            { version: '1.1.0', file: 'migrations/b.js' },
          ],
        })
      )
    ).toContain('migration-order');
  });
});

describe('validateManifestSource (AST)', () => {
  const valid = `import type { PackageManifest } from '@medplum/package-types';
export const manifest: PackageManifest = { schemaVersion: 1 } as PackageManifest;
`;

  it('passes a declarative manifest module', () => {
    expect(validateManifestSource(valid).ok).toBe(true);
  });

  it('passes a defineManifest value import', () => {
    const src = `import { defineManifest } from '@medplum/package-types';
export const manifest = defineManifest({ schemaVersion: 1 } as any);
`;
    expect(validateManifestSource(src).ok).toBe(true);
  });

  it('rejects a non-type value import from another module', () => {
    const src = `import { readFileSync } from 'node:fs';
export const manifest = { schemaVersion: 1 };
`;
    const codes = validateManifestSource(src).issues.map((x) => x.code);
    expect(codes).toContain('non-type-import');
  });

  it('rejects a missing manifest export', () => {
    const src = `import type { PackageManifest } from '@medplum/package-types';
const notManifest = 1;
`;
    expect(validateManifestSource(src).issues.map((x) => x.code)).toContain('manifest-export-missing');
  });

  it('rejects a manifest exported with let', () => {
    const src = `export let manifest = { schemaVersion: 1 };
`;
    expect(validateManifestSource(src).issues.map((x) => x.code)).toContain('manifest-not-const');
  });

  it('rejects a top-level side effect (IIFE)', () => {
    const src = `export const manifest = { schemaVersion: 1 };
(() => { console.log('boom'); })();
`;
    expect(validateManifestSource(src).issues.map((x) => x.code)).toContain('disallowed-statement');
  });

  it('rejects top-level await in the manifest initializer', () => {
    const src = `export const manifest = await loadSomething();
`;
    const codes = validateManifestSource(src).issues.map((x) => x.code);
    expect(codes).toContain('manifest-side-effect');
  });
});
