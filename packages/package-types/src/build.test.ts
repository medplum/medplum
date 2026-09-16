// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Bot, ClientApplication, OperationDefinition } from '@medplum/fhirtypes';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildPackage, generateWebhookProxyCode, resolveWithinPackage } from './build';
import {
  botIdentifierSystem,
  OPERATION_DEFINITION_IMPLEMENTATION_EXTENSION,
  PACKAGE_IMPL_TAG_SYSTEM,
  PACKAGE_IMPL_VERSION_TAG_SYSTEM,
  PACKAGE_INSTALL_TAG_SYSTEM,
  PACKAGE_INSTALL_VERSION_TAG_SYSTEM,
} from './constants';
import type { PackageManifest } from './types';

const DEMO_BOT_SYSTEM = botIdentifierSystem('demo');

const manifest: PackageManifest = {
  schemaVersion: 1,
  package: 'demo',
  displayName: 'Demo',
  vendor: 'Acme',
  version: '1.2.3',
  majorVersion: 1,
  type: 'bot-integration',
  channel: 'stable',
  compatibility: { minMedplumVersion: '5.1.7' },
  envConstants: {
    local: { CALLBACK_BASE_URL: 'http://localhost:8103/fhir/R4' },
    staging: { CALLBACK_BASE_URL: 'https://api.staging.medplum.dev/fhir/R4' },
    production: { CALLBACK_BASE_URL: 'https://api.medplum.com/fhir/R4' },
  },
  hooks: { postInstall: 'demo-post-install' },
  configQuestionnaire: './config-questionnaire.json',
  artifacts: {
    consumer: {
      webhookBots: [{ identifier: 'demo-webhook', delegatesTo: 'demo-impl', runAsUser: false }],
      operations: [{ code: 'demo-op', delegatesTo: 'demo-impl', resource: ['Patient'] }],
      clientApplications: [{ identifier: 'demo-client', name: 'Demo Client', bindings: ['demo-webhook'] }],
    },
    impl: {
      bots: [
        {
          identifier: 'demo-impl',
          file: 'dist/bots/demo-impl.js',
          runtime: {
            local: { runtimeVersion: 'vmcontext' },
            staging: { runtimeVersion: 'awslambda', timeout: 30 },
            production: { runtimeVersion: 'awslambda', timeout: 30 },
          },
        },
        {
          identifier: 'demo-post-install',
          file: 'dist/hooks/post-install.js',
          runAsUser: true,
          runtime: {
            local: { runtimeVersion: 'vmcontext' },
            staging: { runtimeVersion: 'awslambda', timeout: 30 },
            production: { runtimeVersion: 'awslambda', timeout: 30 },
          },
        },
      ],
    },
  },
};

/** The same package with its capability exposed as a linked bot instead of a proxy. */
const linkedManifest: PackageManifest = {
  ...manifest,
  hooks: undefined,
  configQuestionnaire: undefined,
  artifacts: {
    consumer: { linkedBots: [{ identifier: 'demo-impl' }] },
    impl: {
      bots: [
        {
          identifier: 'demo-impl',
          file: 'dist/bots/demo-impl.js',
          streamingEnabled: true,
          runtime: {
            local: { runtimeVersion: 'vmcontext' },
            staging: { runtimeVersion: 'awslambda', timeout: 840 },
            production: { runtimeVersion: 'awslambda', timeout: 840 },
          },
        },
      ],
    },
  },
};

/** A pure data package: no impl project, no bots, no consumer contract. */
const dataManifest: PackageManifest = {
  ...manifest,
  package: 'demo-data',
  type: 'reference-data',
  hooks: undefined,
  configQuestionnaire: undefined,
  artifacts: { data: { bundles: ['data/seed.json'] } },
};

describe('buildPackage', () => {
  it('computes the impl project name and resolves env constants per target', () => {
    const local = buildPackage(manifest, { target: 'local' });
    expect(local.implProject).toBe('demo-impl-v1');
    expect(local.envConstants.CALLBACK_BASE_URL).toBe('http://localhost:8103/fhir/R4');

    const prod = buildPackage(manifest, { target: 'production' });
    expect(prod.envConstants.CALLBACK_BASE_URL).toBe('https://api.medplum.com/fhir/R4');
  });

  it('encodes the identifier token in Bot conditional upserts', () => {
    const { installBundle } = buildPackage(manifest, { target: 'staging' });
    const botUrls = (installBundle.entry ?? [])
      .filter((e) => e.resource?.resourceType === 'Bot')
      .map((e) => e.request?.url ?? '');
    expect(botUrls).toEqual(['Bot?identifier=https%3A%2F%2Fwww.medplum.com%2Fbots%2Fdemo%7Cdemo-webhook']);
    for (const url of botUrls) {
      // The `|` between system and value must be escaped, or an identifier
      // containing a separator would add search parameters to the conditional.
      expect(url).toContain('%7C');
      expect(url).not.toContain('|');
    }
  });

  it('refuses a manifest path that escapes the package directory', () => {
    expect(() => resolveWithinPackage('/tmp/pkg', '../../etc/passwd', 'configQuestionnaire')).toThrow(
      /resolves outside the package directory/
    );
    expect(resolveWithinPackage('/tmp/pkg', 'dist/bots/a.js', 'file')).toBe('/tmp/pkg/dist/bots/a.js');
  });

  it('exposes a stable impl-project identifier distinct from the display name', () => {
    const built = buildPackage(manifest, { target: 'staging' });
    expect(built.implProject).toBe('demo-impl-v1');
    // The publisher resolves the project by this, because Project.name is a
    // display field any project can set.
    expect(built.implProjectIdentifier).toBe('demo-v1');
    expect(built.implProjectIdentifier).not.toBe(built.implProject);
  });

  it('version-tags impl bots and selects the target runtime', () => {
    const staging = buildPackage(manifest, { target: 'staging' });
    // The impl bot plus the post-install hook, which is published the same way.
    expect(staging.implBots).toHaveLength(2);
    const bot = staging.implBots[0];
    expect(bot.identifier?.[0]).toEqual({ system: DEMO_BOT_SYSTEM, value: 'demo-impl@1.2.3' });
    expect(bot.runtimeVersion).toBe('awslambda');
    expect(bot.timeout).toBe(30);
    expect(bot.meta?.tag).toEqual([
      { system: PACKAGE_IMPL_TAG_SYSTEM, code: 'demo' },
      { system: PACKAGE_IMPL_VERSION_TAG_SYSTEM, code: 'demo@1.2.3' },
    ]);

    const local = buildPackage(manifest, { target: 'local' });
    expect(local.implBots[0].runtimeVersion).toBe('vmcontext');
  });

  it('defaults an impl bot name to its identifier and runAsUser to true', () => {
    const [implBot, hookBot] = buildPackage(manifest, { target: 'staging' }).implBots;
    expect(implBot.name).toBe('demo-impl');
    expect(implBot.runAsUser).toBe(true);
    // The hook declares runAsUser explicitly, because a hook that ran as its own
    // membership could not write Project.secret.
    expect(hookBot.name).toBe('demo-post-install');
    expect(hookBot.runAsUser).toBe(true);
    expect(hookBot.identifier?.[0].value).toBe('demo-post-install@1.2.3');
  });

  it('tags every install bundle entry with the package and the release that wrote it', () => {
    const { installBundle } = buildPackage(manifest, { target: 'staging' });
    expect(installBundle.type).toBe('transaction');
    const entries = installBundle.entry ?? [];
    expect(entries).toHaveLength(3); // 1 webhook bot + 1 client app + 1 OD
    for (const e of entries) {
      // The package tag is the teardown key and is stable across releases.
      expect(e.resource?.meta?.tag).toContainEqual({ system: PACKAGE_INSTALL_TAG_SYSTEM, code: 'demo' });
      // The version tag is what lets an upgrade tell a resource the new release
      // still declares from one it dropped.
      expect(e.resource?.meta?.tag).toContainEqual({
        system: PACKAGE_INSTALL_VERSION_TAG_SYSTEM,
        code: 'demo@1.2.3',
      });
      expect(e.request?.method).toBe('PUT');
    }
  });

  it('emits install entries grouped by exposure, in manifest order', () => {
    // The Bundle is a transaction, so entry order is apply order. Proxy bots come
    // before the OperationDefinitions that name them and the clients that bind them.
    const { installBundle } = buildPackage(manifest, { target: 'staging' });
    expect((installBundle.entry ?? []).map((e) => e.resource?.resourceType)).toEqual([
      'Bot',
      'ClientApplication',
      'OperationDefinition',
    ]);
  });

  it('keys the ClientApplication upsert on name, the only field it can be keyed on', () => {
    const { installBundle } = buildPackage(manifest, { target: 'staging' });
    const entry = (installBundle.entry ?? []).find((e) => e.resource?.resourceType === 'ClientApplication');
    const client = entry?.resource as ClientApplication;
    expect(entry?.request?.url).toBe('ClientApplication?name=Demo%20Client');
    expect(client.name).toBe('Demo Client');
    // `ClientAppDef.identifier` is a manifest-local handle: ClientApplication has
    // no identifier element, so writing one would be silently dropped.
    expect(client).not.toHaveProperty('identifier');
  });

  it('keeps the version out of the package tag, so a version-shaped package id cannot collide', () => {
    // The pre-existing shape put the version as a second coding in the package's
    // own system, where it was indistinguishable from a package named like one.
    const versionish = buildPackage({ ...manifest, package: '1.2.3' }, { target: 'staging' });
    const tags = versionish.implBots[0].meta?.tag ?? [];
    expect(tags.filter((t) => t.system === PACKAGE_IMPL_TAG_SYSTEM)).toEqual([
      { system: PACKAGE_IMPL_TAG_SYSTEM, code: '1.2.3' },
    ]);
    expect(tags).toContainEqual({ system: PACKAGE_IMPL_VERSION_TAG_SYSTEM, code: '1.2.3@1.2.3' });
  });

  it('emits a webhook proxy bot whose generated code delegates by identifier', () => {
    const { installBundle } = buildPackage(manifest, { target: 'staging' });
    const bot = (installBundle.entry ?? []).map((e) => e.resource).find((r) => r?.resourceType === 'Bot') as Bot;
    expect(bot.runAsUser).toBe(false);
    expect(bot.name).toBe('demo-webhook');
    expect(bot.runtimeVersion).toBe('awslambda');
    expect(bot.timeout).toBe(30);
    expect(bot.code).toContain('executeBot');
    expect(bot.code).toContain('demo-impl');
  });

  it('defaults an operation to type-level and derives its canonical url', () => {
    const { installBundle } = buildPackage(manifest, { target: 'staging' });
    const entry = (installBundle.entry ?? []).find((e) => e.resource?.resourceType === 'OperationDefinition');
    const od = entry?.resource as OperationDefinition;
    expect(od.url).toBe('https://medplum.com/fhir/OperationDefinition/demo-op');
    expect(entry?.request?.url).toBe(
      'OperationDefinition?url=https%3A%2F%2Fmedplum.com%2Ffhir%2FOperationDefinition%2Fdemo-op'
    );
    expect(od.name).toBe('demo-op');
    expect(od.code).toBe('demo-op');
    expect(od.status).toBe('active');
    expect(od.kind).toBe('operation');
    expect(od.resource).toEqual(['Patient']);
    // Type-level by default: a marketplace operation acts on a resource type, not
    // on the whole system or a single instance.
    expect(od.type).toBe(true);
    expect(od.system).toBe(false);
    expect(od.instance).toBe(false);
  });

  it('points the OperationDefinition implementation at the version-tagged impl bot', () => {
    const { installBundle } = buildPackage(manifest, { target: 'staging' });
    const od = (installBundle.entry ?? [])
      .map((e) => e.resource)
      .find((r) => r?.resourceType === 'OperationDefinition') as OperationDefinition;
    const ext = od.extension?.[0];
    expect(ext?.url).toBe(OPERATION_DEFINITION_IMPLEMENTATION_EXTENSION);
    expect(ext?.valueReference?.identifier?.value).toBe('demo-impl@1.2.3');
  });

  it('namespaces bot identifiers per package', () => {
    // A shared system would let two packages that picked the same short name both
    // match `Bot/$execute?identifier=`, since that search spans linked projects.
    const built = buildPackage(manifest, { target: 'staging' });
    expect(DEMO_BOT_SYSTEM).toBe('https://www.medplum.com/bots/demo');
    expect(built.implBots[0].identifier?.[0].system).toBe(DEMO_BOT_SYSTEM);
    expect(buildPackage(dataManifest, { target: 'staging' }).packageId).toBe('demo-data');
  });

  describe('linked exposure', () => {
    it('writes no customer-side resource for a linked bot', () => {
      // The point of the exposure: nothing per customer to create, deploy, or
      // give a membership to.
      const built = buildPackage(linkedManifest, { target: 'staging' });
      expect(built.installBundle.entry ?? []).toHaveLength(0);
    });

    it('moves the version into the impl project and leaves identifiers bare', () => {
      const built = buildPackage(linkedManifest, { target: 'staging' });
      expect(built.implVersioning).toBe('project');
      expect(built.implProject).toBe('demo-impl-1.2.3');
      expect(built.implProjectIdentifier).toBe('demo-1.2.3');
      // Bare, because this identifier is what the caller holds; the customer's
      // Project.link selects the release.
      expect(built.implBots[0].identifier?.[0].value).toBe('demo-impl');
    });

    it('carries streamingEnabled through to the impl bot', () => {
      const built = buildPackage(linkedManifest, { target: 'staging' });
      expect(built.implBots[0].streamingEnabled).toBe(true);
    });

    it('keeps the per-major project when nothing is linked', () => {
      const built = buildPackage(manifest, { target: 'staging' });
      expect(built.implVersioning).toBe('identifier');
      expect(built.implProjectIdentifier).toBe('demo-v1');
    });
  });

  describe('data-only packages', () => {
    it('needs no impl project at all', () => {
      const built = buildPackage(dataManifest, { target: 'staging' });
      expect(built.implBots).toHaveLength(0);
      expect(built.implProject).toBeUndefined();
      expect(built.implProjectIdentifier).toBeUndefined();
    });

    it('merges declared data bundles into the install Bundle, tagged for teardown', () => {
      const packageDir = join(tmpdir(), `pkg-data-test-${Date.now()}`);
      mkdirSync(join(packageDir, 'data'), { recursive: true });
      writeFileSync(
        join(packageDir, 'data', 'seed.json'),
        JSON.stringify({
          resourceType: 'Bundle',
          type: 'transaction',
          entry: [
            {
              resource: { resourceType: 'ValueSet', url: 'https://example.com/vs/demo', status: 'active' },
              request: { method: 'PUT', url: 'ValueSet?url=https://example.com/vs/demo' },
            },
          ],
        })
      );

      const built = buildPackage(dataManifest, { target: 'staging', packageDir });
      const entries = built.installBundle.entry ?? [];
      expect(entries).toHaveLength(1);
      expect(entries[0].resource?.resourceType).toBe('ValueSet');
      // The author's request is preserved verbatim: only they know what makes the
      // resource idempotent.
      expect(entries[0].request?.url).toBe('ValueSet?url=https://example.com/vs/demo');
      expect(entries[0].resource?.meta?.tag).toContainEqual({
        system: PACKAGE_INSTALL_TAG_SYSTEM,
        code: 'demo-data',
      });
      expect(entries[0].resource?.meta?.tag).toContainEqual({
        system: PACKAGE_INSTALL_VERSION_TAG_SYSTEM,
        code: 'demo-data@1.2.3',
      });
    });

    it('fails loudly when a declared data bundle is missing', () => {
      const packageDir = join(tmpdir(), `pkg-data-missing-${Date.now()}`);
      mkdirSync(packageDir, { recursive: true });
      expect(() => buildPackage(dataManifest, { target: 'staging', packageDir })).toThrow(/data bundle not found/);
    });

    it('fails loudly when a data-bundle entry has no request', () => {
      const packageDir = join(tmpdir(), `pkg-data-noreq-${Date.now()}`);
      mkdirSync(join(packageDir, 'data'), { recursive: true });
      writeFileSync(
        join(packageDir, 'data', 'seed.json'),
        JSON.stringify({
          resourceType: 'Bundle',
          type: 'transaction',
          entry: [{ resource: { resourceType: 'ValueSet', url: 'https://example.com/vs/demo', status: 'active' } }],
        })
      );
      expect(() => buildPackage(dataManifest, { target: 'staging', packageDir })).toThrow(
        /missing request\.method\/url/
      );
    });
  });

  it('embeds the config Questionnaire when packageDir is set', () => {
    const packageDir = join(tmpdir(), `pkg-build-test-${Date.now()}`);
    mkdirSync(packageDir, { recursive: true });
    writeFileSync(
      join(packageDir, 'config-questionnaire.json'),
      JSON.stringify({
        resourceType: 'Questionnaire',
        url: 'https://medplum.com/fhir/Questionnaire/demo-install-config',
        name: 'DemoInstallConfig',
        status: 'active',
        item: [{ linkId: 'API_KEY', type: 'string', required: true }],
      })
    );

    const built = buildPackage(manifest, { target: 'staging', packageDir });
    const entries = built.installBundle.entry ?? [];
    const types = entries.map((e) => e.resource?.resourceType);
    expect(types).toContain('Questionnaire');
    // Only the webhook proxy. The post-install hook is a published impl bot, so it
    // is no longer copied into the customer project by the install Bundle.
    expect(types.filter((t) => t === 'Bot')).toHaveLength(1);

    // The Questionnaire is authored as a standalone file, so it arrives with no
    // `meta` of its own — and an untagged entry is one `$uninstall` cannot find.
    const embedded = entries.find((e) => e.resource?.resourceType === 'Questionnaire');
    expect(embedded?.resource?.meta?.tag).toContainEqual({ system: PACKAGE_INSTALL_TAG_SYSTEM, code: 'demo' });
    expect(embedded?.resource?.meta?.tag).toContainEqual({
      system: PACKAGE_INSTALL_VERSION_TAG_SYSTEM,
      code: 'demo@1.2.3',
    });
  });

  it('points the release at the version-tagged hook identifier', () => {
    const built = buildPackage(manifest, { target: 'staging' });
    expect(built.setupBotIdentifier).toBe('demo-post-install@1.2.3');

    // The hook is deployed with the other impl bots, not bundled.
    const implIds = built.implBots.map((b) => b.identifier?.[0]?.value);
    expect(implIds).toContain('demo-post-install@1.2.3');

    const bundledBotIds = (built.installBundle.entry ?? [])
      .map((e) => e.resource)
      .filter((r): r is Bot => r?.resourceType === 'Bot')
      .flatMap((r) => r.identifier ?? [])
      .map((i) => i.value);
    expect(bundledBotIds).not.toContain('demo-post-install');
  });
});

describe('generateWebhookProxyCode', () => {
  it('forwards the event input and content type to the impl bot', () => {
    // Pinned in full: this is the body that ships into every customer project, and
    // the `event.input !== undefined` fallback is what lets a raw webhook payload
    // through when the caller sends one instead of a wrapped event.
    expect(generateWebhookProxyCode('demo-impl', DEMO_BOT_SYSTEM, '1.2.3')).toBe(
      `// Generated by @medplum/package-types. Do not edit by hand.
exports.handler = async (medplum, event) => {
  return medplum.executeBot(
    { system: "https://www.medplum.com/bots/demo", value: "demo-impl@1.2.3" },
    event.input !== undefined ? event.input : event,
    event.contentType
  );
};
`
    );
  });

  it('pins the version when the identifier carries it', () => {
    const code = generateWebhookProxyCode('demo-impl', DEMO_BOT_SYSTEM, '1.2.3');
    expect(code).toContain('"demo-impl@1.2.3"');
    expect(code).toContain('executeBot');
  });

  it('forwards to the bare identifier when the project carries the version', () => {
    // Nothing version-specific in the code, so an upgrade is a link swap rather
    // than a per-customer redeploy.
    const code = generateWebhookProxyCode('demo-impl', DEMO_BOT_SYSTEM, undefined);
    expect(code).toContain('value: "demo-impl"');
    expect(code).not.toContain('demo-impl@');
  });

  it('no longer reads PackageInstallation, which most callers could not search', () => {
    const code = generateWebhookProxyCode('demo-impl', DEMO_BOT_SYSTEM, '1.2.3');
    expect(code).not.toContain('PackageInstallation');
  });
});
