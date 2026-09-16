// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import ts from 'typescript';
import { TARGET_ENVS } from './constants';
import type { ImplBot, PackageManifest } from './types';
import { getImplBots, hasConsumerArtifacts } from './types';

export interface ValidationIssue {
  severity: 'error' | 'warning';
  /** Machine-readable issue code, e.g. `delegates-to-unknown`. */
  code: string;
  message: string;
  /** Optional dotted location within the manifest. */
  path?: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
}

export interface SemanticValidationOptions {
  /**
   * Versions already published for this package (e.g. from the registry). When
   * provided, the manifest's `version` must not collide with an existing one.
   */
  existingVersions?: string[];
}

const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-.]+))?(?:\+[0-9A-Za-z-.]+)?$/;

interface ParsedSemver {
  major: number;
  minor: number;
  patch: number;
  pre: string | undefined;
}

function parseSemver(value: string): ParsedSemver | undefined {
  const match = SEMVER_RE.exec(value);
  if (!match) {
    return undefined;
  }
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]), pre: match[4] };
}

/**
 * Semver 2.0 precedence: major/minor/patch, then a release beats a prerelease,
 * then prerelease identifiers (numeric by number, otherwise ASCII). Used only to
 * require `migrations` be strictly ascending — `$upgrade` walks the array in
 * order and `$rollback` walks it in reverse, so a mis-ordered list is a silent
 * wrong transform rather than a confusing authoring surface.
 * @param a - Left version.
 * @param b - Right version.
 * @returns Negative if `a` \< `b`, positive if `a` \> `b`, 0 if equal, undefined if either is not semver.
 */
function compareSemver(a: string, b: string): number | undefined {
  const left = parseSemver(a);
  const right = parseSemver(b);
  if (!left || !right) {
    return undefined;
  }
  const core = left.major - right.major || left.minor - right.minor || left.patch - right.patch;
  if (core !== 0) {
    return core;
  }
  if (left.pre === right.pre) {
    return 0;
  }
  if (!left.pre) {
    return 1;
  }
  if (!right.pre) {
    return -1;
  }
  return comparePrerelease(left.pre, right.pre);
}

function comparePrerelease(a: string, b: string): number {
  const leftIds = a.split('.');
  const rightIds = b.split('.');
  const n = Math.min(leftIds.length, rightIds.length);
  for (let i = 0; i < n; i++) {
    const cmp = comparePrereleaseId(leftIds[i], rightIds[i]);
    if (cmp !== 0) {
      return cmp;
    }
  }
  return leftIds.length - rightIds.length;
}

function comparePrereleaseId(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  const leftNumeric = /^\d+$/.test(left);
  const rightNumeric = /^\d+$/.test(right);
  if (leftNumeric && rightNumeric) {
    return Number(left) - Number(right);
  }
  if (leftNumeric !== rightNumeric) {
    return leftNumeric ? -1 : 1;
  }
  return left < right ? -1 : 1;
}

/**
 * Lowercase slug. Applies to the package id and to every authored identifier or
 * operation code, because these are not only labels — they are interpolated into
 * FHIR search queries (the install Bundle's conditional upserts, the generated
 * proxy's `PackageInstallation` lookup), into the impl project name, and into
 * `$deploy` filenames. A `&`, `?`, `|`, or space would change what a conditional
 * upsert matches rather than merely looking odd.
 */
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Collects a slug violation for one authored name.
function checkSlug(value: string | undefined, code: string, label: string, path: string): ValidationIssue | undefined {
  if (value && !SLUG_RE.test(value)) {
    return err(
      code,
      `${label} "${value}" must be a lowercase slug (a-z, 0-9, single hyphens). These are interpolated into FHIR search queries and project names, so other characters change what they match.`,
      path
    );
  }
  return undefined;
}

function err(code: string, message: string, path?: string): ValidationIssue {
  return { severity: 'error', code, message, path };
}

function warn(code: string, message: string, path?: string): ValidationIssue {
  return { severity: 'warning', code, message, path };
}

// Strips trailing `-impl` / `-bot` so a proxy identifier and its file basename can be compared.
function identifierStem(value: string): string {
  return value.replace(/-(impl|bot|webhook|proxy)$/, '');
}

// This is a typo heuristic, not a naming rule, so a package-name prefix on one
// side is not a mismatch — `spaces-post-install` and `hooks/post-install.js`
// describe the same artifact.
function stemsAlign(fileStem: string, identifierStemValue: string): boolean {
  return (
    fileStem === identifierStemValue ||
    identifierStemValue.endsWith(`-${fileStem}`) ||
    fileStem.endsWith(`-${identifierStemValue}`)
  );
}

/**
 * Validates the semantic invariants TypeScript cannot express on a loaded
 * manifest object: semver shape, major match, identifier uniqueness, runtime
 * matrix completeness, `delegatesTo`/`bindings` cross-references, env-constant
 * key symmetry, strictly ascending `migrations`, and (optionally) version
 * uniqueness against the registry.
 * @param manifest - The loaded manifest object.
 * @param options - Optional semantic-validation options (e.g. registry versions).
 * @returns The validation result with any issues found.
 */
export function validateManifestObject(
  manifest: PackageManifest,
  options: SemanticValidationOptions = {}
): ValidationResult {
  const issues: ValidationIssue[] = [];

  checkIdentity(manifest, options, issues);
  checkData(manifest, issues);

  const ctx = collectImplBots(manifest, issues);
  checkImplBots(ctx);
  if (hasConsumerArtifacts(manifest)) {
    checkConsumerArtifacts(ctx, manifest.artifacts.consumer);
  }
  checkHooks(ctx);
  checkEnvConstants(manifest, issues);
  checkMigrations(manifest, issues);

  return { ok: issues.every((x) => x.severity !== 'error'), issues };
}

/**
 * Shared state for the semantic checks. The impl-bot index is built once and
 * read by every consumer cross-reference, which is what makes the checks
 * order-dependent: `collectImplBots` must run before any of them.
 */
interface SemanticContext {
  manifest: PackageManifest;
  issues: ValidationIssue[];
  implBots: ImplBot[];
  /** Declared impl identifiers — the target set every `delegatesTo` must hit. */
  implIdentifiers: Set<string>;
  implBotsByIdentifier: Map<string, ImplBot>;
  /**
   * Linked identifiers name impl bots directly rather than customer-side copies,
   * which exempts them from the file-basename and streaming checks.
   */
  linkedIdentifiers: Set<string>;
}

// schemaVersion, semver shape, major agreement, registry collision, package slug.
function checkIdentity(manifest: PackageManifest, options: SemanticValidationOptions, issues: ValidationIssue[]): void {
  if (manifest.schemaVersion !== 1) {
    issues.push(
      err('schema-version', `Unsupported schemaVersion ${String(manifest.schemaVersion)}; only 1 is supported.`)
    );
  }

  const semver = parseSemver(manifest.version);
  if (!semver) {
    issues.push(err('version-semver', `version "${manifest.version}" is not valid semver.`, 'version'));
  } else if (semver.major !== manifest.majorVersion) {
    issues.push(
      err(
        'major-mismatch',
        `majorVersion ${manifest.majorVersion} does not match version major ${semver.major}.`,
        'majorVersion'
      )
    );
  }

  if (options.existingVersions?.includes(manifest.version)) {
    issues.push(
      err(
        'version-not-unique',
        `version "${manifest.version}" is already published for package "${manifest.package}".`,
        'version'
      )
    );
  }

  const packageSlug = checkSlug(manifest.package, 'package-id-format', 'package', 'package');
  if (packageSlug) {
    issues.push(packageSlug);
  }
}

// A `reference-data` package's data *is* the deliverable, so an empty one has
// nothing to install. Bot packages may carry data as an optional extra.
function checkData(manifest: PackageManifest, issues: ValidationIssue[]): void {
  const dataBundles = manifest.artifacts.data?.bundles ?? [];
  if (manifest.type === 'reference-data' && dataBundles.length === 0) {
    issues.push(
      err(
        'data-empty',
        'a reference-data package must declare at least one artifacts.data.bundles entry; its data is the whole deliverable.',
        'artifacts.data.bundles'
      )
    );
  }
  for (const [i, path] of dataBundles.entries()) {
    if (!path) {
      issues.push(err('data-file-missing', 'data bundle entry is empty.', `artifacts.data.bundles[${i}]`));
    }
  }
}

// Indexes the impl bots and reports identifier problems. Runs before every other
// cross-reference check, which resolves `delegatesTo` against the index it builds.
function collectImplBots(manifest: PackageManifest, issues: ValidationIssue[]): SemanticContext {
  const implBots = getImplBots(manifest);
  const implIdentifiers = new Set<string>();
  const implBotsByIdentifier = new Map<string, ImplBot>();

  // Required for a bot package and optional for a data one, where the only
  // reason to ship code is a postInstall hook.
  if (implBots.length === 0 && manifest.type !== 'reference-data') {
    issues.push(err('impl-empty', 'artifacts.impl.bots must contain at least one bot.', 'artifacts.impl.bots'));
  }

  for (const [i, bot] of implBots.entries()) {
    const path = `artifacts.impl.bots[${i}]`;
    if (!bot.identifier) {
      issues.push(err('impl-identifier-missing', 'impl bot is missing an identifier.', path));
      continue;
    }
    if (implIdentifiers.has(bot.identifier)) {
      issues.push(err('impl-identifier-duplicate', `duplicate impl identifier "${bot.identifier}".`, path));
    }
    implIdentifiers.add(bot.identifier);
    implBotsByIdentifier.set(bot.identifier, bot);
    const implSlug = checkSlug(bot.identifier, 'identifier-format', 'impl bot identifier', `${path}.identifier`);
    if (implSlug) {
      issues.push(implSlug);
    }
  }

  return {
    manifest,
    issues,
    implBots,
    implIdentifiers,
    implBotsByIdentifier,
    linkedIdentifiers: new Set<string>(
      hasConsumerArtifacts(manifest) ? (manifest.artifacts.consumer.linkedBots ?? []).map((b) => b.identifier) : []
    ),
  };
}

// Per-bot checks that do not depend on the consumer section: file path, runtime
// matrix completeness, and admin justification.
function checkImplBots(ctx: SemanticContext): void {
  for (const [i, bot] of ctx.implBots.entries()) {
    if (!bot.identifier) {
      continue;
    }
    const path = `artifacts.impl.bots[${i}]`;
    checkImplBotFile(ctx, bot, path);

    for (const env of TARGET_ENVS) {
      if (!bot.runtime?.[env]) {
        ctx.issues.push(
          err('runtime-incomplete', `impl bot "${bot.identifier}" is missing runtime for "${env}".`, `${path}.runtime`)
        );
      }
    }
    checkAdminReason(ctx.issues, bot, `impl bot "${bot.identifier}"`, `${path}.adminReason`);
  }
}

function checkImplBotFile(ctx: SemanticContext, bot: ImplBot, path: string): void {
  if (!bot.file) {
    ctx.issues.push(err('impl-file-missing', `impl bot "${bot.identifier}" is missing a file path.`, `${path}.file`));
    return;
  }
  // Skipped for linked bots: their identifier is the name callers already use,
  // chosen for the capability rather than for the module that implements it, so
  // a divergence from the file basename is the design and not drift.
  if (ctx.linkedIdentifiers.has(bot.identifier)) {
    return;
  }
  const base = bot.file.replace(/^.*\//, '').replace(/\.[cm]?[jt]s$/i, '');
  if (!stemsAlign(identifierStem(base), identifierStem(bot.identifier))) {
    ctx.issues.push(
      warn(
        'impl-file-basename',
        `impl bot "${bot.identifier}" file basename "${base}" does not align with the identifier.`,
        `${path}.file`
      )
    );
  }
}

// `admin: true` is a privilege request, so it has to carry a reason a reviewer
// can weigh. Shared by impl, webhook, and proxy bots.
function checkAdminReason(
  issues: ValidationIssue[],
  bot: { admin?: boolean; adminReason?: string },
  label: string,
  path: string
): void {
  if (bot.admin === true && !bot.adminReason) {
    issues.push(err('admin-reason-missing', `${label} requests admin without adminReason.`, path));
  }
}

function checkDelegatesTo(ctx: SemanticContext, label: string, delegatesTo: string, path: string): void {
  if (!ctx.implIdentifiers.has(delegatesTo)) {
    ctx.issues.push(err('delegates-to-unknown', `${label} delegatesTo unknown impl "${delegatesTo}".`, path));
  }
}

type ConsumerArtifacts = Extract<PackageManifest['artifacts'], { consumer: object }>['consumer'];

/**
 * Cross-references every consumer exposure against the impl bots, then checks the
 * contract in the other direction (impl -> consumer) for completeness.
 *
 * Webhook and general proxies share one customer-side Bot identifier namespace,
 * so uniqueness is checked against the union. `bindings` is the narrower question
 * of which bots a webhook client may invoke, so it is checked against webhook
 * identifiers only.
 * @param ctx - Shared semantic-validation state.
 * @param consumer - The manifest's consumer artifacts.
 */
function checkConsumerArtifacts(ctx: SemanticContext, consumer: ConsumerArtifacts): void {
  const proxyIdentifiers = new Set<string>();
  const webhookIdentifiers = new Set<string>();
  const seenLinked = new Set<string>();

  checkLinkedBots(ctx, consumer, seenLinked);
  checkWebhookBots(ctx, consumer, proxyIdentifiers, webhookIdentifiers);
  checkOperations(ctx, consumer);
  checkProxyBots(ctx, consumer, proxyIdentifiers);
  checkIdentifierCollisions(ctx, seenLinked, proxyIdentifiers);
  checkClientApplications(ctx, consumer, proxyIdentifiers, webhookIdentifiers);
  checkContractCompleteness(ctx, consumer);
}

function checkLinkedBots(ctx: SemanticContext, consumer: ConsumerArtifacts, seenLinked: Set<string>): void {
  for (const [i, lb] of (consumer.linkedBots ?? []).entries()) {
    const path = `artifacts.consumer.linkedBots[${i}]`;
    if (seenLinked.has(lb.identifier)) {
      ctx.issues.push(err('linked-identifier-duplicate', `duplicate linked identifier "${lb.identifier}".`, path));
    }
    seenLinked.add(lb.identifier);

    // Checked before the impl lookup, because a versioned identifier never
    // matches a declared impl bot and the specific diagnosis is more useful
    // than "unknown".
    if (lb.identifier.includes('@')) {
      ctx.issues.push(
        err(
          'linked-identifier-unversioned',
          `linked bot "${lb.identifier}" carries a version. A linked identifier is what consumers hold, so the version lives in the impl project instead.`,
          `${path}.identifier`
        )
      );
      continue;
    }

    const linked = ctx.implBotsByIdentifier.get(lb.identifier);
    if (!linked) {
      ctx.issues.push(
        err(
          'linked-unknown',
          `linked bot "${lb.identifier}" is not a declared impl bot. A linked exposure names the impl bot callers invoke directly.`,
          `${path}.identifier`
        )
      );
      continue;
    }
    // A bot reached across a link has no membership in the customer project, so
    // `runAsUser: false` would resolve to the impl project's own membership and
    // the bot would read and write the publisher's project instead of the
    // caller's. That is not a degraded mode, it is the wrong project.
    if (linked.runAsUser === false) {
      ctx.issues.push(
        err(
          'linked-requires-run-as-user',
          `linked bot "${lb.identifier}" sets runAsUser: false, so reached across Project.link it would execute in the impl project rather than the caller's. Expose it as a webhook or proxy bot instead.`,
          `${path}.identifier`
        )
      );
    }
  }
}

function checkWebhookBots(
  ctx: SemanticContext,
  consumer: ConsumerArtifacts,
  proxyIdentifiers: Set<string>,
  webhookIdentifiers: Set<string>
): void {
  for (const [i, wb] of (consumer.webhookBots ?? []).entries()) {
    const path = `artifacts.consumer.webhookBots[${i}]`;
    if (proxyIdentifiers.has(wb.identifier)) {
      ctx.issues.push(err('webhook-identifier-duplicate', `duplicate webhook identifier "${wb.identifier}".`, path));
    }
    proxyIdentifiers.add(wb.identifier);
    webhookIdentifiers.add(wb.identifier);
    const wbSlug = checkSlug(wb.identifier, 'identifier-format', 'webhook bot identifier', `${path}.identifier`);
    if (wbSlug) {
      ctx.issues.push(wbSlug);
    }
    checkDelegatesTo(ctx, `webhook bot "${wb.identifier}"`, wb.delegatesTo, `${path}.delegatesTo`);
    checkAdminReason(ctx.issues, wb, `webhook bot "${wb.identifier}"`, `${path}.adminReason`);
  }
}

function checkOperations(ctx: SemanticContext, consumer: ConsumerArtifacts): void {
  const operationCodes = new Set<string>();
  for (const [i, op] of (consumer.operations ?? []).entries()) {
    const path = `artifacts.consumer.operations[${i}]`;
    if (operationCodes.has(op.code)) {
      ctx.issues.push(err('operation-code-duplicate', `duplicate operation code "${op.code}".`, path));
    }
    operationCodes.add(op.code);
    const opSlug = checkSlug(op.code, 'identifier-format', 'operation code', `${path}.code`);
    if (opSlug) {
      ctx.issues.push(opSlug);
    }
    checkDelegatesTo(ctx, `operation "${op.code}"`, op.delegatesTo, `${path}.delegatesTo`);
    // `resource` is optional on `OperationDefinition`, so this is the only place
    // it is required. An operation defined on nothing is not dispatchable.
    if (!op.resource || op.resource.length === 0) {
      ctx.issues.push(
        err(
          'operation-resource-missing',
          `operation "${op.code}" must declare at least one resource.`,
          `${path}.resource`
        )
      );
    }
  }
}

function checkProxyBots(ctx: SemanticContext, consumer: ConsumerArtifacts, proxyIdentifiers: Set<string>): void {
  for (const [i, pb] of (consumer.proxyBots ?? []).entries()) {
    const path = `artifacts.consumer.proxyBots[${i}]`;
    if (proxyIdentifiers.has(pb.identifier)) {
      ctx.issues.push(err('proxy-identifier-duplicate', `duplicate proxy identifier "${pb.identifier}".`, path));
    }
    proxyIdentifiers.add(pb.identifier);
    const pbSlug = checkSlug(pb.identifier, 'identifier-format', 'proxy bot identifier', `${path}.identifier`);
    if (pbSlug) {
      ctx.issues.push(pbSlug);
    }
    checkDelegatesTo(ctx, `proxy bot "${pb.identifier}"`, pb.delegatesTo, `${path}.delegatesTo`);
    checkAdminReason(ctx.issues, pb, `proxy bot "${pb.identifier}"`, `${path}.adminReason`);
  }
}

// A linked identifier names a bot in the impl project; a proxy or webhook
// identifier names one written into the customer project. Both are published
// under the same per-package identifier system, so reusing a name across the two
// puts two bots behind one `system|value` — and `Bot/$execute?identifier=`
// searches the customer project *and* every project it links to, so the call
// becomes ambiguous. Current servers reject that outright; older ones pick one.
function checkIdentifierCollisions(ctx: SemanticContext, seenLinked: Set<string>, proxyIdentifiers: Set<string>): void {
  for (const identifier of seenLinked) {
    if (proxyIdentifiers.has(identifier)) {
      ctx.issues.push(
        err(
          'linked-proxy-identifier-collision',
          `"${identifier}" is declared both as a linked bot and as a customer-side proxy or webhook. Both publish under the same identifier system, so a caller naming it would match two bots.`,
          'artifacts.consumer'
        )
      );
    }
  }
}

function checkClientApplications(
  ctx: SemanticContext,
  consumer: ConsumerArtifacts,
  proxyIdentifiers: Set<string>,
  webhookIdentifiers: Set<string>
): void {
  for (const [i, ca] of (consumer.clientApplications ?? []).entries()) {
    const path = `artifacts.consumer.clientApplications[${i}]`;
    for (const [j, binding] of ca.bindings.entries()) {
      if (webhookIdentifiers.has(binding)) {
        continue;
      }
      const detail = proxyIdentifiers.has(binding)
        ? `"${binding}" is a provider-facing proxy, not a webhook bot; a webhook client has no calling user to run it as`
        : `no webhook bot named "${binding}" is declared`;
      ctx.issues.push(
        err(
          'binding-unknown',
          `clientApplication "${ca.identifier}" binds "${binding}": ${detail}.`,
          `${path}.bindings[${j}]`
        )
      );
    }
  }
}

/**
 * Every other cross-reference check runs consumer -> impl. This is the one that
 * runs impl -> consumer, and it is the one consumers depend on: a capability
 * nothing exposes cannot be called at all, and one exposed only under a versioned
 * name cannot be called by anything that survives an upgrade.
 *
 * Scoped to packages that have a consumer section at all. A `reference-data`
 * package has no bot exposure mechanism by construction, so its bots are always
 * package-internal and requiring `internal: true` on each would be noise rather
 * than a decision.
 * @param ctx - Shared semantic-validation state.
 * @param consumer - The manifest's consumer artifacts.
 */
function checkContractCompleteness(ctx: SemanticContext, consumer: ConsumerArtifacts): void {
  const indirectlyExposed = new Set<string>([
    ...(consumer.webhookBots ?? []).map((b) => b.delegatesTo),
    ...(consumer.proxyBots ?? []).map((b) => b.delegatesTo),
    ...(consumer.operations ?? []).map((o) => o.delegatesTo),
  ]);
  const exposed = new Set<string>([
    ...ctx.linkedIdentifiers,
    ...indirectlyExposed,
    // A hook has no customer-side name by design — the install engine addresses
    // it by the identifier carried on the PackageRelease. Being named by
    // `hooks` is the same declaration of intent as `internal: true`, so
    // requiring both would be redundant bookkeeping.
    ...Object.values(ctx.manifest.hooks ?? {}).filter((id): id is string => !!id),
  ]);

  for (const [i, bot] of ctx.implBots.entries()) {
    const path = `artifacts.impl.bots[${i}]`;
    if (!bot.internal && !exposed.has(bot.identifier)) {
      ctx.issues.push(
        err(
          'impl-not-exposed',
          `impl bot "${bot.identifier}" has no consumer entry point: no linked bot, proxy, or operation names it. ` +
            `Declare one, or mark it "internal: true" if only other bots call it.`,
          path
        )
      );
    }

    // Neither indirection forwards a stream: a proxy bot is a buffered
    // `executeBot` call, and the custom-operation path builds a `Parameters`
    // response. Left unchecked this degrades silently — the bot runs, returns
    // its whole output at the end, and the caller waits out the entire
    // generation with no indication that streaming was dropped.
    if (bot.streamingEnabled && !ctx.linkedIdentifiers.has(bot.identifier) && indirectlyExposed.has(bot.identifier)) {
      ctx.issues.push(
        err(
          'streaming-requires-linked',
          `impl bot "${bot.identifier}" sets streamingEnabled but is exposed through a proxy or operation, neither of which forwards a stream. Expose it as a linked bot.`,
          `${path}.streamingEnabled`
        )
      );
    }
  }
}

// A hook is published as an impl bot rather than shipped in the install Bundle,
// so it must name one, and it must be able to act as the installing admin (its
// job includes writing `Project.secret`, which a bot's own non-admin membership
// cannot do).
function checkHooks(ctx: SemanticContext): void {
  for (const [key, identifier] of Object.entries(ctx.manifest.hooks ?? {})) {
    if (!identifier) {
      continue;
    }
    const path = `hooks.${key}`;
    const bot = ctx.implBotsByIdentifier.get(identifier);
    if (!bot) {
      ctx.issues.push(
        err(
          'hook-unknown',
          `${path} names "${identifier}", which is not a declared impl bot. Hooks are published as impl bots, not shipped in the install Bundle.`,
          path
        )
      );
      continue;
    }
    if (bot.runAsUser === false) {
      ctx.issues.push(
        err(
          'hook-run-as-bot',
          `hook bot "${identifier}" sets runAsUser: false, so it would execute as its own non-admin membership and could not write Project.secret. Hooks must run as the installing admin.`,
          path
        )
      );
    }
  }
}

function checkEnvConstants(manifest: PackageManifest, issues: ValidationIssue[]): void {
  if (!manifest.envConstants) {
    return;
  }
  const keysByEnv = TARGET_ENVS.map((env) => new Set(Object.keys(manifest.envConstants?.[env] ?? {})));
  const allKeys = new Set<string>(keysByEnv.flatMap((s) => [...s]));
  for (const [idx, env] of TARGET_ENVS.entries()) {
    for (const key of allKeys) {
      if (!keysByEnv[idx].has(key)) {
        issues.push(
          warn(
            'env-constant-asymmetry',
            `envConstants.${env} is missing key "${key}" present in another env.`,
            `envConstants.${env}`
          )
        );
      }
    }
  }
}

// `$upgrade` walks this array in order and `$rollback` walks it in reverse, so
// the declared file order *is* the execution order. A list that is not strictly
// ascending would apply the wrong transform (or apply a later one first) with
// no other signal. Invalid semver is already an error; those entries are skipped
// here so one typo does not cascade into a spurious order complaint.
function checkMigrations(manifest: PackageManifest, issues: ValidationIssue[]): void {
  const migrations = manifest.migrations ?? [];
  for (const [i, m] of migrations.entries()) {
    if (!parseSemver(m.version)) {
      issues.push(
        err(
          'migration-version-semver',
          `migrations[${i}].version "${m.version}" is not valid semver.`,
          `migrations[${i}].version`
        )
      );
    }
    if (!m.file) {
      issues.push(err('migration-file-missing', `migrations[${i}] is missing a file path.`, `migrations[${i}].file`));
    }
  }
  for (let i = 1; i < migrations.length; i++) {
    const prev = migrations[i - 1].version;
    const curr = migrations[i].version;
    const cmp = compareSemver(prev, curr);
    if (cmp !== undefined && cmp >= 0) {
      issues.push(
        err(
          'migration-order',
          `migrations[${i}].version "${curr}" is not greater than the preceding "${prev}". $upgrade walks this array in order and $rollback walks it in reverse.`,
          `migrations[${i}].version`
        )
      );
    }
  }
}

const ALLOWED_VALUE_IMPORT = '@medplum/package-types';

/**
 * AST-validates a `manifest.ts` source: the module must be declarative — exactly
 * one exported `manifest` const, only `import type` statements (plus value
 * imports from `@medplum/package-types`), and no top-level side effects
 * (IIFEs, top-level await, function/class declarations, bare expressions).
 * @param sourceText - The `manifest.ts` source text.
 * @param fileName - The file name used for AST diagnostics.
 * @returns The validation result with any issues found.
 */
export function validateManifestSource(sourceText: string, fileName = 'manifest.ts'): ValidationResult {
  const issues: ValidationIssue[] = [];
  const sf = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

  let manifestExportCount = 0;

  for (const stmt of sf.statements) {
    if (ts.isImportDeclaration(stmt)) {
      checkImportDeclaration(stmt, issues);
    } else if (ts.isVariableStatement(stmt)) {
      manifestExportCount += checkVariableStatement(stmt, issues);
    } else if (!isDeclarativeStatement(stmt)) {
      issues.push(
        err(
          'disallowed-statement',
          `disallowed top-level statement (${ts.SyntaxKind[stmt.kind]}); manifests must be declarative.`
        )
      );
    }
  }

  if (manifestExportCount === 0) {
    issues.push(err('manifest-export-missing', 'manifest module must export `const manifest`.'));
  } else if (manifestExportCount > 1) {
    issues.push(err('manifest-export-duplicate', 'manifest module must export `manifest` exactly once.'));
  }

  return { ok: issues.every((x) => x.severity !== 'error'), issues };
}

/**
 * Type aliases, interfaces, empty statements, and re-exports carry no runtime
 * behavior, so they are allowed anywhere in a manifest module.
 * @param stmt - A top-level statement.
 * @returns True when the statement cannot execute anything.
 */
function isDeclarativeStatement(stmt: ts.Statement): boolean {
  return (
    ts.isTypeAliasDeclaration(stmt) ||
    ts.isInterfaceDeclaration(stmt) ||
    stmt.kind === ts.SyntaxKind.EmptyStatement ||
    // Re-exports / default export of the manifest are permitted if declarative.
    ts.isExportDeclaration(stmt) ||
    ts.isExportAssignment(stmt)
  );
}

// Only `import type` is allowed, so that loading the module cannot execute a
// dependency — the manifest is evaluated by a process holding publish credentials.
function checkImportDeclaration(stmt: ts.ImportDeclaration, issues: ValidationIssue[]): void {
  // `phaseModifier`, not the deprecated `isTypeOnly`: it also distinguishes
  // `import type` from `import defer`, which is a value import.
  const isTypeOnly = stmt.importClause?.phaseModifier === ts.SyntaxKind.TypeKeyword;
  const moduleText = ts.isStringLiteral(stmt.moduleSpecifier) ? stmt.moduleSpecifier.text : '';
  const namedTypeOnly =
    stmt.importClause?.namedBindings &&
    ts.isNamedImports(stmt.importClause.namedBindings) &&
    stmt.importClause.namedBindings.elements.every((e) => e.isTypeOnly);
  if (!isTypeOnly && !namedTypeOnly && moduleText !== ALLOWED_VALUE_IMPORT) {
    issues.push(
      err(
        'non-type-import',
        `manifest may only use \`import type\` (or value imports from "${ALLOWED_VALUE_IMPORT}"); found a value import from "${moduleText}".`
      )
    );
  }
}

/**
 * Checks one top-level variable statement.
 * @param stmt - The variable statement.
 * @param issues - Collected issues, appended to in place.
 * @returns 1 if this statement exported `manifest`, else 0, for the export count.
 */
function checkVariableStatement(stmt: ts.VariableStatement, issues: ValidationIssue[]): number {
  const isExported = stmt.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
  const names = stmt.declarationList.declarations.map((d) => (ts.isIdentifier(d.name) ? d.name.text : ''));

  if (!isExported || !names.includes('manifest')) {
    // A non-exported / non-manifest const is allowed only if its initializer is side-effect free.
    if (stmt.declarationList.declarations.some((d) => d.initializer && containsSideEffect(d.initializer))) {
      issues.push(err('top-level-side-effect', 'top-level declarations must not have side effects.'));
    }
    return 0;
  }

  if ((stmt.declarationList.flags & ts.NodeFlags.Const) === 0) {
    issues.push(err('manifest-not-const', 'the exported `manifest` must be declared with `const`.'));
  }
  const decl = stmt.declarationList.declarations.find((d) => ts.isIdentifier(d.name) && d.name.text === 'manifest');
  if (decl?.initializer && containsSideEffect(decl.initializer)) {
    issues.push(
      err(
        'manifest-side-effect',
        'the `manifest` initializer must be a plain literal (no calls except `defineManifest`, no `await`).'
      )
    );
  }
  return 1;
}

// Detects calls (other than `defineManifest`) and `await` within an initializer.
function containsSideEffect(node: ts.Node): boolean {
  let found = false;
  const visit = (n: ts.Node): void => {
    if (found) {
      return;
    }
    if (ts.isAwaitExpression(n)) {
      found = true;
      return;
    }
    if (ts.isCallExpression(n)) {
      const callee = n.expression;
      const calleeName = ts.isIdentifier(callee) ? callee.text : '';
      if (calleeName !== 'defineManifest') {
        found = true;
        return;
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return found;
}
