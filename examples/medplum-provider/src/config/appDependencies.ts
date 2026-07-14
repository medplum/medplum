// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * The Medplum Provider app implicitly depends on several Medplum "shared projects" being linked
 * into the user's project (e.g. UMLS terminology, US Core profiles). Hosted
 * projects get these out-of-the-box via project linking, but self-hosted projects or projects
 * running from source have none of them.
 *
 * This file declares those dependencies in one place so that {@link useMissingDependencies} can
 * probe for them once per session and surface a single consolidated message to the user, instead
 * of letting each dependent field fail independently with an opaque "Not found" error.
 *
 * See https://github.com/medplum/medplum/issues/9824 for context.
 */

/** A ValueSet expected to be expandable (via `$expand`). */
export interface ValueSetProbe {
  readonly kind: 'valueSet';
  readonly url: string;
}

/** A profile StructureDefinition expected to be present. */
export interface ProfileProbe {
  readonly kind: 'profile';
  readonly url: string;
}

export type DependencyProbe = ValueSetProbe | ProfileProbe;

export interface DependencyGroup {
  /** Stable key, used for caching and dismissal state. */
  readonly id: string;
  /** Human-readable name of the shared project, shown in the banner. */
  readonly name: string;
  /** Link to setup docs for this dependency. */
  readonly docsUrl: string;
  /**
   * The probe used to detect this group. Backed by the group's shared project, so a definitive
   * missing result (404/400/empty) means the project is unlinked.
   */
  readonly probe: DependencyProbe;
}

// Shared ValueSet URLs, re-exported so call sites bind against these constants rather than
// duplicating the literal strings (keeping the manifest and the UI in sync).
export const ICD10_CM_BILLABLE_VALUESET = 'http://hl7.org/fhir/sid/icd-10-cm/vs/billable';

export const DEPENDENCY_GROUPS: readonly DependencyGroup[] = [
  {
    id: 'umls-terminology',
    name: 'UMLS terminology',
    docsUrl: 'https://www.medplum.com/docs/terminology',
    probe: { kind: 'valueSet', url: ICD10_CM_BILLABLE_VALUESET },
  },
  {
    id: 'us-core-profiles',
    name: 'US Core profiles',
    docsUrl: 'https://www.medplum.com/docs/fhir-datastore/profiles',
    probe: { kind: 'profile', url: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient' },
  },
];
