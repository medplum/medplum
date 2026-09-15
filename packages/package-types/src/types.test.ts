// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Bot } from '@medplum/fhirtypes';
import type { BotRuntime, DataArtifacts, Hooks, ImplBot, PackageManifest, WebhookBot } from './types';
import { defineManifest, hasConsumerArtifacts, implVersioning } from './types';

const fullRuntime = {
  local: { runtimeVersion: 'vmcontext' },
  staging: { runtimeVersion: 'awslambda', timeout: 30 },
  production: { runtimeVersion: 'awslambda', timeout: 30 },
} as const;

/**
 * These tests double as compile-time assertions. The negative cases use
 * `@ts-expect-error`; `tsc` (run by `npm run build`) fails if any of them stops
 * producing the expected type error, so the discriminated-union invariants are
 * enforced at build time, not just at runtime.
 */

const validManifest: PackageManifest = {
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
    },
    impl: {
      bots: [{ identifier: 'demo-impl', file: 'dist/bots/demo-impl.js', runtime: fullRuntime }],
    },
  },
};

const linkedManifest: PackageManifest = {
  ...validManifest,
  artifacts: {
    consumer: { linkedBots: [{ identifier: 'demo-impl' }] },
    impl: { bots: [{ identifier: 'demo-impl', file: 'dist/bots/demo-impl.js', runtime: fullRuntime }] },
  },
};

const dataManifest: PackageManifest = {
  ...validManifest,
  type: 'reference-data',
  artifacts: { data: { bundles: ['data/seed.json'] } },
};

describe('PackageManifest types', () => {
  it('accepts a valid manifest via annotation and defineManifest', () => {
    const m = defineManifest(validManifest);
    expect(m.package).toBe('demo');
  });

  it('narrows consumer artifacts via hasConsumerArtifacts', () => {
    expect(hasConsumerArtifacts(validManifest)).toBe(true);
    if (hasConsumerArtifacts(validManifest)) {
      expect(validManifest.artifacts.consumer.webhookBots?.length).toBe(1);
    }
    expect(hasConsumerArtifacts(dataManifest)).toBe(false);
  });

  it('puts the version in the identifier unless a linked bot is declared', () => {
    // A linked identifier is the consumer contract, so it cannot also carry the
    // version; declaring one moves the version into the impl project.
    expect(implVersioning(validManifest)).toBe('identifier');
    expect(implVersioning(linkedManifest)).toBe('project');
  });

  it('rejects a consumer section on a reference-data package', () => {
    const m: PackageManifest = {
      ...dataManifest,
      // @ts-expect-error reference-data packages have no consumer-facing bot surface
      artifacts: { data: { bundles: ['data/seed.json'] }, consumer: { linkedBots: [{ identifier: 'x' }] } },
    };
    expect(m).toBeDefined();
  });

  it('rejects an ndjson data payload while the import engine is unimplemented', () => {
    // Same rationale as `preUninstall`: `$install` reads the release content as a
    // single Bundle, so a declared value would publish and then never be applied.
    // @ts-expect-error ndjson is reserved until the asset-import engine lands
    const data: DataArtifacts = { bundles: ['data/seed.json'], ndjson: ['data/big.ndjson'] };
    expect(data).toBeDefined();
  });

  it('rejects a preUninstall hook while uninstall is unimplemented', () => {
    // Reserved as `never` on purpose: nothing carries a teardown hook to the server
    // and nothing invokes it, so a declared value would validate, publish, and then
    // silently never run. A compile error is the honest signal.
    // @ts-expect-error preUninstall is reserved until the uninstall operation exists
    const hooks: Hooks = { postInstall: 'demo-post-install', preUninstall: 'demo-pre-uninstall' };
    expect(hooks).toBeDefined();
  });

  it('rejects admin without adminReason', () => {
    // @ts-expect-error admin:true requires adminReason
    const bot: ImplBot = { identifier: 'demo-impl', file: 'dist/bots/demo-impl.js', admin: true, runtime: fullRuntime };
    expect(bot).toBeDefined();
  });

  it('rejects an incomplete runtime matrix', () => {
    const bot: ImplBot = {
      identifier: 'demo-impl',
      file: 'dist/bots/demo-impl.js',
      // @ts-expect-error runtime matrix must include all three target envs
      runtime: { local: { runtimeVersion: 'vmcontext' }, staging: { runtimeVersion: 'awslambda' } },
    };
    expect(bot).toBeDefined();
  });

  it('rejects a webhook bot with runAsUser:true', () => {
    // @ts-expect-error webhook proxies must set runAsUser:false
    const wb: WebhookBot = { identifier: 'demo-webhook', delegatesTo: 'demo-impl', runAsUser: true };
    expect(wb).toBeDefined();
  });

  it('rejects a populated library field (deferred to Step 2)', () => {
    const m: PackageManifest = {
      ...validManifest,
      // @ts-expect-error library is accepted only as undefined in schema v1
      library: { name: 'demo-lib' },
    };
    expect(m).toBeDefined();
  });

  it('rejects an unsupported schemaVersion', () => {
    const m: PackageManifest = {
      ...validManifest,
      // @ts-expect-error schemaVersion must be the literal 1
      schemaVersion: 2,
    };
    expect(m).toBeDefined();
  });
});

describe('fhirtypes derivation', () => {
  it('takes the runtime union from Bot rather than redeclaring it', () => {
    // Derived, so the manifest offers exactly what the server accepts. `fission`
    // comes along with that; it is not a marketplace runtime, but accepting it
    // here is preferable to a parallel union that can drift from Bot.
    const fission: BotRuntime = { runtimeVersion: 'fission' };
    expect(fission.runtimeVersion).toBe('fission');

    const runtimeVersion: Bot['runtimeVersion'] = fullRuntime.staging.runtimeVersion;
    expect(runtimeVersion).toBe('awslambda');
  });

  it('keeps every impl bot field assignable to the Bot it compiles into', () => {
    const implBot: ImplBot = {
      identifier: 'demo-impl',
      file: 'dist/bots/demo-impl.js',
      name: 'Demo Impl',
      description: 'A demo bot',
      runAsUser: true,
      streamingEnabled: true,
      runtime: fullRuntime,
    };
    // The build copies these straight onto a Bot, so the types have to line up.
    const bot: Bot = {
      resourceType: 'Bot',
      name: implBot.name,
      description: implBot.description,
      runAsUser: implBot.runAsUser,
      streamingEnabled: implBot.streamingEnabled,
    };
    expect(bot.name).toBe('Demo Impl');
  });

  it('leaves operation resource optional, as it is on OperationDefinition', () => {
    // The manifest no longer requires it at compile time; `operation-resource-missing`
    // is what rejects an operation defined on nothing.
    const m: PackageManifest = {
      ...validManifest,
      artifacts: {
        consumer: { operations: [{ code: 'demo-op', delegatesTo: 'demo-impl' }] },
        impl: { bots: [{ identifier: 'demo-impl', file: 'dist/bots/demo-impl.js', runtime: fullRuntime }] },
      },
    };
    expect(m).toBeDefined();
  });
});
