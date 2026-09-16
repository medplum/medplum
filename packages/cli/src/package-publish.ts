// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient, WithId } from '@medplum/core';
import { getReferenceString, normalizeErrorString } from '@medplum/core';
import type { AuditEvent, AuditEventAgent, Binary, Bot, Bundle, Extension, Project } from '@medplum/fhirtypes';
import type { BuildArtifacts, ImplBot, PackageManifest, TargetEnv } from '@medplum/package-types';
import {
  buildPackage,
  getImplBots,
  PACKAGE_IDENTIFIER_SYSTEM,
  PACKAGE_IMPL_PROJECT_IDENTIFIER_SYSTEM,
  PACKAGE_RELEASE_ARTIFACT_DIGEST_EXT,
  PACKAGE_RELEASE_AUTHOR_EXT,
  PACKAGE_RELEASE_CONFIG_QUESTIONNAIRE_EXT,
  PACKAGE_RELEASE_IDENTIFIER_SYSTEM,
  PACKAGE_RELEASE_IMPL_PROJECT_EXT,
  PACKAGE_RELEASE_SETUP_BOT_EXT,
  PACKAGE_RELEASE_SOURCE_REVISION_EXT,
  PACKAGE_RELEASE_TARGET_EXT,
  resolveWithinPackage,
  versionedImplIdentifier,
} from '@medplum/package-types';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

/**
 * Marketplace package publisher.
 *
 * Compiles a package `manifest.ts` with `@medplum/package-types` and pushes the
 * result to a Medplum server, following the shared-impl topology:
 *
 *   1. Validate + build the manifest for the target env (pure; no network).
 *   2. Ensure the impl project `<package>-impl-v<major>` exists.
 *   3. Deploy each version-tagged impl Bot (`<identifier>@<version>`) into the
 *      impl project, uploading its compiled code via `$deploy`. This step is
 *      strictly **additive**: if a Bot with the same versioned identifier
 *      already exists, publishing aborts (a released version is immutable).
 *   4. Upload the customer-side install Bundle as a `Binary`.
 *   5. Register the release: upsert a `Package` and create a `PackageRelease`
 *      pointing at the Binary. This step is guarded — if the server does not
 *      yet know the `Package`/`PackageRelease` resource types, it is skipped
 *      with a warning so the impl-bot deploy still lands.
 *
 * The compiled impl bot code is expected at `<package-dir>/<ImplBot.file>`
 * (e.g. `dist/bots/example-search-bot.js`), produced by the package's own
 * `npm run build` before this runs.
 *
 * Requires a **super-admin** login: creating Projects and deploying bots into a
 * foreign project needs it.
 */

export interface PublishOptions {
  /** Apply the install Bundle in the caller's project to prove it is well-formed. */
  smoke: boolean;
  /** Overwrite an already-published version instead of refusing. */
  force: boolean;
  /**
   * Project id to publish the catalog (Package, PackageRelease, Binary) into.
   * Defaults to the caller's own project.
   *
   * Without it the catalog lands in the caller's own project, which is fine for a
   * super admin (super admins bypass catalog visibility rules) but is not what a
   * customer project admin can browse: the catalog belongs in a dedicated
   * catalog/publisher project that customers link to and that exports `Package`
   * and `PackageRelease`.
   */
  catalogProject?: string;
}

export interface PublishSummary {
  packageId: string;
  version: string;
  target: TargetEnv;
  /** Absent for a data-only package, which has no impl project. */
  implProject?: string;
  /** True when this publish waived version immutability. */
  forced?: boolean;
  implBotsDeployed: number;
  binaryId?: string;
  /**
   * Binary holding the config Questionnaire. Tracked separately so a publish that
   * fails after uploading it still names it — otherwise it is an orphan nothing
   * points at, findable only by scanning the catalog project.
   */
  configQuestionnaireBinaryId?: string;
  releaseId?: string;
  /** Resources the smoke test created but could not delete. */
  smokeLeftBehind?: string[];
  /**
   * Whether the publish AuditEvent was written. False means the publish happened
   * but is not attributable, which the caller must be able to detect rather than
   * having to notice a warning line in a CI log.
   */
  auditRecorded?: boolean;
  registrySkipped?: string;
  smoke?: 'pass' | 'fail' | 'skipped';
  sourceRevision?: string;
  artifactDigest?: string;
  notes: string[];
}

/** Coding system for the publish AuditEvent's type/subtype. */
const PUBLISH_AUDIT_SYSTEM = 'https://medplum.com/package-publish';

/**
 * Reference to whoever performed the publish. Typed as the reference `AuditEvent`
 * accepts for an agent, since that is the narrowest of the places it is used.
 */
type PublishAgentRef = NonNullable<AuditEventAgent['who']>;

/** Who published, from what source, and a digest of what was produced. */
interface PublishProvenance {
  authorRef: PublishAgentRef;
  sourceRevision?: string;
  artifactDigest: string;
}

/**
 * Validates, builds, and publishes a package manifest to a Medplum server per
 * the shared-impl topology. Returns a structured summary of what was done.
 * @param medplum - An authenticated (super-admin) Medplum client.
 * @param manifest - The loaded package manifest.
 * @param packageDir - Absolute path to the package directory (holds compiled bot code).
 * @param target - The deployment target env.
 * @param options - Publish options.
 * @returns A summary of the publish run.
 */
export async function publishPackage(
  medplum: MedplumClient,
  manifest: PackageManifest,
  packageDir: string,
  target: TargetEnv,
  options: PublishOptions
): Promise<PublishSummary> {
  const artifacts = buildPackage(manifest, { target, packageDir });
  const summary: PublishSummary = {
    packageId: artifacts.packageId,
    version: artifacts.version,
    target,
    implProject: artifacts.implProject,
    implBotsDeployed: 0,
    notes: [],
  };
  if (options.force) {
    summary.forced = true;
  }

  const author = medplum.getProfile();
  if (!author) {
    throw new Error('Cannot publish: no authenticated profile to attribute the release to');
  }
  const provenance = {
    authorRef: { reference: getReferenceString(author) } satisfies PublishAgentRef,
    sourceRevision: resolveSourceRevision(packageDir),
    artifactDigest: computeArtifactDigest(manifest, artifacts, packageDir),
  };
  summary.sourceRevision = provenance.sourceRevision;
  summary.artifactDigest = provenance.artifactDigest;
  if (!provenance.sourceRevision) {
    summary.notes.push('no source revision recorded (not in CI, and git rev-parse failed)');
  }

  try {
    return await runPublish(medplum, manifest, artifacts, summary, packageDir, options, provenance);
  } catch (err) {
    // Audited before rethrowing, so a failed publish is as visible as a successful
    // one. A partially-applied publish is exactly the case someone later needs to
    // reconstruct.
    await recordPublishAuditEvent(medplum, {
      author: provenance.authorRef,
      summary,
      catalogProject: options.catalogProject,
      sourceRevision: provenance.sourceRevision,
      artifactDigest: provenance.artifactDigest,
      error: err,
    });
    throw err;
  }
}

async function runPublish(
  medplum: MedplumClient,
  manifest: PackageManifest,
  artifacts: BuildArtifacts,
  summary: PublishSummary,
  packageDir: string,
  options: PublishOptions,
  provenance: PublishProvenance
): Promise<PublishSummary> {
  // A data-only package has no impl project: nothing to deploy, nothing for a
  // customer to link to, and creating one anyway would leave an empty project per
  // release plus a `Project.link` pointing at nothing.
  const implProject = artifacts.implProjectIdentifier ? await ensureImplProject(medplum, artifacts) : undefined;
  if (implProject) {
    console.log(`impl project: ${getReferenceString(implProject)} (${artifacts.implProject})`);
    summary.implBotsDeployed = await deployImplBots(
      medplum,
      manifest,
      artifacts,
      implProject.id,
      packageDir,
      options.force
    );
  } else {
    console.log('impl project: none (data-only package)');
  }

  const catalogProject = options.catalogProject;
  if (catalogProject) {
    console.log(`catalog project: Project/${catalogProject}`);
  }

  const binary = await uploadInstallBundle(medplum, artifacts, catalogProject);
  summary.binaryId = binary.id;
  console.log(`install Bundle uploaded as Binary/${binary.id}`);

  // Uploaded here rather than inside registerRelease so it reaches the summary —
  // and therefore the AuditEvent — before anything that can throw. A Binary
  // created inside the failing call would be an orphan with nothing recording it.
  const questionnaireBinaryRef = await uploadConfigQuestionnaire(
    medplum,
    manifest,
    artifacts,
    packageDir,
    catalogProject
  );
  if (questionnaireBinaryRef) {
    summary.configQuestionnaireBinaryId = questionnaireBinaryRef.split('/')[1];
    console.log(`config Questionnaire uploaded as ${questionnaireBinaryRef}`);
  }

  const release = await registerRelease(medplum, {
    manifest,
    artifacts,
    binary,
    questionnaireBinaryRef,
    implProject,
    catalogProject,
    force: options.force,
    provenance,
  });
  if (release.skipped) {
    summary.registrySkipped = release.skipped;
    summary.notes.push(`registry write skipped: ${release.skipped}`);
  } else {
    summary.releaseId = release.releaseId;
  }

  if (options.smoke) {
    const leftBehind: string[] = [];
    summary.smoke = await smokeTestInstallBundle(medplum, artifacts, leftBehind);
    if (leftBehind.length > 0) {
      summary.smokeLeftBehind = leftBehind;
      summary.notes.push(`smoke test left ${leftBehind.length} resource(s) in the publishing project`);
    }
    if (summary.smoke === 'fail') {
      // The smoke test exists to stop a Bundle that does not apply from becoming a
      // release that every customer install replays. Reporting 'fail' in the summary
      // while exiting 0 meant CI stayed green and the release shipped regardless.
      throw new Error(
        'Smoke test failed: the install Bundle did not apply cleanly. The release was already registered — ' +
          'investigate before any customer installs it.'
      );
    }
  }

  await recordPublishAuditEvent(medplum, {
    author: provenance.authorRef,
    summary,
    catalogProject,
    sourceRevision: provenance.sourceRevision,
    artifactDigest: provenance.artifactDigest,
  });

  return summary;
}

// Finds the impl project by its stable identifier, creating it if absent.
//
// Deliberately not by `Project.name`. This runs as super admin, so a name search
// spans every project on the deployment, and `Project.name` is a display field any
// project can set — so a name-only lookup would hand a package's impl bots to
// whatever project happened to share the conventional name, and every subsequent
// install would `Project.link` customers into it. A name match without our
// identifier is therefore reported rather than adopted.
async function ensureImplProject(medplum: MedplumClient, artifacts: BuildArtifacts): Promise<WithId<Project>> {
  const identifier = { system: PACKAGE_IMPL_PROJECT_IDENTIFIER_SYSTEM, value: artifacts.implProjectIdentifier };
  const identifierQuery = `${identifier.system}|${identifier.value}`;

  const claimed = await medplum.searchOne('Project', { identifier: identifierQuery });
  if (claimed) {
    return claimed;
  }

  const nameMatch = await medplum.searchOne('Project', { name: artifacts.implProject });
  if (nameMatch) {
    throw new Error(
      `Project/${nameMatch.id} is named "${artifacts.implProject}" but does not carry the impl-project identifier ` +
        `${identifierQuery}. Publishing will not adopt a project by name. If this is genuinely the impl project ` +
        `for ${artifacts.packageId} v${artifacts.majorVersion}, add that identifier to it and re-run; otherwise ` +
        `rename it so it does not shadow the impl project.`
    );
  }

  // `exportedResourceType` is restricted to Bot: a linked customer needs to resolve
  // impl bots across the link and nothing else, and an unset value exports the whole
  // project to every customer that installs the package.
  const scope =
    artifacts.implVersioning === 'project'
      ? `release ${artifacts.version}`
      : `v${artifacts.majorVersion} (all releases)`;
  const created = await medplum.createResource<Project>({
    resourceType: 'Project',
    identifier: [identifier],
    name: artifacts.implProject,
    description: `Shared implementation project for ${artifacts.packageId} ${scope} (marketplace).`,
    features: ['bots'],
    exportedResourceType: ['Bot'],
  });
  console.log(`+ created impl project ${artifacts.implProject} (${identifierQuery})`);
  return created;
}

// Deploys every impl bot into the impl project. Additive: an identifier that
// already exists in that project aborts the publish.
//
// The published identifier comes from the compiled spec rather than being
// recomputed here, because whether it carries `@version` depends on where the
// package keeps its version (`artifacts.implVersioning`) and the build has already
// resolved that. Under project versioning the identifier is bare and immutability
// is still enforced, since the project itself holds exactly one release.
async function deployImplBots(
  medplum: MedplumClient,
  manifest: PackageManifest,
  artifacts: BuildArtifacts,
  implProjectId: string,
  packageDir: string,
  force: boolean
): Promise<number> {
  const defs = getImplBots(manifest);
  let deployed = 0;
  for (let i = 0; i < defs.length; i++) {
    const def = defs[i];
    const spec = artifacts.implBots[i];
    if (!def || !spec) {
      continue;
    }
    const publishedIdentifier = spec.identifier?.[0];
    if (!publishedIdentifier?.system || !publishedIdentifier.value) {
      throw new Error(`impl bot "${def.identifier}" compiled without an identifier`);
    }
    const publishedId = publishedIdentifier.value;

    // Version-immutable: a published version's code is never rewritten. Skipping
    // silently would be worse than either alternative, because the release's
    // install Bundle and PackageRelease row *are* rewritten below — so a
    // re-publish of edited code would ship a new Bundle against old impl code
    // under the same version. Bump the manifest version, or pass --force to
    // knowingly rewrite (e.g. resuming a partially-failed publish).
    const existing = await medplum.searchOne('Bot', {
      identifier: `${publishedIdentifier.system}|${publishedId}`,
      _project: implProjectId,
    });
    if (existing?.id) {
      if (!force) {
        throw new Error(
          `impl bot ${publishedId} is already published (Bot/${existing.id}). A released version is immutable: ` +
            `bump manifest.version, or re-run with --force to overwrite it.`
        );
      }
      // Refresh the row, not just the code. A forced republish exists to correct a
      // bad publish, and several of these fields change behavior rather than
      // describing it: `streamingEnabled` selects the streaming execution path, and
      // `timeout` and `runAsUser` decide how and as whom the bot runs. Deploying new
      // code over a stale row produces a bot that behaves like the previous publish
      // while reporting the new one — and the tags would stay stale too.
      // Read the compiled file first so a missing output throws before any write —
      // otherwise the row would carry the new metadata while still executing the
      // previous code, which is the split-brain `--force` exists to prevent.
      const code = readImplBotCode(packageDir, def);
      await medplum.updateResource<Bot>({
        ...existing,
        meta: { ...existing.meta, ...spec.meta, project: implProjectId },
        identifier: [publishedIdentifier],
        name: spec.name,
        description: spec.description,
        runtimeVersion: spec.runtimeVersion,
        timeout: spec.timeout,
        runAsUser: spec.runAsUser,
        streamingEnabled: spec.streamingEnabled,
      });

      await medplum.post(medplum.fhirUrl('Bot', existing.id, '$deploy'), {
        code,
        filename: `${def.identifier}.js`,
      });
      console.log(`  ! re-deployed impl bot ${publishedId} (Bot/${existing.id}) — --force`);
      deployed++;
      continue;
    }

    const code = readImplBotCode(packageDir, def);

    // Create the Bot directly in the (foreign) impl project as super-admin by
    // setting meta.project. The `admin/projects/:id/bot` endpoint instead places
    // the bot in the caller's active project, which lacks the `bots` feature, so
    // $deploy would fail with "Bots not enabled".
    const created = await medplum.createResource<Bot>({
      resourceType: 'Bot',
      meta: { ...spec.meta, project: implProjectId },
      identifier: [publishedIdentifier],
      name: spec.name,
      description: spec.description,
      runtimeVersion: spec.runtimeVersion,
      timeout: spec.timeout,
      runAsUser: spec.runAsUser,
      streamingEnabled: spec.streamingEnabled,
    });
    if (!created.id) {
      throw new Error(`Created impl Bot ${publishedId} has no id`);
    }

    await medplum.post(medplum.fhirUrl('Bot', created.id, '$deploy'), {
      code,
      filename: `${def.identifier}.js`,
    });

    console.log(`  + deployed impl bot ${publishedId} (Bot/${created.id})`);
    deployed++;
  }
  return deployed;
}

// Reads a compiled impl bot file relative to the package directory.
function readImplBotCode(packageDir: string, def: ImplBot): string {
  const file = resolveWithinPackage(packageDir, def.file, `impl bot "${def.identifier}" file`);
  if (!existsSync(file)) {
    throw new Error(
      `Compiled bot code not found for ${def.identifier} at ${file}. Run the package build (npm run build) first.`
    );
  }
  return readFileSync(file, 'utf8');
}

// Uploads the customer-side install Bundle as a Binary for the release to reference.
async function uploadInstallBundle(
  medplum: MedplumClient,
  artifacts: BuildArtifacts,
  catalogProject?: string
): Promise<WithId<Binary>> {
  if (catalogProject) {
    return createBinaryInProject(
      medplum,
      catalogProject,
      JSON.stringify(artifacts.installBundle),
      'application/fhir+json'
    );
  }
  return medplum.createBinary({
    data: JSON.stringify(artifacts.installBundle),
    contentType: 'application/fhir+json',
    filename: `${artifacts.packageId}-${artifacts.version}-install.json`,
  });
}

// createBinary() streams to the caller's own project, so it cannot place content
// in a separate catalog project. Creating the Binary as an ordinary resource with
// inline base64 works instead: the server writes `data` to binary storage and
// clears the field (see Repository.createResource).
async function createBinaryInProject(
  medplum: MedplumClient,
  projectId: string,
  content: string,
  contentType: string
): Promise<WithId<Binary>> {
  return medplum.createResource<Binary>({
    resourceType: 'Binary',
    meta: { project: projectId },
    contentType,
    data: Buffer.from(content, 'utf8').toString('base64'),
  });
}

interface RegisterResult {
  releaseId?: string;
  skipped?: string;
}

interface RegisterReleaseOptions {
  manifest: PackageManifest;
  artifacts: BuildArtifacts;
  /** The uploaded install Bundle that the release's `content` points at. */
  binary: WithId<Binary>;
  questionnaireBinaryRef?: string;
  /** Absent for a data-only package, which has no impl bots to link to. */
  implProject?: WithId<Project>;
  catalogProject?: string;
  force: boolean;
  provenance: PublishProvenance;
}

/**
 * Digests the release's artifacts: the install Bundle plus every impl bot's
 * compiled code, keyed by versioned identifier so the digest is order-independent.
 *
 * This is what makes "is the published version still the version that was
 * reviewed" answerable. Without it a release records only *that* code was
 * deployed, not *which* code.
 * @param manifest - The loaded manifest.
 * @param artifacts - The compiled build artifacts.
 * @param packageDir - Absolute path to the package directory.
 * @returns A `sha256:<hex>` digest string.
 */
function computeArtifactDigest(manifest: PackageManifest, artifacts: BuildArtifacts, packageDir: string): string {
  const botDigests: Record<string, string> = {};
  for (const [i, def] of getImplBots(manifest).entries()) {
    const code = readImplBotCode(packageDir, def);
    const key = artifacts.implBots[i]?.identifier?.[0]?.value ?? def.identifier;
    botDigests[key] = createHash('sha256').update(code, 'utf8').digest('hex');
  }
  const canonical = JSON.stringify({
    installBundle: createHash('sha256').update(JSON.stringify(artifacts.installBundle), 'utf8').digest('hex'),
    implBots: Object.fromEntries(Object.entries(botDigests).sort(([a], [b]) => a.localeCompare(b))),
  });
  return `sha256:${createHash('sha256').update(canonical, 'utf8').digest('hex')}`;
}

// The commit the release was built from. CI provides it directly; locally, fall
// back to git so a manual publish is still attributable. Undefined rather than a
// guess when neither is available — a wrong revision is worse than none, and this
// value is what later answers "is the published version the one that was reviewed".
//
// Resolved against the package directory, not the shell's cwd: publishing a package
// from another checkout would otherwise stamp the release with this repo's HEAD.
function resolveSourceRevision(packageDir: string): string | undefined {
  const fromCi = process.env.GITHUB_SHA ?? process.env.SOURCE_REVISION;
  if (fromCi) {
    return fromCi;
  }
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: packageDir, encoding: 'utf8' }).trim() || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Records the publish attempt as an `AuditEvent`, so the deployment retains who
 * published what, from which source, and whether it succeeded — none of which the
 * catalog resources capture on their own. Written to the catalog project when one
 * is named, else the caller's own project.
 *
 * A failure to write the audit record never fails the publish, but it is reported
 * loudly: a silent gap in the audit trail is the thing worth avoiding.
 * @param medplum - Authenticated client.
 * @param options - What to record.
 * @param options.author - The publishing profile.
 * @param options.summary - The publish summary so far.
 * @param options.catalogProject - Catalog project id, when publishing into one.
 * @param options.sourceRevision - Source commit the build came from.
 * @param options.artifactDigest - Digest over the release's artifacts.
 * @param options.error - Present when the publish failed.
 */
async function recordPublishAuditEvent(
  medplum: MedplumClient,
  options: {
    author: PublishAgentRef;
    summary: PublishSummary;
    catalogProject?: string;
    sourceRevision?: string;
    artifactDigest?: string;
    error?: unknown;
  }
): Promise<void> {
  const { author, summary, catalogProject, sourceRevision, artifactDigest, error } = options;
  const detail = [
    `target=${summary.target}`,
    `implProject=${summary.implProject ?? 'none'}`,
    `implBotsDeployed=${summary.implBotsDeployed}`,
    summary.forced ? 'force=true' : undefined,
    sourceRevision ? `sourceRevision=${sourceRevision}` : undefined,
    artifactDigest ? `artifactDigest=${artifactDigest}` : undefined,
    error ? `error=${normalizeErrorString(error)}` : undefined,
  ]
    .filter(Boolean)
    .join(' ');

  const auditEvent: AuditEvent = {
    resourceType: 'AuditEvent',
    ...(catalogProject ? { meta: { project: catalogProject } } : {}),
    type: { system: PUBLISH_AUDIT_SYSTEM, code: 'package-publish', display: 'Marketplace package publish' },
    subtype: [{ system: PUBLISH_AUDIT_SYSTEM, code: error ? 'publish-failure' : 'publish-success' }],
    action: 'C',
    recorded: new Date().toISOString(),
    outcome: error ? '8' : '0',
    outcomeDesc: `${summary.packageId}@${summary.version} ${error ? 'failed' : 'published'}: ${detail}`,
    source: { observer: { identifier: { value: medplum.getBaseUrl() } } },
    agent: [{ who: author, requestor: true }],
    entity: [
      summary.releaseId ? { what: { reference: `PackageRelease/${summary.releaseId}` } } : undefined,
      summary.binaryId ? { what: { reference: `Binary/${summary.binaryId}` } } : undefined,
      summary.configQuestionnaireBinaryId
        ? { what: { reference: `Binary/${summary.configQuestionnaireBinaryId}` }, name: 'config-questionnaire' }
        : undefined,
      ...(summary.smokeLeftBehind ?? []).map((ref) => ({ what: { reference: ref }, name: 'smoke-left-behind' })),
      { what: { display: `${summary.packageId}@${summary.version}` }, name: 'package-release' },
    ].filter((e): e is NonNullable<typeof e> => !!e),
  };

  try {
    await medplum.createResource(auditEvent);
    summary.auditRecorded = true;
  } catch (auditErr) {
    // Never fails the publish here — the caller decides, and in the error path the
    // original failure is the more useful thing to raise. But it is recorded on the
    // summary so "published but unattributable" cannot pass for success.
    summary.auditRecorded = false;
    console.warn(`! could not record publish AuditEvent — ${normalizeErrorString(auditErr)}`);
  }
}

// Upserts the Package and PackageRelease using the deployed marketplace profiles
// (Package: status+name+author required; PackageRelease: package+version+content
// required). Rich metadata with no base field (impl project, target, config
// Questionnaire) is carried via extensions. Guarded: if the server does not know
// these resource types yet, it is skipped with a warning.
async function registerRelease(medplum: MedplumClient, options: RegisterReleaseOptions): Promise<RegisterResult> {
  const { manifest, artifacts, binary, questionnaireBinaryRef, implProject, catalogProject, force, provenance } =
    options;
  const author = medplum.getProfile();
  if (!author) {
    throw new Error('Cannot register release: no authenticated profile for Package.author');
  }

  const catalogMeta = catalogProject ? { meta: { project: catalogProject } } : {};
  const pkgIdentifier = { system: PACKAGE_IDENTIFIER_SYSTEM, value: artifacts.packageId };
  const pkgBody = {
    resourceType: 'Package',
    ...catalogMeta,
    identifier: [pkgIdentifier],
    status: 'active',
    name: manifest.displayName,
    description: `${manifest.displayName} (${manifest.vendor}) — ${manifest.type} marketplace package.`,
    category: [{ coding: [{ system: 'https://medplum.com/package-type', code: manifest.type }] }],
    author: { reference: getReferenceString(author) },
  };

  try {
    const pkg = await upsertByIdentifier(
      medplum,
      'Package',
      PACKAGE_IDENTIFIER_SYSTEM,
      artifacts.packageId,
      pkgBody,
      catalogProject
    );

    // No impl-project extension for a data-only release: `$install` skips linking
    // when it is absent, which is exactly right — there is nothing to link to.
    const extension: Extension[] = [
      ...(implProject
        ? [{ url: PACKAGE_RELEASE_IMPL_PROJECT_EXT, valueReference: { reference: getReferenceString(implProject) } }]
        : []),
      { url: PACKAGE_RELEASE_TARGET_EXT, valueString: artifacts.target },
      // `PackageRelease` has no `author` element, so without this the identity
      // behind a specific version is only recoverable from resource history — and
      // history is per-row, so it does not survive the release being rewritten.
      { url: PACKAGE_RELEASE_AUTHOR_EXT, valueReference: provenance.authorRef },
      { url: PACKAGE_RELEASE_ARTIFACT_DIGEST_EXT, valueString: provenance.artifactDigest },
    ];

    if (provenance.sourceRevision) {
      extension.push({ url: PACKAGE_RELEASE_SOURCE_REVISION_EXT, valueString: provenance.sourceRevision });
    }

    if (artifacts.setupBotIdentifier) {
      extension.push({ url: PACKAGE_RELEASE_SETUP_BOT_EXT, valueString: artifacts.setupBotIdentifier });
    }

    if (questionnaireBinaryRef) {
      extension.push({
        url: PACKAGE_RELEASE_CONFIG_QUESTIONNAIRE_EXT,
        valueReference: { reference: questionnaireBinaryRef },
      });
    }

    const releaseIdValue = versionedImplIdentifier(artifacts.packageId, artifacts.version);
    const releaseBody = {
      resourceType: 'PackageRelease',
      ...catalogMeta,
      identifier: [{ system: PACKAGE_RELEASE_IDENTIFIER_SYSTEM, value: releaseIdValue }],
      package: pkg.id ? { reference: `Package/${pkg.id}` } : { identifier: pkgIdentifier },
      version: artifacts.version,
      description: `${manifest.displayName} ${artifacts.version} (${artifacts.target}).`,
      content: {
        contentType: 'application/fhir+json',
        url: getReferenceString(binary),
        title: `${artifacts.packageId}-${artifacts.version}-install.json`,
      },
      extension,
    };

    const release = await upsertByIdentifier(
      medplum,
      'PackageRelease',
      PACKAGE_RELEASE_IDENTIFIER_SYSTEM,
      releaseIdValue,
      releaseBody,
      catalogProject,
      // Rewriting a release in place would repoint an already-published version at
      // a different install Bundle, so a customer reinstalling would get something
      // other than what they first installed.
      { immutable: !force, label: `release ${releaseIdValue}` }
    );
    console.log(`+ registered Package/${pkg.id} + PackageRelease/${release.id} (${releaseIdValue})`);
    return { releaseId: release.id };
  } catch (err) {
    const msg = normalizeErrorString(err);
    // Only skip when the server does not know the catalog resource types yet.
    // Matching any "resource type … not found" also swallowed real failures
    // ("resource type 'Bot' not found in this project") into a skip — leaving
    // impl bots deployed with no catalog entry and no error surfaced. Hence the
    // `package` guard as well.
    //
    // Substring tests rather than one regex: the `resource type .*(not found)`
    // form this replaces backtracks polynomially, since the literal prefix can
    // match at many offsets and each drives a greedy scan to end-of-string.
    const lower = msg.toLowerCase();
    const mentionsUnknownType =
      lower.includes('unknown resource type') ||
      lower.includes('invalid resource type') ||
      (lower.includes('resource type') && (lower.includes('not found') || lower.includes('not supported')));
    if (/package(release)?/i.test(msg) && mentionsUnknownType) {
      console.warn(`! registry write skipped — server does not know Package/PackageRelease yet (${msg})`);
      return { skipped: msg };
    }
    throw err;
  }
}

interface IdentifiedResource {
  id?: string;
  identifier?: { system?: string; value?: string }[];
}

// Idempotent upsert for resource types that lack an `identifier` search param
// (Package/PackageRelease): list the type, match by identifier client-side, then
// PUT-by-id if found else POST-create.
async function upsertByIdentifier(
  medplum: MedplumClient,
  resourceType: string,
  system: string,
  value: string,
  body: Record<string, unknown>,
  catalogProject?: string,
  options?: { immutable?: boolean; label?: string }
): Promise<IdentifiedResource> {
  // Scope the match to the catalog project; otherwise a super admin publishing
  // from their own project would match a row there and update the wrong copy.
  const projectFilter = catalogProject ? `&_project=${catalogProject}` : '';
  const pageSize = 1000; // Medplum's DEFAULT_MAX_SEARCH_COUNT; larger values are clamped.
  const listUrl = `${medplum.fhirUrl(resourceType).toString()}?_count=${pageSize}&_total=accurate${projectFilter}`;
  const bundle: { total?: number; entry?: { resource?: IdentifiedResource }[] } = await medplum.get(listUrl);
  const entries = bundle.entry ?? [];
  if ((bundle.total ?? entries.length) > pageSize) {
    // Matching is client-side, so anything past the first page is invisible and
    // an existing row would be re-created rather than updated. Paginating is the
    // real fix; a catalog this large is not close, and a loud warning beats a
    // silent duplicate in the meantime.
    console.warn(
      `! ${resourceType} catalog has ${bundle.total} rows but only the first ${pageSize} were scanned — ` +
        `an existing "${value}" beyond that page would be duplicated rather than updated.`
    );
  }
  const match = entries
    .map((e) => e.resource)
    .find((r) => r?.identifier?.some((i) => i.system === system && i.value === value));

  if (match?.id) {
    if (options?.immutable) {
      throw new Error(
        `${resourceType}/${match.id} already exists for ${options.label ?? value} and is immutable once published. ` +
          `Bump manifest.version, or re-run with --force to overwrite it.`
      );
    }
    const updated: IdentifiedResource = await medplum.put(medplum.fhirUrl(resourceType, match.id), {
      ...body,
      id: match.id,
    });
    return updated;
  }
  const created: IdentifiedResource = await medplum.post(medplum.fhirUrl(resourceType), body);
  return created;
}

// Uploads the package's config Questionnaire as a Binary; returns its reference.
async function uploadConfigQuestionnaire(
  medplum: MedplumClient,
  manifest: PackageManifest,
  artifacts: BuildArtifacts,
  packageDir: string,
  catalogProject?: string
): Promise<string | undefined> {
  if (!manifest.configQuestionnaire) {
    return undefined;
  }
  const file = resolveWithinPackage(packageDir, manifest.configQuestionnaire, 'configQuestionnaire');
  if (!existsSync(file)) {
    throw new Error(`configQuestionnaire not found at ${file}`);
  }
  if (catalogProject) {
    const created = await createBinaryInProject(
      medplum,
      catalogProject,
      readFileSync(file, 'utf8'),
      'application/fhir+json'
    );
    return getReferenceString(created);
  }
  const binary = await medplum.createBinary({
    data: readFileSync(file, 'utf8'),
    contentType: 'application/fhir+json',
    filename: `${artifacts.packageId}-${artifacts.version}-config-questionnaire.json`,
  });
  return binary.id ? getReferenceString(binary) : undefined;
}

// Applies the install Bundle to prove it is well-formed, then removes exactly the
// resources it created.
//
// This runs in the *caller's* project. An earlier version created a throwaway
// project first, but `executeBatch` runs in the caller's context and never
// targeted it, so the Bundle landed in the publisher's own project while an empty
// project was deleted — the isolation was cosmetic. Proving the Bundle applies is
// still worth doing, so instead this cleans up precisely: only entries the server
// reports as `201 Created` are deleted. A `200` means a conditional upsert matched
// something that already existed in the caller's project, which must not be
// deleted and is worth surfacing on its own.
async function smokeTestInstallBundle(
  medplum: MedplumClient,
  artifacts: BuildArtifacts,
  leftBehind: string[]
): Promise<'pass' | 'fail' | 'skipped'> {
  const entryCount = artifacts.installBundle.entry?.length ?? 0;
  if (entryCount === 0) {
    return 'skipped';
  }

  let result: Bundle;
  try {
    result = await medplum.executeBatch(artifacts.installBundle);
  } catch (err) {
    console.warn(`  smoke: failed — ${normalizeErrorString(err)}`);
    return 'fail';
  }

  const entries = result.entry ?? [];
  const ok = entries.every((e) => (e.response?.status ?? '').startsWith('2'));
  const statuses = entries.map((e) => e.response?.status ?? '');
  const created = entries
    .filter((_, i) => statuses[i].startsWith('201'))
    .map((e) => e.response?.location)
    .filter((location): location is string => !!location);
  const matched = statuses.filter((status) => status.startsWith('200')).length;

  console.log(`  smoke: applied ${entryCount} entries → ${ok ? 'all 2xx' : 'some non-2xx'}`);
  if (matched > 0) {
    console.warn(
      `  smoke: ${matched} entr${matched === 1 ? 'y' : 'ies'} updated a resource that already existed in the ` +
        `publishing project rather than creating one; left in place.`
    );
  }

  await deleteSmokeResources(medplum, created, leftBehind);
  return ok ? 'pass' : 'fail';
}

// Deletes exactly what the smoke run created. Anything that cannot be removed is
// recorded, not just logged: a resource the smoke test created and left behind is
// a stray artifact in the publishing project, and the next run's conditional
// upsert would silently overwrite it rather than create one.
async function deleteSmokeResources(medplum: MedplumClient, created: string[], leftBehind: string[]): Promise<void> {
  let deleted = 0;
  // Reverse creation order, so a resource that references an earlier one is removed
  // before the thing it points at.
  for (const location of [...created].reverse()) {
    const parsed = parseEntryLocation(location);
    if (!parsed) {
      leftBehind.push(location);
      console.warn(`  smoke: could not parse created location ${location}; left in place`);
      continue;
    }
    const { resourceType, id } = parsed;
    try {
      await medplum.deleteResource(resourceType as 'Bot', id);
      deleted++;
    } catch (err) {
      leftBehind.push(`${resourceType}/${id}`);
      console.warn(`  smoke: could not clean up ${resourceType}/${id} — ${normalizeErrorString(err)}`);
    }
  }
  if (deleted > 0) {
    console.log(`  smoke: cleaned up ${deleted} created resource(s)`);
  }
}

/**
 * Splits a Bundle entry `response.location` into its resource type and id.
 *
 * Scans for the resource type rather than reading a fixed offset, because the
 * location is only loosely specified: `Bot/<id>` today, but a prefixed
 * (`fhir/R4/Bot/<id>`), absolute, or `_history`-suffixed form all name the same
 * resource. Stripping one fixed prefix left the others unparseable, and an
 * unparseable location was skipped outright — so a resource the smoke run really
 * did create was neither deleted nor recorded as left behind.
 * @param location - The `response.location` from a transaction Bundle entry.
 * @returns The resource type and id, or undefined if the location names neither.
 */
function parseEntryLocation(location: string): { resourceType: string; id: string } | undefined {
  const segments = location.split('?')[0].split('/').filter(Boolean);
  for (let i = segments.length - 1; i >= 0; i--) {
    if (/^[A-Z][A-Za-z]+$/.test(segments[i]) && segments[i + 1]) {
      return { resourceType: segments[i], id: segments[i + 1] };
    }
  }
  return undefined;
}
