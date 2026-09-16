// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/** Canonical Medplum Bot identifier system. */
export const BOT_IDENTIFIER_SYSTEM = 'https://www.medplum.com/bots';

/**
 * Returns the Bot `identifier.system` a package publishes under.
 *
 * Marketplace bots are namespaced per package rather than sharing
 * {@link BOT_IDENTIFIER_SYSTEM}, because `Bot/$execute?identifier=` resolves
 * through a caller-scoped search that spans every linked project exporting `Bot`.
 * Under one shared system, two packages that happened to pick the same short name
 * would both match, and which one ran would be whichever the database returned
 * first. Namespacing makes that collision impossible instead of merely unlikely,
 * and core now rejects an ambiguous identifier rather than picking one.
 * @param packageId - The package identifier.
 * @returns The `identifier.system` for the package's bots.
 */
export function botIdentifierSystem(packageId: string): string {
  return `${BOT_IDENTIFIER_SYSTEM}/${packageId}`;
}

/**
 * Extension URL that links an `OperationDefinition` to its backing Bot, so the
 * server's `tryCustomOperation` dispatch routes `POST /fhir/R4/<Resource>/$<code>`.
 */
export const OPERATION_DEFINITION_IMPLEMENTATION_EXTENSION =
  'https://medplum.com/fhir/StructureDefinition/operationDefinition-implementation';

/** `meta.tag` system marking resources written by a package install Bundle. */
export const PACKAGE_INSTALL_TAG_SYSTEM = 'https://medplum.com/package-install';

/** `meta.tag` system marking resources published to an impl project. */
export const PACKAGE_IMPL_TAG_SYSTEM = 'https://medplum.com/package-impl';

/**
 * `meta.tag` system recording which release wrote a customer-side resource, as a
 * companion to {@link PACKAGE_INSTALL_TAG_SYSTEM}. Value is
 * {@link packageVersionRef}.
 *
 * A separate system rather than a second coding under the package's own system,
 * because a bare version as a second coding is indistinguishable from a package
 * whose id merely looks like a version, and cannot express "this package at this
 * version" as one token. Pinning both in one value keeps `_tag` searches exact.
 *
 * The tag records the release that *last* wrote the resource, not every release
 * that ever did — a conditional upsert replaces `meta.tag` wholesale. That is what
 * makes it useful for upgrade: once `$upgrade` has re-applied everything the new
 * release declares, whatever still carries the old version is exactly what the new
 * release dropped, and therefore what teardown should reclaim.
 *
 * It is not an audit trail; `AuditEvent` and resource history are. And because
 * `meta.tag` is client-writable, it must not be used to enforce entitlement.
 */
export const PACKAGE_INSTALL_VERSION_TAG_SYSTEM = 'https://medplum.com/package-install-version';

/**
 * `meta.tag` system recording which release published an impl resource. Companion
 * to {@link PACKAGE_IMPL_TAG_SYSTEM}; see
 * {@link PACKAGE_INSTALL_VERSION_TAG_SYSTEM} for why it is its own system.
 */
export const PACKAGE_IMPL_VERSION_TAG_SYSTEM = 'https://medplum.com/package-impl-version';

/**
 * Returns the `<packageId>@<version>` reference used as a version tag value, and as
 * the `PackageRelease` identifier value.
 * @param packageId - The package identifier.
 * @param version - The release version.
 * @returns The `<packageId>@<version>` reference.
 */
export function packageVersionRef(packageId: string, version: string): string {
  return `${packageId}@${version}`;
}

/** `identifier.system` for `Package` resources (value = package id). */
export const PACKAGE_IDENTIFIER_SYSTEM = 'https://medplum.com/package';

/**
 * `identifier.system` for a package's shared impl `Project` (value =
 * `<packageId>-v<major>`).
 *
 * The impl project must be identified by this rather than by `Project.name`:
 * names are neither unique nor privileged, so a name-only lookup would let any
 * project that happens to share the conventional name receive a package's impl
 * bots and become the target every install links to.
 */
export const PACKAGE_IMPL_PROJECT_IDENTIFIER_SYSTEM = 'https://medplum.com/package-impl-project';

/**
 * Returns the stable identifier value for a package's impl project.
 *
 * Pass `version` for a package whose impl version lives in the project rather than
 * in the bot identifiers (see `implVersioning`); the resulting project holds one
 * release, and `$upgrade` moves the customer's `Project.link` to the next one.
 * @param packageId - The package identifier.
 * @param majorVersion - The package major version.
 * @param version - Full release version, for per-version projects.
 * @returns The impl project identifier value.
 */
export function implProjectIdentifier(packageId: string, majorVersion: number, version?: string): string {
  return version ? `${packageId}-${version}` : `${packageId}-v${majorVersion}`;
}

/** `identifier.system` for `PackageRelease` resources (value = `<packageId>@<version>`). */
export const PACKAGE_RELEASE_IDENTIFIER_SYSTEM = 'https://medplum.com/package-release';

/**
 * Extensions carrying marketplace metadata that has no base field on the
 * deployed `PackageRelease` profile. Read by the install handler.
 */
/** Matches `PackageReleaseImplProjectUrl` in `packageinstall.ts`. */
export const PACKAGE_RELEASE_IMPL_PROJECT_EXT =
  'https://medplum.com/fhir/StructureDefinition/packageRelease-impl-project';
export const PACKAGE_RELEASE_TARGET_EXT = 'https://medplum.com/fhir/StructureDefinition/package-release-target';
export const PACKAGE_RELEASE_CONFIG_QUESTIONNAIRE_EXT =
  'https://medplum.com/fhir/StructureDefinition/package-release-config-questionnaire';
/** Matches `PackageReleaseSetupBotUrl` in `packageinstall.ts`. */
export const PACKAGE_RELEASE_SETUP_BOT_EXT = 'https://medplum.com/fhir/StructureDefinition/packageRelease-setup-bot';

/**
 * Who published this release. `Package` has a required `author`, but
 * `PackageRelease` has no such element, so without this the identity behind an
 * individual version is only recoverable from resource history.
 */
export const PACKAGE_RELEASE_AUTHOR_EXT = 'https://medplum.com/fhir/StructureDefinition/packageRelease-author';

/**
 * Source revision the release was built from (a git commit SHA). Answers "what
 * source produced this version", which the release otherwise cannot express.
 */
export const PACKAGE_RELEASE_SOURCE_REVISION_EXT =
  'https://medplum.com/fhir/StructureDefinition/packageRelease-source-revision';

/**
 * `sha256:<hex>` over the release's artifacts — the install Bundle plus each impl
 * bot's compiled code, keyed by versioned identifier. Two publishes of the same
 * source produce the same digest, so a changed digest on a version that is meant
 * to be immutable is evidence of a rewrite.
 */
export const PACKAGE_RELEASE_ARTIFACT_DIGEST_EXT =
  'https://medplum.com/fhir/StructureDefinition/packageRelease-artifact-digest';

/**
 * Questionnaire item extension: `$install` writes the answer to `Project.secret`.
 *
 * Matches `PackageSecretExtensionUrl` in `packageinstall.ts`, which is what acts
 * on it. Names are not namespaced per package, because `Project.secret` is one
 * flat namespace shared with the platform — the `$ai` endpoint reads `OPENAI_API_KEY`
 * from it — so two packages choosing the same name will collide, and that is caught
 * at review rather than mangled at install.
 */
export const PACKAGE_SECRET_EXT = 'https://medplum.com/fhir/StructureDefinition/package-secret';

/** All deployment targets a manifest is compiled against. */
export const TARGET_ENVS = ['local', 'staging', 'production'] as const;

/**
 * Returns the conventional impl project name.
 * @param packageId - The package identifier.
 * @param majorVersion - The package major version.
 * @param version - Full release version, for per-version projects.
 * @returns The impl project name.
 */
export function implProjectName(packageId: string, majorVersion: number, version?: string): string {
  return version ? `${packageId}-impl-${version}` : `${packageId}-impl-v${majorVersion}`;
}

/**
 * Returns the version-tagged impl bot identifier (`<identifier>@<version>`).
 * @param identifier - The base impl bot identifier.
 * @param version - The package release version.
 * @returns The version-tagged identifier.
 */
export function versionedImplIdentifier(identifier: string, version: string): string {
  return `${identifier}@${version}`;
}
