// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Bot, ClientApplication, OperationDefinition } from '@medplum/fhirtypes';

/**
 * Marketplace package manifest types.
 *
 * A package is authored as a TypeScript module exporting exactly one binding:
 *
 *   import type { PackageManifest } from '@medplum/package-types';
 *   export const manifest: PackageManifest = { ...literal... };
 *
 * The discriminated unions here encode invariants the build/validator would
 * otherwise have to enforce at runtime, so an invalid manifest is a compile
 * error before CI ever runs `medplum package validate`.
 *
 * Fields that end up verbatim on a FHIR resource are derived from
 * `@medplum/fhirtypes` rather than redeclared, so the manifest cannot drift from
 * what the install Bundle is allowed to write. Only the manifest's own grammar —
 * identifiers, file paths, `delegatesTo` edges, admin grants — is declared here.
 */

/** Deployment targets a single `manifest.ts` is compiled against. */
export type TargetEnv = 'local' | 'staging' | 'production';

/** Top-level package kind. Drives the shape of `artifacts`. */
export type PackageType = 'bot-integration' | 'reference-data' | 'mixed';

/** Release channel; mirrors `PackageRelease` channel semantics. */
export type PackageChannel = 'stable' | 'beta' | 'canary' | 'end-of-life';

/**
 * Bot execution runtime. `vmcontext` for local dev, `awslambda` in staging/prod.
 *
 * Taken from `Bot.runtimeVersion` so the manifest offers exactly what the server
 * accepts. That includes `fission`, which no marketplace package uses; a build
 * targeting it simply produces a Bot the deployment has to support.
 */
export type BotRuntimeName = NonNullable<Bot['runtimeVersion']>;

/** A single env's bot runtime selection. */
export interface BotRuntime extends Pick<Bot, 'timeout'> {
  /** Required here, unlike on `Bot`: the runtime matrix exists to state it per env. */
  runtimeVersion: BotRuntimeName;
}

/**
 * Per-env bot runtime matrix. `Record<TargetEnv, …>` forces every target to be
 * present, so a missing entry is a compile error (RFC §Environments).
 */
export type BotRuntimeMatrix = Record<TargetEnv, BotRuntime>;

/**
 * Publisher-supplied, per-env constants that don't vary per customer but do
 * vary per Medplum env (e.g. a callback base URL). Resolved by
 * `medplum package build --target=<env>`.
 */
export type EnvConstants = Record<TargetEnv, Record<string, string>>;

/**
 * Admin-grant discriminator: a bot that requests `admin: true` must justify it
 * with `adminReason`. `admin` defaulting to false/absent forbids `adminReason`.
 *
 * Declaration only in v1. Admin is granted via `ProjectMembership.admin`, which
 * the install Bundle cannot write, so nothing in the build output acts on this
 * yet — a bot needing admin must still be granted it by the package's post-install
 * hook. Declaring it here makes the request reviewable at publish time and gives
 * the install handler something to act on once it can.
 */
export type AdminGrant = { admin?: false; adminReason?: never } | { admin: true; adminReason: string };

/**
 * A webhook proxy bot written into the customer project (stable identity). It
 * runs as the bot (`runAsUser: false`) and delegates to a version-tagged impl
 * bot by identifier. `delegatesTo` is cross-checked against impl identifiers by
 * `medplum package validate`.
 */
export type WebhookBot = Pick<Bot, 'name' | 'description'> & {
  /** Stable customer-side Bot identifier (e.g. `example-provider-webhook`). */
  identifier: string;
  /** Impl bot identifier this proxy forwards to (base identifier, no `@version`). */
  delegatesTo: string;
  /**
   * Narrowed from `Bot.runAsUser`: webhook proxies always run as the bot itself,
   * because an inbound webhook has no calling user.
   */
  runAsUser: false;
} & AdminGrant;

/**
 * A general customer-side proxy bot: a stable, **unversioned** identifier in the
 * customer project that forwards to a version-tagged impl bot.
 *
 * {@link WebhookBot} is the vendor-invoked special case, pinned to
 * `runAsUser: false` because an inbound webhook has no calling user. This is the
 * provider-facing counterpart, where `runAsUser` defaults to true so the impl bot
 * runs as the calling user (`getBotProjectMembership` returns the caller's
 * membership) and can act with their vendor session.
 *
 * Declare one only when a caller needs a Bot resource in the customer project —
 * typically because it must be referenced by id, or policied or disabled per
 * customer. When the caller merely invokes it by identifier, {@link LinkedBot} does
 * the same job with no per-customer Bot, Lambda, or membership, and without the
 * extra hop that costs a second invocation for the length of the call.
 */
export type ProxyBot = Pick<Bot, 'name' | 'description' | 'runAsUser'> & {
  /** Stable customer-side Bot identifier, with no `@version` suffix. */
  identifier: string;
  /** Impl bot identifier this proxy forwards to (base identifier, no `@version`). */
  delegatesTo: string;
} & AdminGrant;

/**
 * A FHIR custom operation exposed by the customer project, backed (via the
 * `operationDefinition-implementation` extension) by a proxy bot that delegates
 * to a version-tagged impl bot.
 *
 * `system` / `type` / `instance` are required on `OperationDefinition` but
 * optional here, because the build supplies the defaults a marketplace operation
 * almost always wants (type-level, not system- or instance-level).
 */
export type OperationBot = Pick<OperationDefinition, 'code' | 'url' | 'title' | 'resource' | 'parameter'> &
  Partial<Pick<OperationDefinition, 'system' | 'type' | 'instance'>> & {
    /** Impl bot identifier this operation forwards to. */
    delegatesTo: string;
  };

/**
 * A ClientApplication written into the customer project (e.g. the Basic-Auth
 * webhook client). `bindings` lists the webhook bot identifiers it authorizes.
 */
export interface ClientAppDef
  extends Required<Pick<ClientApplication, 'name'>>, Pick<ClientApplication, 'description'> {
  /**
   * Manifest-local handle only. `ClientApplication` has no `identifier` element
   * and no `identifier` search parameter, so this never reaches the server; the
   * install Bundle keys its conditional upsert on `name` instead. Use it to
   * refer to this client from validator output and other manifest sections.
   *
   * `name` is required here for the same reason: it is the upsert key, so it must
   * be unique within the customer project across every installed package.
   */
  identifier: string;
  /**
   * Webhook proxy bot identifiers this client is authorized to invoke. Entries
   * must name a {@link WebhookBot}; a general {@link ProxyBot} is rejected,
   * since an inbound webhook has no calling user to run one as.
   */
  bindings: string[];
}

/**
 * An impl bot exposed to consumers directly, with no customer-side resource at
 * all: the caller invokes this identifier and the server resolves it across
 * `Project.link` into the impl project.
 *
 * This is the narrowest exposure that works for a provider-facing capability,
 * and the only one that can stream — a proxy bot is a buffered
 * `executeBot` call, and the custom-operation path builds a `Parameters`
 * response. It requires the impl bot to run as the caller (`runAsUser: true`),
 * since a bot reached across a link has no membership in the customer project.
 *
 * Because the identifier doubles as the consumer contract, it must not carry a
 * version. A package using linked exposure therefore puts the version in the
 * impl *project* instead — see {@link implVersioning}.
 */
export interface LinkedBot extends Pick<Bot, 'description'> {
  /** Identifier of the impl bot exposed directly. Never carries a version. */
  identifier: string;
}

/**
 * An implementation bot published into the impl project.
 *
 * Deployed either as `<identifier>@<version>` into a per-major project, or under
 * the bare identifier into a per-version project when the package uses linked
 * exposure. {@link implVersioning} decides which, and the rule is that the
 * version lives in exactly one of the two places.
 */
export type ImplBot = Pick<Bot, 'name' | 'description' | 'runAsUser' | 'streamingEnabled'> & {
  /** Base identifier. */
  identifier: string;
  /** Path (relative to the package dir) to the compiled bot JS. */
  file: string;
  /** Per-env runtime selection; all three targets required. */
  runtime: BotRuntimeMatrix;
  /**
   * Declares the bot has no customer-facing entry point on purpose — it is only
   * ever invoked by other bots in the package. Without this, the validator
   * rejects an impl bot that nothing exposes, so shipping an unreachable
   * capability has to be a decision rather than an oversight.
   */
  internal?: boolean;
} & AdminGrant;

/**
 * The consumer contract: how callers reach the package's capabilities.
 *
 * `linkedBots` write nothing into the customer project; the other three write
 * stable-identity resources the install Bundle carries. Prefer the narrowest
 * entry that works.
 */
export interface ConsumerArtifacts {
  /** Impl bots callers invoke directly across the project link. */
  linkedBots?: LinkedBot[];
  /** Inbound endpoints for external systems; always `runAsUser: false`. */
  webhookBots?: WebhookBot[];
  /** Customer-side delegating bots, for callers that need a local Bot identity. */
  proxyBots?: ProxyBot[];
  clientApplications?: ClientAppDef[];
  operations?: OperationBot[];
}

/** Impl-project (published, additive) artifacts. */
export interface ImplArtifacts {
  bots: ImplBot[];
}

/**
 * Declarative data shipped by the install Bundle into the customer project.
 *
 * This is the whole payload of a `reference-data` package and needs no impl
 * project, no bots, and no `Project.link` beyond the catalog link that makes the
 * release visible.
 */
export interface DataArtifacts {
  /**
   * Paths (relative to the package dir) to FHIR `transaction` Bundles whose
   * entries are merged into the install Bundle. Every entry must carry its own
   * `request`, because only the author knows what makes a given resource
   * idempotent; the build adds the package install tag and nothing else.
   */
  bundles: string[];
  /**
   * Reserved. `$install` reads the release's content as a single FHIR Bundle, so
   * there is nothing on the server that would stream an NDJSON payload — a
   * declared value would validate, publish, and then never be applied. Typed as
   * `never` so declaring one is a compile error rather than a silent no-op.
   * Becomes `string[]` when the asset-import engine lands.
   */
  ndjson?: never;
}

/** Artifacts for `bot-integration` / `mixed` packages. */
export interface BotIntegrationArtifacts {
  consumer: ConsumerArtifacts;
  impl: ImplArtifacts;
  /** Optional seed data shipped alongside the bots (`mixed` packages). */
  data?: DataArtifacts;
}

/**
 * Artifacts for `reference-data` packages: data is the deliverable, and there is
 * no consumer-facing bot surface. `impl` stays available for the one case that
 * needs code — a `postInstall` hook — and is otherwise omitted entirely, which
 * is what lets the publisher skip creating an impl project at all.
 */
export interface ReferenceDataArtifacts {
  data: DataArtifacts;
  impl?: ImplArtifacts;
  consumer?: never;
}

/** Medplum-version + wire-shape compatibility envelope. */
export interface Compatibility {
  minMedplumVersion: string;
  acceptsWireShapes?: ('parameters' | 'plain-json')[];
  /** When true, `$upgrade` to this version requires explicit ack. */
  dropsLegacyExecuteBot?: boolean;
}

/** Links to the human-facing contract + wire-shape documentation. */
export interface Documentation {
  contract?: string;
  wireShapes?: string;
}

/**
 * Imperative hooks, named by the **identifier of a declared impl bot** (not a
 * source path).
 *
 * A hook is ordinary package code, so it is published and versioned like any
 * other impl bot rather than copied into each customer project by the install
 * Bundle. Declare it in `artifacts.impl.bots` with `internal: true` (it has no
 * customer-side name) and `runAsUser: true` (it executes as the project admin
 * who ran the install, which is the privilege its work requires — a bot's own
 * membership is not a project admin and cannot write `Project.secret`).
 */
export interface Hooks {
  /**
   * Impl bot identifier to invoke after the install Bundle is applied; returns
   * one-shot credentials in an `OperationOutcome`.
   */
  postInstall?: string;
  /**
   * Reserved. `$uninstall` does not exist yet, so there is nothing to carry a
   * teardown hook to the server and nothing to invoke it — a declared value would
   * validate, publish, and then never run, which is worse than not being offered.
   * Typed as `never` so declaring one is a compile error instead of a silent no-op.
   * Becomes `string` when the uninstall operation lands, alongside the
   * `PackageRelease` extension it needs.
   */
  preUninstall?: never;
}

/**
 * A migration module reference, applied by the `$upgrade`/`$rollback` runner.
 * The validator requires the array to be strictly ascending by `version` —
 * `$upgrade` walks it in order and `$rollback` walks it in reverse.
 */
export interface MigrationRef {
  /** Target package version this migration advances to (semver). */
  version: string;
  /** Path (relative to the package dir) to a module exporting `up()`/`down()`. */
  file: string;
}

/** Fields common to every package type. */
export interface PackageManifestBase {
  /** Manifest grammar version. Only `1` in v1. */
  schemaVersion: 1;
  /** Package identifier value → `Package.identifier`. */
  package: string;
  displayName: string;
  vendor: string;
  /** Semver → `PackageRelease.version`. */
  version: string;
  /** Must equal `version`'s major (enforced by the validator). */
  majorVersion: number;
  channel: PackageChannel;
  compatibility: Compatibility;
  /** Relative path to the FHIR `Questionnaire` rendered at install time. */
  configQuestionnaire?: string;
  documentation?: Documentation;
  envConstants?: EnvConstants;
  hooks?: Hooks;
  migrations?: MigrationRef[];
  /**
   * Library extraction is deferred. Schema v1 accepts only `undefined`;
   * specifying a value is a compile error.
   */
  library?: undefined;
}

/**
 * A marketplace package manifest. Discriminated on `type`: `bot-integration`
 * and `mixed` carry a `consumer` contract and impl bots; `reference-data` carries
 * data and, at most, a hook.
 */
export type PackageManifest =
  | (PackageManifestBase & { type: 'bot-integration' | 'mixed'; artifacts: BotIntegrationArtifacts })
  | (PackageManifestBase & { type: 'reference-data'; artifacts: ReferenceDataArtifacts });

/**
 * `const`-inferring identity helper. Authoring with `defineManifest({ … })`
 * preserves literal types (so tooling/tests can read the exact impl identifier
 * union), while `const manifest: PackageManifest = { … }` remains valid. Cross-
 * reference integrity (`delegatesTo` → impl identifier, ClientApp `bindings` →
 * webhook bot identifier) is enforced by the validator at build time.
 * @param manifest - The package manifest literal.
 * @returns The same manifest, with literal types preserved.
 */
export function defineManifest<const M extends PackageManifest>(manifest: M): M {
  return manifest;
}

/**
 * Narrows a manifest to one that carries a consumer contract.
 * @param manifest - The package manifest.
 * @returns True if the manifest is a `bot-integration` or `mixed` package.
 */
export function hasConsumerArtifacts(
  manifest: PackageManifest
): manifest is PackageManifestBase & { type: 'bot-integration' | 'mixed'; artifacts: BotIntegrationArtifacts } {
  return manifest.type === 'bot-integration' || manifest.type === 'mixed';
}

/**
 * Returns the package's impl bots, which a `reference-data` package may not have.
 * @param manifest - The package manifest.
 * @returns The declared impl bots, or an empty array.
 */
export function getImplBots(manifest: PackageManifest): ImplBot[] {
  return manifest.artifacts.impl?.bots ?? [];
}

/**
 * Returns the package's linked-bot exposures.
 * @param manifest - The package manifest.
 * @returns The declared linked bots, or an empty array.
 */
export function getLinkedBots(manifest: PackageManifest): LinkedBot[] {
  return hasConsumerArtifacts(manifest) ? (manifest.artifacts.consumer.linkedBots ?? []) : [];
}

/**
 * Returns the declared data artifacts, if any.
 * @param manifest - The package manifest.
 * @returns The data artifacts, or undefined.
 */
export function getDataArtifacts(manifest: PackageManifest): DataArtifacts | undefined {
  return manifest.artifacts.data;
}

/**
 * Decides where a package's impl version lives.
 *
 * The version has to be discoverable from something the caller already holds, and
 * there are only two candidates: the bot identifier or the project the bot lives
 * in. It must be exactly one, or an upgrade has two sources of truth to keep in
 * step.
 *
 * - `'identifier'` — impl bots are `<identifier>@<version>` in a per-major
 *   project. Callers reach them through a proxy or operation that holds the
 *   version, so several versions coexist behind one stable customer-side name.
 * - `'project'` — impl bots keep bare identifiers in a per-version project.
 *   Callers hold the identifier itself, so the version can only live in the link,
 *   and `$upgrade` is a one-field `Project.link` swap.
 *
 * Declaring a linked bot selects `'project'`, because a linked identifier *is* the
 * consumer contract and so cannot carry a version.
 * @param manifest - The package manifest.
 * @returns Which of the two carries the version.
 */
export function implVersioning(manifest: PackageManifest): 'identifier' | 'project' {
  return getLinkedBots(manifest).length > 0 ? 'project' : 'identifier';
}
