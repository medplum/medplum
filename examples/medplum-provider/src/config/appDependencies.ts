// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * The Medplum Provider app implicitly depends on several Medplum "shared projects" being linked
 * into the user's project (e.g. UMLS terminology, US Core profiles, integration bots). Hosted
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

/** An integration Bot expected to be present, identified by its bot-identifier. */
export interface BotProbe {
  readonly kind: 'bot';
  readonly system: string;
  readonly value: string;
}

export type DependencyProbe = ValueSetProbe | ProfileProbe | BotProbe;

export interface DependencyGroup {
  /** Stable key, used for caching and dismissal state. */
  readonly id: string;
  /** Human-readable name of the shared project, shown in the banner. */
  readonly name: string;
  /** Link to setup docs for this dependency. */
  readonly docsUrl: string;
  /**
   * The probes used to detect this group. A group is flagged missing when at least one probe
   * definitively resolves as missing (404/400/empty) AND none resolve as present. Because every
   * probe in a group is backed by the same shared project, a single present probe proves the
   * project is linked (so the group is not flagged), while a missing probe with no present sibling
   * indicates the project is unlinked.
   */
  readonly probes: readonly DependencyProbe[];
}

// Shared ValueSet URLs, re-exported so call sites bind against these constants rather than
// duplicating the literal strings (keeping the manifest and the UI in sync).
export const ICD10_CM_BILLABLE_VALUESET = 'http://hl7.org/fhir/sid/icd-10-cm/vs/billable';

export const DEPENDENCY_GROUPS: readonly DependencyGroup[] = [
  {
    id: 'umls-terminology',
    name: 'UMLS terminology',
    docsUrl: 'https://www.medplum.com/docs/terminology',
    probes: [
      // ICD-10-CM (diagnoses) and a representative UMLS/NLM value set. Both are backed by the
      // UMLS terminology shared project, so probing one or two representatives is sufficient.
      { kind: 'valueSet', url: ICD10_CM_BILLABLE_VALUESET },
      { kind: 'valueSet', url: 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113762.1.4.1010.4' },
    ],
  },
  {
    id: 'us-core-profiles',
    name: 'US Core profiles',
    docsUrl: 'https://www.medplum.com/docs/fhir-datastore/profiles',
    probes: [{ kind: 'profile', url: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient' }],
  },
  {
    id: 'health-gorilla',
    name: 'Health Gorilla integration',
    docsUrl: 'https://www.medplum.com/docs/integration/health-gorilla',
    probes: [
      {
        kind: 'bot',
        system: 'https://www.medplum.com/integrations/bot-identifier',
        value: 'health-gorilla-labs/autocomplete',
      },
    ],
  },
];
