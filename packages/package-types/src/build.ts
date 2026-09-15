// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type {
  Bot,
  Bundle,
  BundleEntry,
  ClientApplication,
  Coding,
  OperationDefinition,
  Questionnaire,
  Resource,
} from '@medplum/fhirtypes';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import {
  botIdentifierSystem,
  implProjectIdentifier,
  implProjectName,
  OPERATION_DEFINITION_IMPLEMENTATION_EXTENSION,
  PACKAGE_IMPL_TAG_SYSTEM,
  PACKAGE_IMPL_VERSION_TAG_SYSTEM,
  PACKAGE_INSTALL_TAG_SYSTEM,
  PACKAGE_INSTALL_VERSION_TAG_SYSTEM,
  packageVersionRef,
  versionedImplIdentifier,
} from './constants';
import type { BotRuntime, Hooks, ImplBot, PackageManifest, TargetEnv } from './types';
import { getImplBots, hasConsumerArtifacts, implVersioning } from './types';

export interface BuildOptions {
  target: TargetEnv;
  /**
   * Package root directory. When set, embeds the config `Questionnaire` and the
   * compiled post-install setup bot into the install Bundle (required for
   * `$install` validation).
   */
  packageDir?: string;
}

/** The set of artifacts a manifest compiles into for a single target env. */
export interface BuildArtifacts {
  packageId: string;
  version: string;
  majorVersion: number;
  target: TargetEnv;
  /**
   * Conventional impl project name, or undefined for a package with no impl bots
   * (a pure `reference-data` package needs no impl project at all).
   */
  implProject?: string;
  /**
   * Stable `identifier` value for the impl project. This, not the display name,
   * is what the publisher resolves the project by. Undefined when there is no
   * impl project.
   */
  implProjectIdentifier?: string;
  /**
   * Where this package's impl version lives: in the bot identifiers, or in the
   * impl project. Determines whether the publisher writes to a per-major or a
   * per-version project.
   */
  implVersioning: 'identifier' | 'project';
  /** Customer-side install Bundle (transaction); every entry is package-tagged. */
  installBundle: Bundle;
  /** Impl Bot resources published into the impl project (additive). */
  implBots: Bot[];
  /** Resolved per-env constants for the target. */
  envConstants: Record<string, string>;
  /** Hook references, passed through to the publisher. */
  hooks?: Hooks;
  /** Relative path to the config Questionnaire, passed through to the publisher. */
  configQuestionnaire?: string;
  /** Bot identifier for the post-install hook, when declared. */
  setupBotIdentifier?: string;
}

// Customer-side proxy bot runtime by target (no per-bot matrix for proxies).
function proxyRuntime(target: TargetEnv): BotRuntime {
  return target === 'local' ? { runtimeVersion: 'vmcontext' } : { runtimeVersion: 'awslambda', timeout: 30 };
}

// Two tags per resource: the package it belongs to, which is the teardown key and
// is stable across releases, and the release that last wrote it, which is what
// distinguishes a resource the current version still declares from one an upgrade
// left behind.
function installTag(packageId: string, version: string): Coding[] {
  return [
    { system: PACKAGE_INSTALL_TAG_SYSTEM, code: packageId },
    { system: PACKAGE_INSTALL_VERSION_TAG_SYSTEM, code: packageVersionRef(packageId, version) },
  ];
}

function implTag(packageId: string, version: string): Coding[] {
  return [
    { system: PACKAGE_IMPL_TAG_SYSTEM, code: packageId },
    { system: PACKAGE_IMPL_VERSION_TAG_SYSTEM, code: packageVersionRef(packageId, version) },
  ];
}

/**
 * Generates customer-side proxy bot code. The proxy keeps a stable identity
 * (URL/creds survive upgrades) and forwards to the impl bot across the project
 * link.
 *
 * How it addresses the impl bot depends on where the package keeps its version.
 * Under `'project'` versioning the impl identifier is already unversioned and the
 * customer's `Project.link` selects the release, so the proxy forwards to the bare
 * identifier and never has to be redeployed on upgrade. Under `'identifier'`
 * versioning it has to name `<impl>@<version>`, and since `PackageInstallation` is
 * a `projectAdminResourceType` in core the proxy cannot read the installed version
 * at runtime — neither a webhook running as its own non-admin membership nor a
 * provider-facing proxy running as a clinician can search it. The version is
 * therefore pinned at build time, which makes a within-major `$upgrade` a code
 * rewrite rather than a data flip. That rewrite is invisible to consumers, so the
 * stable-identity guarantee holds either way.
 * @param implIdentifier - The impl bot identifier this proxy delegates to.
 * @param identifierSystem - The package's Bot identifier system.
 * @param pinnedVersion - The build-time version, or undefined under project versioning.
 * @returns The generated proxy bot source code.
 */
export function generateWebhookProxyCode(
  implIdentifier: string,
  identifierSystem: string,
  pinnedVersion: string | undefined
): string {
  const target = JSON.stringify(implIdentifierFor(implIdentifier, pinnedVersion));
  return `// Generated by @medplum/package-types. Do not edit by hand.
exports.handler = async (medplum, event) => {
  return medplum.executeBot(
    { system: ${JSON.stringify(identifierSystem)}, value: ${target} },
    event.input !== undefined ? event.input : event,
    event.contentType
  );
};
`;
}

// Builds the `identifier` conditional for a customer-side Bot upsert. The token is
// encoded for the same reason the `name=` and `url=` conditionals are: an
// unencoded `&` or `?` would add search parameters, and the upsert would then
// match — and overwrite — something other than the intended resource. The
// validator constrains identifiers to slugs as well; this is the second line.
function identifierConditional(system: string, identifier: string): string {
  const token = `${system}|${identifier}`;
  return `identifier=${encodeURIComponent(token)}`;
}

// Applies the version tag to an impl identifier, or leaves it bare when the impl
// project carries the version instead.
function implIdentifierFor(identifier: string, versionTag: string | undefined): string {
  return versionTag ? versionedImplIdentifier(identifier, versionTag) : identifier;
}

// Wraps a resource as a conditional-update (upsert) transaction entry so
// re-applying the Bundle is idempotent.
function putEntry<T extends Resource>(resource: T, conditional: string): BundleEntry<T> {
  return { resource, request: { method: 'PUT', url: `${resource.resourceType}?${conditional}` } };
}

/**
 * Compiles a manifest into the artifacts for one target env: a tagged,
 * customer-side install transaction Bundle (proxy Bots, ClientApps,
 * OperationDefinitions, seed data) plus the impl Bot resources. Code upload
 * (`$deploy`) and registry writes are the publisher's job; this step is pure and
 * deterministic apart from reading the files the manifest names.
 *
 * Linked bots contribute nothing to the install Bundle by design, so a package
 * that exposes everything that way produces a Bundle with only its config
 * Questionnaire — and a pure data package produces one with no bots at all.
 * @param manifest - The loaded package manifest.
 * @param options - Build options (the target env).
 * @returns The compiled build artifacts for the target env.
 */
export function buildPackage(manifest: PackageManifest, options: BuildOptions): BuildArtifacts {
  const { target } = options;
  const packageId = manifest.package;
  const version = manifest.version;
  const envConstants = manifest.envConstants?.[target] ?? {};
  const identifierSystem = botIdentifierSystem(packageId);
  const versioning = implVersioning(manifest);

  // Under project versioning the project name carries the release, so the bot
  // identifiers stay bare and consumers can hold them across an upgrade.
  const implVersionTag = versioning === 'identifier' ? version : undefined;
  const declaredImplBots = getImplBots(manifest);
  const implBots: Bot[] = declaredImplBots.map((bot) =>
    buildImplBot(bot, packageId, version, target, identifierSystem, implVersionTag)
  );

  const ctx: EntryContext = { packageId, version, target, identifierSystem, implVersionTag };
  const installEntries: BundleEntry[] = [];

  if (hasConsumerArtifacts(manifest)) {
    installEntries.push(...buildConsumerEntries(manifest.artifacts.consumer, ctx));
  }

  if (options.packageDir) {
    installEntries.push(...readDataEntries(options.packageDir, manifest, packageId, version));
    const questionnaireEntry = buildConfigQuestionnaireEntry(options.packageDir, manifest, ctx);
    if (questionnaireEntry) {
      installEntries.push(questionnaireEntry);
    }
  }

  const installBundle: Bundle = { resourceType: 'Bundle', type: 'transaction', entry: installEntries };

  // The post-install hook is a published impl bot, so the release points at its
  // identifier rather than at a copy in the install Bundle. That makes an upgrade
  // pick up the new hook with no per-customer redeploy.
  const postInstallId = manifest.hooks?.postInstall
    ? implIdentifierFor(manifest.hooks.postInstall, implVersionTag)
    : undefined;

  // No impl bots means no impl project: a pure `reference-data` package ships a
  // Bundle and nothing else, so creating a project for it would leave an empty
  // one behind per release and a `Project.link` with nothing on the other end.
  const hasImplProject = declaredImplBots.length > 0;
  const projectVersion = versioning === 'project' ? version : undefined;

  return {
    packageId,
    version,
    majorVersion: manifest.majorVersion,
    target,
    implProject: hasImplProject ? implProjectName(packageId, manifest.majorVersion, projectVersion) : undefined,
    implProjectIdentifier: hasImplProject
      ? implProjectIdentifier(packageId, manifest.majorVersion, projectVersion)
      : undefined,
    implVersioning: versioning,
    installBundle,
    implBots,
    envConstants,
    hooks: manifest.hooks,
    configQuestionnaire: manifest.configQuestionnaire,
    setupBotIdentifier: postInstallId,
  };
}

/** The release coordinates every generated install entry is stamped with. */
interface EntryContext {
  packageId: string;
  version: string;
  target: TargetEnv;
  identifierSystem: string;
  /** Set only under identifier versioning; otherwise the project name carries the release. */
  implVersionTag: string | undefined;
}

type ConsumerArtifacts = Extract<PackageManifest['artifacts'], { consumer: object }>['consumer'];

/**
 * Builds the customer-project resources: webhook and proxy Bots, ClientApplications,
 * and OperationDefinitions.
 *
 * `linkedBots` deliberately produce no install entry. The whole point of the
 * exposure is that the customer project holds nothing for them: the caller names
 * the impl bot and the server resolves it across the link.
 * @param consumer - The manifest's consumer artifacts.
 * @param ctx - Release coordinates for tagging and identifiers.
 * @returns The install Bundle entries for the consumer surface.
 */
function buildConsumerEntries(consumer: ConsumerArtifacts, ctx: EntryContext): BundleEntry[] {
  const { packageId, version, identifierSystem, implVersionTag } = ctx;
  const runtime = proxyRuntime(ctx.target);
  const entries: BundleEntry[] = [];

  for (const wb of consumer.webhookBots ?? []) {
    const bot: Bot = {
      resourceType: 'Bot',
      meta: { tag: installTag(packageId, version) },
      identifier: [{ system: identifierSystem, value: wb.identifier }],
      name: wb.name ?? wb.identifier,
      description: wb.description,
      runtimeVersion: runtime.runtimeVersion,
      timeout: runtime.timeout,
      runAsUser: false,
      code: generateWebhookProxyCode(wb.delegatesTo, identifierSystem, implVersionTag),
    };
    entries.push(putEntry(bot, identifierConditional(identifierSystem, wb.identifier)));
  }

  for (const pb of consumer.proxyBots ?? []) {
    const bot: Bot = {
      resourceType: 'Bot',
      meta: { tag: installTag(packageId, version) },
      identifier: [{ system: identifierSystem, value: pb.identifier }],
      name: pb.name ?? pb.identifier,
      description: pb.description,
      runtimeVersion: runtime.runtimeVersion,
      timeout: runtime.timeout,
      runAsUser: pb.runAsUser ?? true,
      code: generateWebhookProxyCode(pb.delegatesTo, identifierSystem, implVersionTag),
    };
    entries.push(putEntry(bot, identifierConditional(identifierSystem, pb.identifier)));
  }

  for (const ca of consumer.clientApplications ?? []) {
    const client: ClientApplication = {
      resourceType: 'ClientApplication',
      meta: { tag: installTag(packageId, version) },
      name: ca.name,
      description: ca.description,
    };
    // `ca.identifier` is deliberately not written: ClientApplication has no
    // identifier element, and `name` is its only search parameter, so the
    // upsert has to key on name. Two packages shipping the same client name
    // into one project would therefore collide.
    entries.push(putEntry(client, `name=${encodeURIComponent(ca.name)}`));
  }

  for (const op of consumer.operations ?? []) {
    const url = op.url ?? `https://medplum.com/fhir/OperationDefinition/${op.code}`;
    const od: OperationDefinition = {
      resourceType: 'OperationDefinition',
      meta: { tag: installTag(packageId, version) },
      url,
      name: op.code,
      title: op.title,
      status: 'active',
      kind: 'operation',
      code: op.code,
      system: op.system ?? false,
      type: op.type ?? true,
      instance: op.instance ?? false,
      resource: op.resource,
      parameter: op.parameter,
      extension: [
        {
          url: OPERATION_DEFINITION_IMPLEMENTATION_EXTENSION,
          valueReference: {
            // Logical reference to the impl bot. Core's `tryCustomOperation`
            // requires a literal `Bot/<id>`, so the publisher resolves this
            // across the Project.link before the release is registered; it is
            // an authoring convenience, not the wire form.
            identifier: { system: identifierSystem, value: implIdentifierFor(op.delegatesTo, implVersionTag) },
          },
        },
      ],
    };
    entries.push(putEntry(od, `url=${encodeURIComponent(url)}`));
  }

  return entries;
}

/**
 * Reads the optional install-config Questionnaire and returns its tagged entry.
 * @param packageDir - The package directory the manifest was loaded from.
 * @param manifest - The loaded package manifest.
 * @param ctx - Release coordinates for tagging.
 * @returns The Bundle entry, or undefined when the package declares no questionnaire.
 */
function buildConfigQuestionnaireEntry(
  packageDir: string,
  manifest: PackageManifest,
  ctx: EntryContext
): BundleEntry | undefined {
  const questionnaire = readConfigQuestionnaire(packageDir, manifest.configQuestionnaire);
  if (!questionnaire) {
    return undefined;
  }
  const conditional = questionnaire.url
    ? `url=${encodeURIComponent(questionnaire.url)}`
    : `name=${encodeURIComponent(questionnaire.name ?? questionnaire.title ?? 'install-config')}`;
  // Tagged like every other entry. It is authored as a standalone JSON file, so
  // it arrives without the `meta` the generated resources are built with — and
  // an untagged entry is one `$uninstall` cannot find.
  return putEntry(
    { ...questionnaire, meta: { ...questionnaire.meta, tag: installTag(ctx.packageId, ctx.version) } },
    conditional
  );
}

/**
 * Reads the declared data Bundles and returns their entries, tagged for teardown.
 *
 * The author's `request` is preserved verbatim: only they know what makes a given
 * resource idempotent, and inventing a conditional key here would silently change
 * what a re-install matches. Every entry with a resource must already carry one —
 * a bare POST would duplicate the row on the next `$install`.
 * @param packageDir - The package root directory.
 * @param manifest - The loaded package manifest.
 * @param packageId - The package identifier, for the install tag.
 * @param version - The release version, for the version tag.
 * @returns The data Bundle entries to append to the install Bundle.
 */
function readDataEntries(
  packageDir: string,
  manifest: PackageManifest,
  packageId: string,
  version: string
): BundleEntry[] {
  const entries: BundleEntry[] = [];
  for (const relativePath of manifest.artifacts.data?.bundles ?? []) {
    const file = resolveWithinPackage(packageDir, relativePath, 'artifacts.data.bundles');
    if (!existsSync(file)) {
      throw new Error(`data bundle not found at ${file}`);
    }
    const bundle = JSON.parse(readFileSync(file, 'utf8')) as Bundle;
    for (const [entryIndex, entry] of (bundle.entry ?? []).entries()) {
      if (!entry.resource) {
        continue;
      }
      if (!entry.request?.method || !entry.request.url) {
        throw new Error(
          `data bundle ${relativePath} entry[${entryIndex}] is missing request.method/url; ` +
            `without a conditional key, re-install would create a duplicate instead of updating.`
        );
      }
      entries.push({
        ...entry,
        resource: {
          ...entry.resource,
          meta: {
            ...entry.resource.meta,
            tag: [...(entry.resource.meta?.tag ?? []), ...installTag(packageId, version)],
          },
        },
      });
    }
  }
  return entries;
}

function readConfigQuestionnaire(packageDir: string, configPath: string | undefined): Questionnaire | undefined {
  if (!configPath) {
    return undefined;
  }
  const file = resolveWithinPackage(packageDir, configPath, 'configQuestionnaire');
  if (!existsSync(file)) {
    throw new Error(`configQuestionnaire not found at ${file}`);
  }
  return JSON.parse(readFileSync(file, 'utf8')) as Questionnaire;
}

/**
 * Resolves a manifest-declared path and requires it to stay inside the package.
 *
 * Manifest paths are author-supplied and their contents are read by the publisher
 * and, for bot files, uploaded as executable code — so `../..` traversal would be
 * a way to read whatever the publisher can and ship it into the shared impl
 * project.
 * @param packageDir - The package root directory.
 * @param relativePath - The manifest-declared path.
 * @param field - Manifest field name, for the error message.
 * @returns The resolved absolute path.
 */
export function resolveWithinPackage(packageDir: string, relativePath: string, field: string): string {
  const root = resolve(packageDir);
  const file = resolve(root, relativePath);
  if (file !== root && !file.startsWith(root + sep)) {
    throw new Error(
      `${field} "${relativePath}" resolves outside the package directory (${file}); refusing to read it.`
    );
  }
  return file;
}

function buildImplBot(
  bot: ImplBot,
  packageId: string,
  version: string,
  target: TargetEnv,
  identifierSystem: string,
  versionTag: string | undefined
): Bot {
  const runtime = bot.runtime[target];
  return {
    resourceType: 'Bot',
    meta: { tag: implTag(packageId, version) },
    identifier: [{ system: identifierSystem, value: implIdentifierFor(bot.identifier, versionTag) }],
    name: bot.name ?? bot.identifier,
    description: bot.description,
    runtimeVersion: runtime.runtimeVersion,
    timeout: runtime.timeout,
    runAsUser: bot.runAsUser ?? true,
    streamingEnabled: bot.streamingEnabled,
  };
}
