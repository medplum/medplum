// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk, badRequest } from '@medplum/core';
import { MockClient } from '@medplum/mock';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Mock, MockInstance } from 'vitest';
import { main } from '.';
import { createMedplumClient } from './util/client';

vi.mock('./util/client');

interface ManifestOverrides {
  version?: string;
  delegatesTo?: string;
  sideEffect?: boolean;
}

function manifestSource(overrides: ManifestOverrides = {}): string {
  const { version = '1.2.3', delegatesTo = 'demo-impl', sideEffect = false } = overrides;
  const runtime = `{
      local: { runtimeVersion: 'vmcontext' },
      staging: { runtimeVersion: 'awslambda', timeout: 30 },
      production: { runtimeVersion: 'awslambda', timeout: 60 },
    }`;
  return `import type { PackageManifest } from '@medplum/package-types';
${sideEffect ? "console.log('side effect');\n" : ''}export const manifest: PackageManifest = {
  schemaVersion: 1,
  package: 'demo',
  displayName: 'Demo',
  vendor: 'Acme',
  version: '${version}',
  majorVersion: 1,
  type: 'bot-integration',
  channel: 'stable',
  compatibility: { minMedplumVersion: '5.1.7' },
  configQuestionnaire: './config-questionnaire.json',
  artifacts: {
    consumer: {
      webhookBots: [{ identifier: 'demo-webhook', delegatesTo: '${delegatesTo}', runAsUser: false }],
    },
    impl: {
      bots: [{ identifier: 'demo-impl', file: 'dist/bots/demo-impl.js', runtime: ${runtime} }],
    },
  },
};
`;
}

describe('CLI Marketplace packages', () => {
  let medplum: MockClient;
  let packageDir: string;
  let processError: MockInstance;

  beforeAll(() => {
    process.exit = vi.fn<(exitCode?: number) => never>().mockImplementation(function exit(exitCode?: number) {
      throw new Error(`Process exited with exit code ${exitCode}`);
    });
    processError = vi.spyOn(process.stderr, 'write').mockImplementation(vi.fn());
  });

  beforeEach(() => {
    vi.clearAllMocks();
    medplum = new MockClient();
    console.log = vi.fn();
    console.warn = vi.fn();
    (createMedplumClient as unknown as Mock).mockImplementation(async () => medplum);

    packageDir = mkdtempSync(join(tmpdir(), 'medplum-cli-package-'));
    mkdirSync(join(packageDir, 'dist', 'bots'), { recursive: true });
    writeFileSync(join(packageDir, 'manifest.ts'), manifestSource());
    writeFileSync(join(packageDir, 'dist', 'bots', 'demo-impl.js'), 'exports.handler = async () => undefined;\n');
    writeFileSync(
      join(packageDir, 'config-questionnaire.json'),
      JSON.stringify({
        resourceType: 'Questionnaire',
        url: 'https://medplum.com/fhir/Questionnaire/demo-install-config',
        status: 'active',
        item: [{ linkId: 'API_KEY', type: 'string' }],
      })
    );
  });

  afterEach(() => {
    rmSync(packageDir, { recursive: true, force: true });
  });

  function logged(): string {
    return (console.log as unknown as Mock).mock.calls.map((c) => String(c[0])).join('\n');
  }

  /**
   * Pulls an id the publisher logged. The publisher resolves resources through
   * searches that `MemoryRepository` does not implement the same way the server
   * does (notably `_project`), so the log is the reliable handle on what it wrote.
   * @param pattern - Regex whose first capture group is the id.
   * @returns The captured id.
   */
  function loggedId(pattern: RegExp): string {
    const match = pattern.exec(logged());
    if (!match) {
      throw new Error(`No id matching ${pattern} in publisher output:\n${logged()}`);
    }
    return match[1];
  }

  describe('package validate', () => {
    test('passes a valid manifest', async () => {
      await main(['node', 'index.js', 'package', 'validate', packageDir]);
      expect(logged()).toContain('PASS — 0 error(s)');
    });

    test('fails a manifest whose delegatesTo names no impl bot', async () => {
      writeFileSync(join(packageDir, 'manifest.ts'), manifestSource({ delegatesTo: 'typo-impl' }));
      await expect(main(['node', 'index.js', 'package', 'validate', packageDir])).rejects.toThrow(
        'Process exited with exit code 1'
      );
      expect(logged()).toContain('delegates-to-unknown');
    });

    test('refuses to evaluate a manifest with a top-level side effect', async () => {
      // The AST rules gate loading rather than run beside it, because loading
      // executes the module in a process that may hold publish credentials.
      writeFileSync(join(packageDir, 'manifest.ts'), manifestSource({ sideEffect: true }));
      await expect(main(['node', 'index.js', 'package', 'validate', packageDir])).rejects.toThrow(
        'Process exited with exit code 1'
      );
      expect(logged()).toContain('disallowed-statement');
      expect(processError).toHaveBeenCalledWith(expect.stringContaining('it was not evaluated'));
    });

    test('flags a version already present in the registry', async () => {
      await expect(
        main(['node', 'index.js', 'package', 'validate', packageDir, '--existing-versions', '1.0.0,1.2.3'])
      ).rejects.toThrow('Process exited with exit code 1');
      expect(logged()).toContain('version-not-unique');
    });

    test('reports a missing manifest', async () => {
      const empty = mkdtempSync(join(tmpdir(), 'medplum-cli-empty-'));
      await expect(main(['node', 'index.js', 'package', 'validate', empty])).rejects.toThrow(
        'Process exited with exit code 1'
      );
      expect(processError).toHaveBeenCalledWith(expect.stringContaining('No manifest.ts found'));
      rmSync(empty, { recursive: true, force: true });
    });
  });

  describe('package build', () => {
    test('writes the install bundle, impl bot specs, and a build summary', async () => {
      await main(['node', 'index.js', 'package', 'build', packageDir]);

      const outDir = join(packageDir, 'dist', 'package', 'staging');
      const bundle = JSON.parse(readFileSync(join(outDir, 'install-bundle.json'), 'utf8'));
      const implBots = JSON.parse(readFileSync(join(outDir, 'impl-bots.json'), 'utf8'));
      const summary = JSON.parse(readFileSync(join(outDir, 'build-manifest.json'), 'utf8'));

      // The webhook proxy plus the config Questionnaire the manifest declares.
      expect(bundle.entry.map((e: { resource: { resourceType: string } }) => e.resource.resourceType)).toEqual([
        'Bot',
        'Questionnaire',
      ]);
      expect(implBots[0].identifier[0].value).toBe('demo-impl@1.2.3');
      expect(summary).toMatchObject({
        packageId: 'demo',
        version: '1.2.3',
        target: 'staging',
        implProject: 'demo-impl-v1',
        installEntryCount: 2,
        implBotCount: 1,
      });
    });

    test('compiles the runtime matrix for the requested target', async () => {
      await main(['node', 'index.js', 'package', 'build', packageDir, '--target', 'production']);
      const implBots = JSON.parse(
        readFileSync(join(packageDir, 'dist', 'package', 'production', 'impl-bots.json'), 'utf8')
      );
      expect(implBots[0].runtimeVersion).toBe('awslambda');
      expect(implBots[0].timeout).toBe(60);

      await main(['node', 'index.js', 'package', 'build', packageDir, '--target', 'local']);
      const localBots = JSON.parse(
        readFileSync(join(packageDir, 'dist', 'package', 'local', 'impl-bots.json'), 'utf8')
      );
      expect(localBots[0].runtimeVersion).toBe('vmcontext');
    });

    test('honours an explicit output directory', async () => {
      const out = join(packageDir, 'custom-out');
      await main(['node', 'index.js', 'package', 'build', packageDir, '--out', out]);
      expect(JSON.parse(readFileSync(join(out, 'build-manifest.json'), 'utf8')).packageId).toBe('demo');
    });

    test('rejects an unknown target', async () => {
      await expect(main(['node', 'index.js', 'package', 'build', packageDir, '--target', 'sandbox'])).rejects.toThrow(
        'Process exited with exit code 1'
      );
      expect(processError).toHaveBeenCalledWith(expect.stringContaining("'sandbox' is invalid"));
    });

    test('refuses to build a manifest that fails validation', async () => {
      writeFileSync(join(packageDir, 'manifest.ts'), manifestSource({ delegatesTo: 'typo-impl' }));
      await expect(main(['node', 'index.js', 'package', 'build', packageDir])).rejects.toThrow(
        'Process exited with exit code 1'
      );
      expect(processError).toHaveBeenCalledWith(expect.stringContaining('validation error'));
    });
  });

  describe('package publish', () => {
    let deployFails: boolean;

    beforeEach(() => {
      deployFails = false;
      medplum.router.router.add('POST', 'Bot/:id/$deploy', async () =>
        deployFails ? [badRequest('Bots not enabled for project')] : [allOk]
      );
    });

    test('is a dry run without --apply', async () => {
      await main(['node', 'index.js', 'package', 'publish', packageDir]);
      expect(logged()).toContain('DRY-RUN');
      expect(createMedplumClient).not.toHaveBeenCalled();
      expect(await medplum.searchResources('Project', { name: 'demo-impl-v1' })).toHaveLength(0);
    });

    test('creates the impl project, deploys impl bots, and uploads the install Bundle', async () => {
      await main(['node', 'index.js', 'package', 'publish', packageDir, '--apply']);

      expect(logged()).toContain('+ created impl project demo-impl-v1');
      const project = await medplum.readResource('Project', loggedId(/impl project: Project\/([\w-]+)/));
      // Narrowed on purpose: a linked customer resolves impl bots across the link
      // and nothing else, and an unset value exports the whole project.
      expect(project.exportedResourceType).toEqual(['Bot']);

      const bot = await medplum.readResource('Bot', loggedId(/deployed impl bot demo-impl@1\.2\.3 \(Bot\/([\w-]+)\)/));
      expect(bot.identifier?.[0].value).toBe('demo-impl@1.2.3');
      // Publish defaults to the staging target, so the bot carries that runtime.
      expect(bot.runtimeVersion).toBe('awslambda');
      expect(bot.timeout).toBe(30);
      // Deployed into the impl project rather than the publisher's own, so the
      // bot lands where `Project.link` can reach it.
      expect(bot.meta?.project).toBe(project.id);
      expect(logged()).toContain('install Bundle uploaded as Binary/');
    });

    test('records a publish AuditEvent naming the release and its artifacts', async () => {
      await main(['node', 'index.js', 'package', 'publish', packageDir, '--apply']);

      const audit = await medplum.searchOne('AuditEvent', {});
      expect(audit?.outcome).toBe('0');
      expect(audit?.outcomeDesc).toContain('demo@1.2.3 published');
      expect(audit?.outcomeDesc).toContain('artifactDigest=sha256:');
      expect(audit?.subtype?.[0].code).toBe('publish-success');
      expect(logged()).toContain('"auditRecorded": true');
    });

    test('refuses to republish a version, and overwrites it under --force', async () => {
      await main(['node', 'index.js', 'package', 'publish', packageDir, '--apply']);
      const releaseId = loggedId(/PackageRelease\/([\w-]+)/);

      // A released version is immutable. The impl-bot guard normally trips first,
      // but it scopes its search with `_project`, which `MemoryRepository` cannot
      // evaluate, so here the PackageRelease guard is the one that fires.
      await expect(main(['node', 'index.js', 'package', 'publish', packageDir, '--apply'])).rejects.toThrow(
        'Process exited with exit code 1'
      );
      expect(processError).toHaveBeenCalledWith(expect.stringContaining('immutable once published'));
      expect(processError).toHaveBeenCalledWith(expect.stringContaining('--force'));

      await main(['node', 'index.js', 'package', 'publish', packageDir, '--apply', '--force']);
      expect(logged()).toContain('"forced": true');
      // Overwritten in place: installers keep resolving the same release id.
      expect(logged()).toContain(`PackageRelease/${releaseId}`);
    });

    test('fails when the compiled bot code is missing', async () => {
      rmSync(join(packageDir, 'dist', 'bots', 'demo-impl.js'));
      await expect(main(['node', 'index.js', 'package', 'publish', packageDir, '--apply'])).rejects.toThrow(
        'Process exited with exit code 1'
      );
      expect(processError).toHaveBeenCalledWith(expect.stringContaining('Compiled bot code not found'));
    });

    test('audits a publish that fails partway through', async () => {
      deployFails = true;
      await expect(main(['node', 'index.js', 'package', 'publish', packageDir, '--apply'])).rejects.toThrow(
        'Process exited with exit code 1'
      );

      // The impl project was already created, so the attempt has to be
      // reconstructable from the catalog rather than only from CI logs.
      const audit = await medplum.searchOne('AuditEvent', {});
      expect(audit?.outcome).toBe('8');
      expect(audit?.subtype?.[0].code).toBe('publish-failure');
      expect(audit?.outcomeDesc).toContain('demo@1.2.3 failed');
      expect(audit?.outcomeDesc).toContain('Bots not enabled for project');
    });
  });
});
