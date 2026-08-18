// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import {
  allOk,
  badRequest,
  conflict,
  createReference,
  forbidden,
  getExtensionValue,
  getReferenceString,
  isOk,
  isResource,
  normalizeErrorString,
  normalizeOperationOutcome,
  OperationOutcomeError,
  Operator,
  parseSearchRequest,
  resolveId,
} from '@medplum/core';
import type { FhirRepository, FhirRequest, FhirResponse, FhirRouter } from '@medplum/fhir-router';
import { processBatch } from '@medplum/fhir-router';
import type {
  Binary,
  Bot,
  Bundle,
  BundleEntry,
  Extension,
  PackageInstallation,
  PackageRelease,
  Parameters,
  Project,
  ProjectMembership,
  Questionnaire,
  QuestionnaireItem,
  Reference,
  Resource,
} from '@medplum/fhirtypes';
import { createHash } from 'node:crypto';
import { executeBot } from '../../bots/execute';
import { getBotProjectMembership } from '../../bots/utils';
import type { AuthenticatedRequestContext } from '../../context';
import { getAuthenticatedContext } from '../../context';
import { getLogger } from '../../logger';
import { getBinaryStorage } from '../../storage/loader';
import { readStreamToString } from '../../util/streams';
import { findProjectMembership } from '../../workers/utils';
import { deployBot } from './deploy';

/**
 * Canonical `meta.tag` system applied by the install Bundle to every resource it
 * creates, so that `$uninstall` (Ticket 4b) can find and remove them. Defined here
 * for cross-reference; the install handler does not depend on it directly.
 */
export const PackageInstallTagSystem = 'https://medplum.com/package-install';

/**
 * Extension declared on a `PackageRelease` naming the setupBot run in the
 * imperative setup phase, by its version-tagged Bot `identifier` value.
 *
 * The setupBot is an ordinary impl bot: published once into the shared impl
 * project rather than copied into every customer project by the install Bundle.
 * It runs with `runAsUser: true`, so it executes as the project admin who
 * invoked `$install` and writes into their project — which is what it needs, as
 * its job is to populate `Project.secret` from the install answers, and a bot's
 * own membership is not a project admin. Because it is version-tagged, an
 * upgrade picks up the new hook without a per-customer redeploy.
 *
 * Requires {@link PackageReleaseImplProjectUrl} to also be declared.
 */
export const PackageReleaseSetupBotUrl = 'https://medplum.com/fhir/StructureDefinition/packageRelease-setup-bot';

/**
 * Extension declared on a `PackageRelease` referencing the shared impl `Project`
 * that the calling project must link to (Tier 3 packages). The handler appends
 * this to the calling `Project.link` imperatively (Ticket 0b resolution) — a
 * pure-declarative Bundle entry cannot cleanly mutate the calling project's link.
 */
export const PackageReleaseImplProjectUrl = 'https://medplum.com/fhir/StructureDefinition/packageRelease-impl-project';

/**
 * `PackageInstallation` state extensions. Per RFC §Idempotent reconciliation these
 * are stored as extensions for v1 (no `status` enum change, no schema migration).
 */
export const PackageInstallationErrorPhaseUrl =
  'https://medplum.com/fhir/StructureDefinition/packageInstallation-error-phase';
export const PackageInstallationLastErrorUrl =
  'https://medplum.com/fhir/StructureDefinition/packageInstallation-last-error';
export const PackageInstallationInFlightTargetUrl =
  'https://medplum.com/fhir/StructureDefinition/packageInstallation-in-flight-target';
export const PackageInstallationConfigHashUrl =
  'https://medplum.com/fhir/StructureDefinition/packageInstallation-config-hash';
export const PackageInstallationMigrationProgressUrl =
  'https://medplum.com/fhir/StructureDefinition/packageInstallation-migration-progress';

/**
 * Default staleness window for an `installing` record. A record stuck in
 * `installing` longer than this is treated as a crashed install on re-invoke
 * (RFC §Stuck installing/upgrading states; default 5 min on read).
 */
export const STALE_INSTALL_MS = 5 * 60 * 1000;

/** Kebab-case URLs emitted by an earlier `@medplum-ee/package-types` build (pre-2026-06). */
const LEGACY_PACKAGE_RELEASE_EXTENSION_URLS: Record<string, string> = {
  [PackageReleaseImplProjectUrl]: 'https://medplum.com/fhir/StructureDefinition/package-release-impl-project',
  [PackageReleaseSetupBotUrl]: 'https://medplum.com/fhir/StructureDefinition/package-release-setup-bot',
};

function getReleaseExtensionValue(release: PackageRelease, url: string): ReturnType<typeof getExtensionValue> {
  const direct = getExtensionValue(release, url);
  if (direct !== undefined) {
    return direct;
  }
  const legacyUrl = LEGACY_PACKAGE_RELEASE_EXTENSION_URLS[url];
  return legacyUrl ? getExtensionValue(release, legacyUrl) : undefined;
}

/** Where an `$install` failed, recorded so a re-invoke can resume from the right point. */
type InstallErrorPhase = 'install-bundle' | 'setup-bot';

/** Settings derived from the optional install-bundle `Parameters` body, keyed by Questionnaire linkId. */
type InstallSettings = Record<string, boolean | number | string>;

/**
 * Handles a package install request.
 *
 * The operation is a reconciliation (kubectl/terraform `apply` style): re-invoking
 * with the same arguments is the recovery path. The handler reads any existing
 * `PackageInstallation` for the package and resumes from where the prior attempt
 * stopped (RFC §`$install` state-aware behavior).
 *
 * Install-bundle phase (declarative): apply the PackageRelease Bundle into the
 * calling project via `processBatch`, then commission the bots it wrote — a
 * Bundle can describe a Bot row but cannot give it a membership or a deployed
 * function. Setup-bot phase (imperative, Tier 3): invoke the declared setupBot
 * with the `PackageInstallation` + validated settings; the setupBot writes
 * `Project.secret` and returns one-shot credentials in an OperationOutcome.
 *
 * Endpoint: [fhir base]/PackageRelease/[id]/$install
 * @param req - The FHIR request.
 * @param repo - The FHIR repository.
 * @param router - The FHIR router.
 * @returns The FHIR response.
 */
export async function packageInstallHandler(
  req: FhirRequest,
  repo: FhirRepository,
  router: FhirRouter
): Promise<FhirResponse> {
  const ctx = getAuthenticatedContext();
  const { project, membership, systemRepo } = ctx;
  if (!project.superAdmin && !membership.admin) {
    return [forbidden];
  }

  const { id } = req.params;
  // Caller-scoped read is the authorization gate: a project admin can only reach a
  // PackageRelease in their own project or in a linked catalog project that exports
  // it (see catalogResourceTypes / Project.exportedResourceType).
  const packageRelease = await repo.readResource<PackageRelease>('PackageRelease', id);

  // Load the install Bundle (install-bundle phase content) and validate the optional settings
  // body against the bundled config Questionnaire *before* mutating any state.
  // The Bundle is stored as a Binary, which cannot be exported cross-project, so it
  // is read via systemRepo now that the caller has proven access to the release.
  const bundle = await readPackageBundle(systemRepo, packageRelease);
  const settings = parseSettings(req.body);
  const questionnaire = findQuestionnaire(bundle);
  if (questionnaire) {
    validateSettings(questionnaire, settings);
  }
  const configHash = computeConfigHash(settings);

  // Idempotent reconciliation: resolve what (if anything) is already installed.
  const packageRef = getReferenceString(packageRelease.package);
  const existing = packageRef
    ? await repo.searchOne<PackageInstallation>({
        resourceType: 'PackageInstallation',
        filters: [{ code: 'package', operator: Operator.EQUALS, value: packageRef }],
      })
    : undefined;

  const decision = planReconciliation(existing, configHash, packageRelease.version);
  if ('respond' in decision) {
    return decision.respond;
  }
  const skipInstallBundle = decision.skipInstallBundle;

  // Mark the record `installing` for the duration of this attempt.
  let installation = await upsertInstalling(
    systemRepo,
    existing,
    project,
    packageRelease,
    membership.profile,
    configHash
  );

  let phase: InstallErrorPhase = skipInstallBundle ? 'setup-bot' : 'install-bundle';
  let installBundleResult: Bundle | undefined;
  try {
    if (!skipInstallBundle) {
      installBundleResult = await applyInstallBundle(req, repo, router, bundle, packageRelease);
      await commissionInstalledBots(ctx, installBundleResult);
      phase = 'setup-bot';
    }

    // Link the shared impl project (Ticket 0b: handler-side, idempotent) before
    // the setup-bot phase runs, so the setupBot can resolve impl resources through
    // the link.
    await linkImplProject(systemRepo, project, packageRelease);

    const setupBotResult = await runSetupBot(ctx, packageRelease, installation, settings);

    installation = await systemRepo.updateResource<PackageInstallation>(
      clearErrorState({ ...installation, status: 'installed' })
    );

    // Prefer the setupBot's one-shot-credentials outcome; otherwise fall back to
    // the install-bundle batch response (legacy behavior) or the installation record.
    return [allOk, setupBotResult ?? installBundleResult ?? installation];
  } catch (err) {
    getLogger().error('Package install failed', { err, phase });
    const outcome = normalizeOperationOutcome(err);
    await systemRepo.updateResource<PackageInstallation>(
      setErrorState(installation, phase, outcome.issue?.[0]?.details?.text ?? 'Package install failed')
    );
    return [outcome];
  }
}

// The outcome of idempotent reconciliation: either respond immediately (no-op or
// 409), or proceed with an install attempt (optionally skipping the committed
// install bundle).
type ReconcileDecision = { respond: FhirResponse } | { skipInstallBundle: boolean };

// Decides how a re-invoke should proceed based on the existing PackageInstallation
// state (RFC §`$install` state-aware behavior).
//
// The version matters as much as the state. `existing` is found by package, not by
// version, so the record for an installed v1 is what a caller installing v2 hits.
// Reconciliation is about recovering or reconfiguring *this* install; moving between
// versions is `$upgrade`'s job, since it also has to run declared migrations and
// rewrite what the install bundle already wrote.
function planReconciliation(
  existing: WithId<PackageInstallation> | undefined,
  configHash: string,
  version: string
): ReconcileDecision {
  if (!existing) {
    return { skipInstallBundle: false };
  }
  const sameVersion = existing.version === version;
  switch (existing.status) {
    case 'installed':
      if (!sameVersion) {
        // Neither branch below is safe across versions: the config hash could match
        // and return `allOk` having applied nothing, and skipping the install bundle
        // would leave the record relabelled to a version whose Bundle never ran.
        return {
          respond: [
            conflict(
              `Package is already installed at version ${existing.version}; installing ${version} is an upgrade, not an install`,
              'version-mismatch'
            ),
          ],
        };
      }
      // No-op when nothing changed; otherwise refresh via the idempotent setupBot,
      // skipping the already-committed install bundle.
      return getExtensionValue(existing, PackageInstallationConfigHashUrl) === configHash
        ? { respond: [allOk, existing] }
        : { skipInstallBundle: true };
    case 'installing':
      // A recent record means another caller is in flight; a stale one crashed
      // mid-install and must redo the install bundle.
      return isRecentlyActive(existing)
        ? { respond: [conflict('Package installation already in progress', 'in-progress')] }
        : { skipInstallBundle: false };
    case 'error':
      // An `install-bundle` failure is either the Bundle transaction, which
      // committed nothing, or bot commissioning after it, which is idempotent —
      // so redoing the install-bundle phase is correct either way. Only resume
      // past it when the prior failure was in the setupBot, and only for the
      // same version: whatever the install bundle committed belongs to the old
      // one. A failed install must stay recoverable by a newer release, because
      // `PackageInstallation` is read-only to project admins and they have no
      // way to clear it themselves.
      return {
        skipInstallBundle: sameVersion && getExtensionValue(existing, PackageInstallationErrorPhaseUrl) === 'setup-bot',
      };
    default:
      // 'requested' or unknown → full install from scratch.
      return { skipInstallBundle: false };
  }
}

// Reads and parses the FHIR Bundle stored in the PackageRelease's Binary content.
async function readPackageBundle(repo: FhirRepository, packageRelease: PackageRelease): Promise<Bundle> {
  const binary = await repo.readReference<Binary>({ reference: packageRelease.content.url });
  const stream = await getBinaryStorage().readBinary(binary);
  const json = await readStreamToString(stream);
  return JSON.parse(json) as Bundle;
}

// Install-bundle phase: apply the declarative Bundle into the calling project.
async function applyInstallBundle(
  req: FhirRequest,
  repo: FhirRepository,
  router: FhirRouter,
  bundle: Bundle,
  packageRelease: PackageRelease
): Promise<Bundle> {
  const { membership } = getAuthenticatedContext();
  getLogger().info('Installing package', {
    profile: membership.profile,
    package: packageRelease.package,
    version: packageRelease.version,
  });
  const result = await processBatch(req, repo, router, await resolveConditionalEntries(repo, bundle));
  validateBatchResponse(result);
  return result;
}

/**
 * Rewrites the conditional entries of an install Bundle into unconditional ones.
 *
 * Install Bundles are written as conditional upserts (`PUT <Type>?<query>`) because
 * an install must be re-runnable. That makes the whole transaction serializable,
 * which caps it at `maxSerializableTransactionEntries` entries — a limit packages
 * outgrow as they ship more bots, and one that cannot keep being raised without
 * enlarging the worst-case serializable transaction for every other caller.
 *
 * Resolving the queries up front removes the need for that isolation while keeping
 * the install atomic: the Bundle still applies as a single transaction, just an
 * ordinary one. Two properties of install Bundles make this safe. They are
 * independent — no `fullUrl`s and no intra-Bundle references, since generated
 * resources bind to their bots by logical identifier — and `$install` already
 * excludes concurrent installs of the same package by rejecting a second attempt
 * while one is `in-progress`, which is the writer that serializable isolation
 * would otherwise be guarding against.
 *
 * @param repo - The FHIR repository of the calling project.
 * @param bundle - The install Bundle as published.
 * @returns An equivalent Bundle whose entries carry no search queries.
 */
async function resolveConditionalEntries(repo: FhirRepository, bundle: Bundle): Promise<Bundle> {
  const entries: BundleEntry[] = [];
  for (const entry of bundle.entry ?? []) {
    const url = entry.request?.url;
    if (entry.request?.method !== 'PUT' || !url?.includes('?')) {
      entries.push(entry);
      continue;
    }

    const searchRequest = parseSearchRequest(url);
    searchRequest.count = 2;
    searchRequest.offset = 0;
    searchRequest.sortRules = undefined;
    const [match, duplicate] = await repo.searchResources(searchRequest);
    if (duplicate) {
      throw new OperationOutcomeError(badRequest(`Conditional PUT matched multiple resources: ${url}`));
    }

    const resource = { ...entry.resource } as Resource;
    if (match) {
      entries.push({
        ...entry,
        resource: { ...resource, id: match.id },
        request: { method: 'PUT', url: `${searchRequest.resourceType}/${match.id}` },
      });
    } else {
      // Create, not create-by-id: assigning the id would require the privileged
      // id-assignment path, which the installing project admin does not have.
      delete resource.id;
      entries.push({ ...entry, resource, request: { method: 'POST', url: searchRequest.resourceType } });
    }
  }
  return { ...bundle, entry: entries };
}

/**
 * Commissions every Bot the install Bundle just wrote: gives it a
 * `ProjectMembership` to execute under, and deploys its code to the bot runtime.
 *
 * A Bundle can only describe resources, so an installed Bot arrives as a row
 * carrying `code` and nothing else. `Bot/$init` performs both of these steps for
 * an interactively created bot, and an installed bot had nobody to perform them:
 * `$install` reported success while every proxy it wrote was unexecutable, the
 * runtime failing with "function not found" on first call. That is the whole gap
 * between "the install Bundle applied" and "the package works", so it belongs in
 * the operation rather than in each package's setup hook.
 *
 * Runs after the install-bundle phase commits, and is idempotent for the same
 * reasons that phase is: the membership is created only when absent, and a
 * deploy overwrites whatever the last one left. A re-installed Bundle in fact
 * requires* the redeploy, since its conditional `PUT` replaces the Bot row and
 * drops the `executableCode` the previous deploy attached.
 * @param ctx - The authenticated request context of the installing admin.
 * @param installBundleResult - The install-bundle batch response, whose entries carry the written resources.
 */
async function commissionInstalledBots(ctx: AuthenticatedRequestContext, installBundleResult: Bundle): Promise<void> {
  for (const entry of installBundleResult.entry ?? []) {
    const written = entry.resource;
    if (!isResource(written, 'Bot') || !written.id) {
      continue;
    }

    // Re-read as system: `deployBot` resolves the bot's project from `meta.project`
    // to check the `bots` feature, and a project admin's own read does not
    // necessarily carry it (same rationale as `Bot/$init`).
    const bot = await ctx.systemRepo.readResource<Bot>('Bot', written.id);
    await ensureBotMembership(ctx, bot);

    if (!bot.code) {
      // Nothing to deploy. A Bundle entry with no `code` is a declaration the
      // package expects to be satisfied some other way, not a broken bot.
      continue;
    }

    try {
      const { warnings } = await deployBot(ctx.repo, bot, bot.code, 'index.js');
      for (const warning of warnings) {
        getLogger().warn('Package install deployed a bot with warnings', {
          bot: getReferenceString(bot),
          warning,
        });
      }
    } catch (err) {
      // Named, because the generic deploy errors ("Bots not enabled") give no
      // indication of which bot or that an install was what tripped over it.
      throw new OperationOutcomeError(
        badRequest(`Could not deploy installed bot ${getReferenceString(bot)}: ${normalizeErrorString(err)}`)
      );
    }
  }
}

/**
 * Creates the installed bot's `ProjectMembership` if it does not have one.
 *
 * Without it a `runAsUser: false` bot — every webhook proxy — has no identity to
 * execute under, and a cron- or subscription-triggered bot cannot be dispatched
 * at all. Created unconditionally, matching `Bot/$init`, so that a package
 * flipping a bot to `runAsUser: false` in a later release does not need one.
 * @param ctx - The authenticated request context of the installing admin.
 * @param bot - The installed bot.
 */
async function ensureBotMembership(ctx: AuthenticatedRequestContext, bot: WithId<Bot>): Promise<void> {
  const profile = createReference(bot);
  if (await findProjectMembership(ctx.project.id, profile)) {
    return;
  }
  await ctx.systemRepo.createResource<ProjectMembership>({
    resourceType: 'ProjectMembership',
    meta: { project: ctx.project.id },
    project: createReference(ctx.project),
    user: profile,
    profile,
  });
}

// Setup-bot phase: invoke the declared setupBot, passing the PackageInstallation and
// the validated settings. Returns the bot's OperationOutcome (one-shot credentials),
// or undefined when the package declares no setupBot.
async function runSetupBot(
  ctx: AuthenticatedRequestContext,
  packageRelease: PackageRelease,
  installation: WithId<PackageInstallation>,
  settings: InstallSettings
): Promise<Resource | undefined> {
  const setupBotIdentifier = getReleaseExtensionValue(packageRelease, PackageReleaseSetupBotUrl);
  if (!setupBotIdentifier || typeof setupBotIdentifier !== 'string') {
    return undefined;
  }

  // The setupBot is a version-tagged impl bot in the shared impl project, so the
  // release must name that project. It is deliberately not resolved through the
  // caller: `RepositoryContext.projects` is snapshotted from `Project.link` when
  // the request's Repository is built, so the link this handler just appended is
  // not visible to `ctx.repo` until a later request. Scoping a system search to
  // the declared impl project is deterministic on the first install instead.
  const implProjectId = resolveId(
    getReleaseExtensionValue(packageRelease, PackageReleaseImplProjectUrl) as Reference<Project> | undefined
  );
  if (!implProjectId) {
    throw new OperationOutcomeError(
      badRequest(`Release declares setup bot "${setupBotIdentifier}" but no impl project to resolve it from`)
    );
  }

  // Reading as system is bounded to the one bot this release names, and the
  // caller already proved access to the release itself (same rationale as
  // reading the install Bundle Binary above).
  const bot = await ctx.systemRepo.searchOne<Bot>({
    resourceType: 'Bot',
    filters: [
      { code: 'identifier', operator: Operator.EXACT, value: setupBotIdentifier },
      { code: '_project', operator: Operator.EQUALS, value: implProjectId },
    ],
  });
  if (!bot) {
    throw new OperationOutcomeError(
      badRequest(`Setup bot not found in impl project: ${setupBotIdentifier}. Was the package published?`)
    );
  }

  // Enforced here rather than assumed, because it is what makes the elevation above
  // correct and it is published from another repo. Without it
  // `getBotProjectMembership` falls through to the bot's own membership in the impl
  // project, so the hook would run non-admin and write the customer's settings into
  // the shared impl project — visible to every other install of this package.
  if (!bot.runAsUser) {
    throw new OperationOutcomeError(
      badRequest(
        `Setup bot "${setupBotIdentifier}" must be published with runAsUser: true, otherwise it runs as the impl project rather than the installing project`
      )
    );
  }

  const result = await executeBot({
    bot,
    runAs: await getBotProjectMembership(ctx, bot),
    requester: ctx.membership.profile,
    input: { installation, settings },
    contentType: 'application/json',
    traceId: ctx.traceId,
  });

  if (!result.success) {
    throw new OperationOutcomeError(badRequest(result.logResult || 'Setup bot execution failed'));
  }

  if (isResource(result.returnValue)) {
    return result.returnValue;
  }
  return undefined;
}

// Appends the shared impl `Project` to the calling `Project.link` if the
// PackageRelease declares one. Idempotent — a second call with the link already
// present is a no-op. Runs with system privileges (Ticket 0b resolution).
async function linkImplProject(
  systemRepo: FhirRepository,
  project: WithId<Project>,
  packageRelease: PackageRelease
): Promise<void> {
  const implProjectRef = getReleaseExtensionValue(packageRelease, PackageReleaseImplProjectUrl) as
    Reference<Project> | undefined;
  if (!implProjectRef?.reference) {
    return;
  }

  const current = await systemRepo.readResource<Project>('Project', project.id);
  if (current.link?.some((l) => l.project?.reference === implProjectRef.reference)) {
    return;
  }
  await systemRepo.updateResource<Project>({
    ...current,
    link: [...(current.link ?? []), { project: { reference: implProjectRef.reference } }],
  });
}

// Creates or transitions the PackageInstallation record into the `installing` state.
async function upsertInstalling(
  systemRepo: FhirRepository,
  existing: WithId<PackageInstallation> | undefined,
  project: WithId<Project>,
  packageRelease: PackageRelease,
  installedBy: PackageInstallation['installedBy'],
  configHash: string
): Promise<WithId<PackageInstallation>> {
  const base: PackageInstallation = existing
    ? { ...existing }
    : {
        resourceType: 'PackageInstallation',
        meta: { project: project.id },
        package: packageRelease.package,
        packageRelease: createReference(packageRelease),
        version: packageRelease.version,
        status: 'installing',
        installedBy,
      };

  const next: PackageInstallation = {
    ...base,
    status: 'installing',
    packageRelease: createReference(packageRelease),
    version: packageRelease.version,
    extension: setExtension(base.extension, PackageInstallationConfigHashUrl, { valueString: configHash }),
  };

  return existing
    ? systemRepo.updateResource<PackageInstallation>(next)
    : systemRepo.createResource<PackageInstallation>(next);
}

// Records the failed phase + error message so a re-invoke can resume correctly.
function setErrorState(
  installation: WithId<PackageInstallation>,
  phase: InstallErrorPhase,
  message: string
): WithId<PackageInstallation> {
  let extension = setExtension(installation.extension, PackageInstallationErrorPhaseUrl, { valueCode: phase });
  extension = setExtension(extension, PackageInstallationLastErrorUrl, { valueString: message });
  return { ...installation, status: 'error', extension };
}

// Clears transient error/in-flight extensions on a successful terminal state.
function clearErrorState(installation: PackageInstallation): PackageInstallation {
  const extension = (installation.extension ?? []).filter(
    (e) =>
      e.url !== PackageInstallationErrorPhaseUrl &&
      e.url !== PackageInstallationLastErrorUrl &&
      e.url !== PackageInstallationInFlightTargetUrl
  );
  return { ...installation, extension: extension.length > 0 ? extension : undefined };
}

// True when the record was updated within the staleness window.
function isRecentlyActive(installation: PackageInstallation): boolean {
  const lastUpdated = installation.meta?.lastUpdated;
  if (!lastUpdated) {
    return false;
  }
  return Date.now() - Date.parse(lastUpdated) < STALE_INSTALL_MS;
}

// Upserts a single-valued extension by URL, returning a new extension array.
function setExtension(
  extension: Extension[] | undefined,
  url: string,
  value: Pick<Extension, 'valueString' | 'valueCode' | 'valueReference' | 'valueBoolean'>
): Extension[] {
  const next = (extension ?? []).filter((e) => e.url !== url);
  next.push({ url, ...value });
  return next;
}

// Parses the optional `Parameters` request body into a flat settings map. Each
// `parameter.name` is matched against a `Questionnaire.item.linkId` by the
// validation below, so a caller must send the linkId as the parameter name; a value
// sent under any other name reads as absent.
function parseSettings(body: unknown): InstallSettings {
  const settings: InstallSettings = {};
  if (!isResource<Parameters>(body, 'Parameters')) {
    return settings;
  }
  for (const param of body.parameter ?? []) {
    if (!param.name) {
      continue;
    }
    const value = param.valueString ?? param.valueBoolean ?? param.valueInteger ?? param.valueDecimal;
    if (value !== undefined) {
      settings[param.name] = value;
    }
  }
  return settings;
}

// Finds the config Questionnaire bundled into the install Bundle, if present.
function findQuestionnaire(bundle: Bundle): Questionnaire | undefined {
  for (const entry of bundle.entry ?? []) {
    if (entry.resource?.resourceType === 'Questionnaire') {
      return entry.resource;
    }
  }
  return undefined;
}

// Validates that every required Questionnaire item has a value in the settings.
function validateSettings(questionnaire: Questionnaire, settings: InstallSettings): void {
  const missing: string[] = [];
  collectMissingRequired(questionnaire.item, settings, missing);
  if (missing.length > 0) {
    throw new OperationOutcomeError(badRequest(`Missing required settings: ${missing.join(', ')}`));
  }
}

function collectMissingRequired(
  items: QuestionnaireItem[] | undefined,
  settings: InstallSettings,
  missing: string[]
): void {
  for (const item of items ?? []) {
    if (item.type !== 'group' && item.required && item.linkId) {
      const value = settings[item.linkId];
      if (value === undefined || value === '') {
        missing.push(item.linkId);
      }
    }
    collectMissingRequired(item.item, settings, missing);
  }
}

// Computes a non-reversible change-detector over the canonicalized settings.
// Secrets are included so a rotated key produces a different hash, but the hash
// itself is safe to store (it is never a secret store).
function computeConfigHash(settings: InstallSettings): string {
  const canonical = JSON.stringify(Object.fromEntries(Object.entries(settings).sort(([a], [b]) => a.localeCompare(b))));
  return createHash('sha256').update(canonical).digest('hex');
}

function validateBatchResponse(result: Bundle): void {
  for (const entry of result.entry ?? []) {
    const outcome = entry.response?.outcome;
    if (outcome && isResource(outcome, 'OperationOutcome') && !isOk(outcome)) {
      throw new OperationOutcomeError(outcome);
    }
  }
}
