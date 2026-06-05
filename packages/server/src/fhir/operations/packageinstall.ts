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
  normalizeOperationOutcome,
  OperationOutcomeError,
  Operator,
} from '@medplum/core';
import type { FhirRepository, FhirRequest, FhirResponse, FhirRouter } from '@medplum/fhir-router';
import { processBatch } from '@medplum/fhir-router';
import type {
  Binary,
  Bot,
  Bundle,
  Extension,
  PackageInstallation,
  PackageRelease,
  Parameters,
  Project,
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

/**
 * Canonical `meta.tag` system applied by the install Bundle to every resource it
 * creates, so that `$uninstall` (Ticket 4b) can find and remove them. Defined here
 * for cross-reference; the install handler does not depend on it directly.
 */
export const PackageInstallTagSystem = 'https://medplum.com/package-install';

/**
 * Extension declared on a `PackageRelease` naming the Stage 2 setupBot by its
 * canonical Bot `identifier` value. The bot itself ships inside the Stage 1
 * Bundle, so it only exists in the calling project after Stage 1 commits; the
 * handler resolves it by this identifier and invokes it.
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

/** Where an `$install` failed, recorded so a re-invoke can resume from the right point. */
type InstallErrorPhase = 'stage-1' | 'setup-bot';

/** Settings derived from the optional Stage 1 `Parameters` body, keyed by Questionnaire linkId. */
type InstallSettings = Record<string, boolean | number | string>;

/**
 * Handles a package install request.
 *
 * The operation is a reconciliation (kubectl/terraform `apply` style): re-invoking
 * with the same arguments is the recovery path. The handler reads any existing
 * `PackageInstallation` for the package and resumes from where the prior attempt
 * stopped (RFC §`$install` state-aware behavior).
 *
 * Stage 1 (declarative): apply the PackageRelease Bundle into the calling project
 * via `processBatch`. Stage 2 (imperative, Tier 3): invoke the declared setupBot
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
  const packageRelease = await repo.readResource<PackageRelease>('PackageRelease', id);

  // Load the install Bundle (Stage 1 content) and validate the optional settings
  // body against the bundled config Questionnaire *before* mutating any state.
  const bundle = await readPackageBundle(repo, packageRelease);
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

  const decision = planReconciliation(existing, configHash);
  if ('respond' in decision) {
    return decision.respond;
  }
  const skipStage1 = decision.skipStage1;

  // Mark the record `installing` for the duration of this attempt.
  let installation = await upsertInstalling(systemRepo, existing, project, packageRelease, membership.profile, configHash);

  let phase: InstallErrorPhase = skipStage1 ? 'setup-bot' : 'stage-1';
  let stage1Result: Bundle | undefined;
  try {
    if (!skipStage1) {
      stage1Result = await runStage1(req, repo, router, bundle, packageRelease);
      phase = 'setup-bot';
    }

    // Link the shared impl project (Ticket 0b: handler-side, idempotent) before
    // Stage 2 runs, so the setupBot can resolve impl resources through the link.
    await linkImplProject(systemRepo, project, packageRelease);

    const stage2Result = await runStage2(ctx, packageRelease, installation, settings);

    installation = await systemRepo.updateResource<PackageInstallation>(
      clearErrorState({ ...installation, status: 'installed' })
    );

    // Prefer the setupBot's one-shot-credentials outcome; otherwise fall back to
    // the Stage 1 batch response (legacy behavior) or the installation record.
    return [allOk, stage2Result ?? stage1Result ?? installation];
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
// 409), or proceed with an install attempt (optionally skipping the committed Stage 1).
type ReconcileDecision = { respond: FhirResponse } | { skipStage1: boolean };

// Decides how a re-invoke should proceed based on the existing PackageInstallation
// state (RFC §`$install` state-aware behavior).
function planReconciliation(
  existing: WithId<PackageInstallation> | undefined,
  configHash: string
): ReconcileDecision {
  if (!existing) {
    return { skipStage1: false };
  }
  switch (existing.status) {
    case 'installed':
      // No-op when nothing changed; otherwise refresh via the idempotent setupBot,
      // skipping the already-committed Stage 1.
      return getExtensionValue(existing, PackageInstallationConfigHashUrl) === configHash
        ? { respond: [allOk, existing] }
        : { skipStage1: true };
    case 'installing':
      // A recent record means another caller is in flight; a stale one crashed
      // mid-install and must redo Stage 1.
      return isRecentlyActive(existing)
        ? { respond: [conflict('Package installation already in progress', 'in-progress')] }
        : { skipStage1: false };
    case 'error':
      // Stage 1 runs in a transaction, so a Stage 1 failure committed nothing —
      // only resume past Stage 1 when the prior failure was in the setupBot.
      return { skipStage1: getExtensionValue(existing, PackageInstallationErrorPhaseUrl) === 'setup-bot' };
    default:
      // 'requested' or unknown → full install from scratch.
      return { skipStage1: false };
  }
}

// Reads and parses the FHIR Bundle stored in the PackageRelease's Binary content.
async function readPackageBundle(repo: FhirRepository, packageRelease: PackageRelease): Promise<Bundle> {
  const binary = await repo.readReference<Binary>({ reference: packageRelease.content.url });
  const stream = await getBinaryStorage().readBinary(binary);
  const json = await readStreamToString(stream);
  return JSON.parse(json) as Bundle;
}

// Stage 1: apply the declarative Bundle into the calling project.
async function runStage1(
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
  const result = await processBatch(req, repo, router, bundle);
  validateBatchResponse(result);
  return result;
}

// Stage 2: invoke the declared setupBot, passing the PackageInstallation and the
// validated settings. Returns the bot's OperationOutcome (one-shot credentials),
// or undefined when the package declares no setupBot.
async function runStage2(
  ctx: AuthenticatedRequestContext,
  packageRelease: PackageRelease,
  installation: WithId<PackageInstallation>,
  settings: InstallSettings
): Promise<Resource | undefined> {
  const setupBotIdentifier = getExtensionValue(packageRelease, PackageReleaseSetupBotUrl);
  if (!setupBotIdentifier || typeof setupBotIdentifier !== 'string') {
    return undefined;
  }

  // The setupBot ships inside the Stage 1 Bundle, so it lives in the calling project.
  const userBot = await ctx.repo.searchOne<Bot>({
    resourceType: 'Bot',
    filters: [{ code: 'identifier', operator: Operator.EXACT, value: setupBotIdentifier }],
  });
  if (!userBot) {
    throw new OperationOutcomeError(badRequest(`Setup bot not found: ${setupBotIdentifier}`));
  }

  // Read as system to load extended metadata (mirrors the $execute operation).
  const bot = await ctx.systemRepo.readResource<Bot>('Bot', userBot.id);

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
async function linkImplProject(systemRepo: FhirRepository, project: WithId<Project>, packageRelease: PackageRelease): Promise<void> {
  const implProjectRef = getExtensionValue(packageRelease, PackageReleaseImplProjectUrl) as
    | Reference<Project>
    | undefined;
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

// Parses the optional `Parameters` request body into a flat settings map.
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
  const canonical = JSON.stringify(
    Object.fromEntries(Object.entries(settings).sort(([a], [b]) => a.localeCompare(b)))
  );
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
