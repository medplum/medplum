// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk, badRequest } from '@medplum/core';
import type { Bundle, Project } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Mock, MockInstance } from 'vitest';
import { main } from '.';
import type { PublishSummary } from './package-publish';
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

// A `reference-data` package: data is the deliverable, so there is no consumer
// bot surface and no impl project for the publisher to create.
const DATA_ONLY_MANIFEST = `import type { PackageManifest } from '@medplum/package-types';
export const manifest: PackageManifest = {
  schemaVersion: 1,
  package: 'demo-data',
  displayName: 'Demo Data',
  vendor: 'Acme',
  version: '1.2.3',
  majorVersion: 1,
  type: 'reference-data',
  channel: 'stable',
  compatibility: { minMedplumVersion: '5.1.7' },
  artifacts: {
    data: { bundles: ['./data/seed.json'] },
  },
};
`;

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
    vi.unstubAllEnvs();
    rmSync(packageDir, { recursive: true, force: true });
  });

  function logged(): string {
    return (console.log as unknown as Mock).mock.calls.map((c) => String(c[0])).join('\n');
  }

  function warned(): string {
    return (console.warn as unknown as Mock).mock.calls.map((c) => String(c[0])).join('\n');
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

  /**
   * The summary the publish subcommand prints, which is the same object
   * `publishPackage` returns to an end-to-end harness.
   * @returns The parsed publish summary.
   */
  function publishSummary(): PublishSummary {
    const json = (console.log as unknown as Mock).mock.calls
      .map((c) => String(c[0]))
      .reverse()
      .find((line) => line.startsWith('{'));
    if (!json) {
      throw new Error(`No publish summary in output:\n${logged()}`);
    }
    return JSON.parse(json);
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

    test('fails a publish whose AuditEvent could not be written', async () => {
      const createResource = medplum.createResource.bind(medplum);
      vi.spyOn(medplum, 'createResource').mockImplementation(async (resource) => {
        if (resource.resourceType === 'AuditEvent') {
          throw new Error('audit storage unavailable');
        }
        return createResource(resource);
      });

      // Not worth undoing the release over, but it must not read as success either.
      await expect(main(['node', 'index.js', 'package', 'publish', packageDir, '--apply'])).rejects.toThrow(
        'Process exited with exit code 1'
      );
      expect(warned()).toContain('could not record publish AuditEvent');
      expect(publishSummary().auditRecorded).toBe(false);
      expect(processError).toHaveBeenCalledWith(expect.stringContaining('not attributable'));
    });

    test('stamps the release with the source revision CI reports', async () => {
      const sha = 'a'.repeat(40);
      vi.stubEnv('GITHUB_SHA', sha);

      await main(['node', 'index.js', 'package', 'publish', packageDir, '--apply']);

      expect(publishSummary().sourceRevision).toBe(sha);
      const audit = await medplum.searchOne('AuditEvent', {});
      expect(audit?.outcomeDesc).toContain(`sourceRevision=${sha}`);
    });

    test('creates no impl project for a data-only package', async () => {
      writeFileSync(join(packageDir, 'manifest.ts'), DATA_ONLY_MANIFEST);
      mkdirSync(join(packageDir, 'data'), { recursive: true });
      writeFileSync(
        join(packageDir, 'data', 'seed.json'),
        JSON.stringify({
          resourceType: 'Bundle',
          type: 'transaction',
          entry: [
            {
              request: { method: 'POST', url: 'ValueSet', ifNoneExist: 'url=https://example.com/vs' },
              resource: { resourceType: 'ValueSet', status: 'active', url: 'https://example.com/vs' },
            },
          ],
        })
      );

      await main(['node', 'index.js', 'package', 'publish', packageDir, '--apply']);

      // Nothing to deploy and nothing for a customer to link to, so creating one
      // anyway would leave an empty project per release plus a link pointing at it.
      expect(logged()).toContain('impl project: none (data-only package)');
      const summary = publishSummary();
      expect(summary.implBotsDeployed).toBe(0);
      expect(summary.releaseId).toBeDefined();
    });

    describe('impl project resolution', () => {
      /**
       * Stands in for the two `ensureImplProject` lookups. `MemoryRepository`
       * indexes neither `Project.identifier` nor `Project.name`, so both searches
       * come back empty on their own and the publisher always creates a project.
       * @param answers - What each lookup should resolve to.
       * @param answers.byIdentifier - Resolves the impl-identifier search.
       * @param answers.byName - Resolves the `Project.name` search.
       */
      function resolveProject(answers: { byIdentifier?: Project; byName?: Project }): void {
        const searchOne = medplum.searchOne.bind(medplum);
        vi.spyOn(medplum, 'searchOne').mockImplementation((async (resourceType: string, query: any) => {
          if (resourceType === 'Project') {
            return query?.identifier ? answers.byIdentifier : answers.byName;
          }
          return searchOne(resourceType as 'Bot', query);
        }) as typeof medplum.searchOne);
      }

      test('reuses a project that carries the impl identifier', async () => {
        const claimed = await medplum.createResource<Project>({
          resourceType: 'Project',
          name: 'renamed-by-an-operator',
          features: ['bots'],
          exportedResourceType: ['Bot'],
        });
        resolveProject({ byIdentifier: claimed });

        await main(['node', 'index.js', 'package', 'publish', packageDir, '--apply']);

        expect(logged()).toContain(`impl project: Project/${claimed.id}`);
        expect(logged()).not.toContain('+ created impl project');
      });

      test('refuses to adopt a project matched only by name', async () => {
        const impostor = await medplum.createResource<Project>({ resourceType: 'Project', name: 'demo-impl-v1' });
        resolveProject({ byName: impostor });

        // Publishing runs as super admin, so a name search spans every project on
        // the deployment and `Project.name` is a display field any project can set.
        await expect(main(['node', 'index.js', 'package', 'publish', packageDir, '--apply'])).rejects.toThrow(
          'Process exited with exit code 1'
        );
        expect(processError).toHaveBeenCalledWith(expect.stringContaining('will not adopt a project by name'));
      });
    });

    test('writes the catalog resources into --catalog-project', async () => {
      const catalog = await medplum.createResource<Project>({ resourceType: 'Project', name: 'marketplace-catalog' });

      await main(['node', 'index.js', 'package', 'publish', packageDir, '--apply', '--catalog-project', catalog.id]);

      const summary = publishSummary();
      expect(logged()).toContain(`catalog project: Project/${catalog.id}`);
      // createBinary() streams into the caller's own project, so the catalog path
      // has to create the Binary as an ordinary resource with inline base64 instead.
      const installBinary = await medplum.readResource('Binary', summary.binaryId as string);
      expect(installBinary.meta?.project).toBe(catalog.id);
      const questionnaireBinary = await medplum.readResource('Binary', summary.configQuestionnaireBinaryId as string);
      expect(questionnaireBinary.meta?.project).toBe(catalog.id);

      const audit = await medplum.searchOne('AuditEvent', {});
      expect(audit?.meta?.project).toBe(catalog.id);
    });

    describe('already-published impl bots', () => {
      /**
       * Stands in for the impl-bot lookup, which scopes its search with `_project`
       * — a filter `MemoryRepository` cannot evaluate, so the guard never fires on
       * its own and the PackageRelease check masks it.
       * @param botId - The bot the search should resolve to.
       */
      function resolveImplBot(botId: string): void {
        const searchOne = medplum.searchOne.bind(medplum);
        vi.spyOn(medplum, 'searchOne').mockImplementation((async (resourceType: string, query: any) => {
          if (resourceType === 'Bot' && query?._project) {
            return medplum.readResource('Bot', botId);
          }
          return searchOne(resourceType as 'Bot', query);
        }) as typeof medplum.searchOne);
      }

      async function publishOnce(): Promise<string> {
        await main(['node', 'index.js', 'package', 'publish', packageDir, '--apply']);
        return loggedId(/deployed impl bot demo-impl@1\.2\.3 \(Bot\/([\w-]+)\)/);
      }

      test('refuses to overwrite one without --force', async () => {
        resolveImplBot(await publishOnce());

        await expect(main(['node', 'index.js', 'package', 'publish', packageDir, '--apply'])).rejects.toThrow(
          'Process exited with exit code 1'
        );
        expect(processError).toHaveBeenCalledWith(expect.stringContaining('is already published'));
        expect(processError).toHaveBeenCalledWith(expect.stringContaining('bump manifest.version'));
      });

      test('refreshes the row, not just the code, under --force', async () => {
        const botId = await publishOnce();
        resolveImplBot(botId);

        // Republished against a different target: the compiled code is unchanged
        // but the runtime settings are not, and `timeout` decides how the bot runs
        // rather than merely describing it. Deploying new code over a stale row
        // would leave a bot behaving like the previous publish.
        await main([
          'node',
          'index.js',
          'package',
          'publish',
          packageDir,
          '--apply',
          '--force',
          '--target',
          'production',
        ]);

        expect(logged()).toContain(`! re-deployed impl bot demo-impl@1.2.3 (Bot/${botId}) — --force`);
        const bot = await medplum.readResource('Bot', botId);
        expect(bot.timeout).toBe(60);
        expect(publishSummary().implBotsDeployed).toBe(1);
      });

      test('reports missing compiled code before rewriting the row under --force', async () => {
        resolveImplBot(await publishOnce());
        rmSync(join(packageDir, 'dist', 'bots', 'demo-impl.js'));

        await expect(
          main(['node', 'index.js', 'package', 'publish', packageDir, '--apply', '--force'])
        ).rejects.toThrow('Process exited with exit code 1');
        expect(processError).toHaveBeenCalledWith(expect.stringContaining('Compiled bot code not found'));
      });
    });

    describe('registry write', () => {
      /**
       * Fails the catalog listing that `upsertByIdentifier` starts with.
       * @param message - The error the server returns.
       */
      function failCatalogRead(message: string): void {
        const get = medplum.get.bind(medplum);
        vi.spyOn(medplum, 'get').mockImplementation((async (url: string | URL, options?: any) => {
          if (String(url).includes('/Package?')) {
            throw new Error(message);
          }
          return get(url, options);
        }) as typeof medplum.get);
      }

      test('is skipped when the server does not know the catalog resource types', async () => {
        failCatalogRead('Unknown resource type: Package');

        await main(['node', 'index.js', 'package', 'publish', packageDir, '--apply']);

        const summary = publishSummary();
        expect(summary.registrySkipped).toContain('Unknown resource type: Package');
        expect(summary.releaseId).toBeUndefined();
        expect(summary.notes).toContainEqual(expect.stringContaining('registry write skipped'));
        // The impl bots still deployed, so the skip has to be visible rather than silent.
        expect(summary.implBotsDeployed).toBe(1);
        expect(warned()).toContain('registry write skipped');
      });

      test('is not skipped for an unrelated failure', async () => {
        // Matching any "resource type … not found" used to swallow real failures
        // into a skip, leaving impl bots deployed with no catalog entry.
        failCatalogRead("Resource type 'Bot' not found in this project");

        await expect(main(['node', 'index.js', 'package', 'publish', packageDir, '--apply'])).rejects.toThrow(
          'Process exited with exit code 1'
        );
        expect(processError).toHaveBeenCalledWith(expect.stringContaining('not found in this project'));
      });
    });

    describe('--smoke', () => {
      function batchResponse(entries: { status: string; location?: string }[]): Bundle {
        return {
          resourceType: 'Bundle',
          type: 'batch-response',
          entry: entries.map(({ status, location }) => ({ response: { status, location } })),
        };
      }

      async function publishWithSmoke(): Promise<void> {
        await main(['node', 'index.js', 'package', 'publish', packageDir, '--apply', '--smoke']);
      }

      test('applies the install Bundle and removes what it created', async () => {
        await publishWithSmoke();

        const summary = publishSummary();
        expect(summary.smoke).toBe('pass');
        expect(summary.smokeLeftBehind).toBeUndefined();
        // The webhook proxy Bot and the config Questionnaire.
        expect(logged()).toContain('smoke: cleaned up 2 created resource(s)');
      });

      test('removes a created resource whose location is an absolute URL', async () => {
        vi.spyOn(medplum, 'executeBatch').mockResolvedValue(
          batchResponse([{ status: '201', location: 'https://api.medplum.com/fhir/R4/Questionnaire/q-1' }])
        );
        const deleteResource = vi.spyOn(medplum, 'deleteResource').mockResolvedValue(undefined);

        await publishWithSmoke();

        expect(deleteResource).toHaveBeenCalledWith('Questionnaire', 'q-1');
        expect(publishSummary().smokeLeftBehind).toBeUndefined();
      });

      test('deletes in reverse creation order', async () => {
        vi.spyOn(medplum, 'executeBatch').mockResolvedValue(
          batchResponse([
            { status: '201', location: 'Bot/bot-1' },
            { status: '201', location: 'Questionnaire/q-1' },
          ])
        );
        const order: string[] = [];
        vi.spyOn(medplum, 'deleteResource').mockImplementation(async (resourceType, id) => {
          order.push(`${resourceType}/${id}`);
        });

        await publishWithSmoke();

        // A later entry may reference an earlier one.
        expect(order).toStrictEqual(['Questionnaire/q-1', 'Bot/bot-1']);
      });

      test('records a created resource it cannot parse rather than dropping it', async () => {
        vi.spyOn(medplum, 'executeBatch').mockResolvedValue(
          batchResponse([{ status: '201', location: 'https://api.medplum.com/' }])
        );

        await publishWithSmoke();

        const summary = publishSummary();
        expect(summary.smokeLeftBehind).toStrictEqual(['https://api.medplum.com/']);
        expect(summary.notes).toContainEqual(expect.stringContaining('smoke test left 1 resource(s)'));
        const audit = await medplum.searchOne('AuditEvent', {});
        expect(audit?.entity).toContainEqual(expect.objectContaining({ name: 'smoke-left-behind' }));
      });

      test('records a created resource it cannot delete', async () => {
        vi.spyOn(medplum, 'executeBatch').mockResolvedValue(
          batchResponse([{ status: '201', location: 'Questionnaire/q-1' }])
        );
        vi.spyOn(medplum, 'deleteResource').mockRejectedValue(new Error('project is read-only'));

        await publishWithSmoke();

        expect(publishSummary().smokeLeftBehind).toStrictEqual(['Questionnaire/q-1']);
        expect(warned()).toContain('smoke: could not clean up Questionnaire/q-1');
      });

      test('leaves a resource that already existed in the publishing project', async () => {
        vi.spyOn(medplum, 'executeBatch').mockResolvedValue(batchResponse([{ status: '200', location: 'Bot/bot-1' }]));
        const deleteResource = vi.spyOn(medplum, 'deleteResource');

        await publishWithSmoke();

        expect(publishSummary().smoke).toBe('pass');
        expect(deleteResource).not.toHaveBeenCalled();
        expect(warned()).toContain('rather than creating one');
      });

      test('fails the publish when an entry does not apply', async () => {
        vi.spyOn(medplum, 'executeBatch').mockResolvedValue(batchResponse([{ status: '400' }]));

        // Reporting 'fail' in the summary while exiting 0 would leave CI green and
        // ship a release that every customer install replays.
        await expect(publishWithSmoke()).rejects.toThrow('Process exited with exit code 1');
        expect(processError).toHaveBeenCalledWith(expect.stringContaining('Smoke test failed'));
        // Already registered by this point, so the failure has to be audited.
        const audit = await medplum.searchOne('AuditEvent', {});
        expect(audit?.subtype?.[0].code).toBe('publish-failure');
      });

      test('fails the publish when the Bundle is rejected outright', async () => {
        vi.spyOn(medplum, 'executeBatch').mockRejectedValue(new Error('batch not supported'));

        await expect(publishWithSmoke()).rejects.toThrow('Process exited with exit code 1');
        expect(warned()).toContain('smoke: failed — batch not supported');
      });
    });
  });
});
