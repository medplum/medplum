// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient } from '@medplum/core';
import { getExtensionValue, getIdentifier, isReference, SNOMED } from '@medplum/core';
import type {
  Encounter,
  Organization,
  Patient,
  Practitioner,
  QuestionnaireResponse,
  Reference,
  ServiceRequest,
  Specimen,
  Task,
} from '@medplum/fhirtypes';
import type {
  BillTo,
  DiagnosisCodeableConcept,
  LabOrderTestMetadata,
  LabOrganization,
  TestCoding,
} from '@medplum/health-gorilla-core';
import {
  HEALTH_GORILLA_SYSTEM,
  isBillTo,
  MEDPLUM_HEALTH_GORILLA_LAB_ORDER_EXTENSION_URL_BILL_TO,
  MEDPLUM_HEALTH_GORILLA_LAB_ORDER_EXTENSION_URL_PERFORMING_LAB_AN,
  MEDPLUM_HEALTH_GORILLA_LAB_ORDER_EXTENSION_URL_PERFORMING_LAB_PHYSICIAN_AN,
} from '@medplum/health-gorilla-core';
import type { TestSearch } from '@medplum/health-gorilla-react';
import { getAutocompleteSearchFunction } from '@medplum/health-gorilla-react';

/** Marks a ServiceRequest as a lab order in `code.coding` on care-plan generated drafts; it is not a test. */
const SNOMED_LAB_PROCEDURE_CODE = '108252007';

const AUTOCOMPLETE_BOT = {
  system: 'https://www.medplum.com/integrations/bot-identifier',
  value: 'health-gorilla-labs/autocomplete',
};

/**
 * The values needed to pre-fill the lab order form from an existing draft lab order.
 */
export interface LabOrderDraftDefaults {
  patient?: Patient;
  requester?: Practitioner;
  encounter?: Reference<Encounter>;
  /** The Task whose focus is the draft, so the task can be pointed at the new order. */
  task?: Task;
  performingLab?: LabOrganization;
  performingLabAccountNumber?: string;
  performingLabPhysicianAccountNumber?: string;
  tests: TestCoding[];
  /** Tests on the draft that could not be matched to the performing lab's compendium. */
  unresolvedTests: TestCoding[];
  testMetadata: Record<string, Pick<LabOrderTestMetadata, 'priority' | 'notes' | 'aoeResponses'>>;
  diagnoses: DiagnosisCodeableConcept[];
  billTo?: BillTo;
  orderNotes?: string;
  specimenCollectedDateTime?: Date;
}

/**
 * Reads the resources referenced by a draft lab order so the order form can be re-populated with it.
 *
 * A lab order is a top-level `ServiceRequest` (holding the selected tests, diagnoses, billing and notes)
 * plus one child `ServiceRequest` per test (holding that test's priority, notes and AOE answers).
 * @param medplum - The Medplum client.
 * @param order - The draft lab order to resume.
 * @returns The values to pre-fill the lab order form with.
 */
export async function getLabOrderDraftDefaults(
  medplum: MedplumClient,
  order: ServiceRequest
): Promise<LabOrderDraftDefaults> {
  const subjectRef = isReference(order.subject, 'Patient') ? (order.subject as Reference<Patient>) : undefined;
  const requesterRef = isReference(order.requester, 'Practitioner')
    ? (order.requester as Reference<Practitioner>)
    : undefined;
  const performerRef = order.performer?.find((ref): ref is Reference<Organization> => isReference(ref, 'Organization'));
  const specimenRef = order.specimen?.find((ref): ref is Reference<Specimen> => isReference(ref, 'Specimen'));

  const [patient, requester, performingLab, specimen, childRequests, task] = await Promise.all([
    subjectRef ? medplum.readReference(subjectRef) : undefined,
    requesterRef ? medplum.readReference(requesterRef) : undefined,
    performerRef ? medplum.readReference(performerRef) : undefined,
    specimenRef ? medplum.readReference(specimenRef) : undefined,
    order.id ? medplum.searchResources('ServiceRequest', { 'based-on': `ServiceRequest/${order.id}` }) : [],
    order.id ? medplum.searchOne('Task', { focus: `ServiceRequest/${order.id}` }) : undefined,
  ]);

  const { tests, unresolvedTests } = await resolveTests(
    medplum,
    (order.code?.coding ?? []).filter(
      (coding): coding is TestCoding =>
        !!coding.code && !(coding.system === SNOMED && coding.code === SNOMED_LAB_PROCEDURE_CODE)
    ),
    performingLab
  );

  const testMetadata: LabOrderDraftDefaults['testMetadata'] = {};
  await Promise.all(
    childRequests.map(async (child) => {
      const code = child.code?.coding?.[0]?.code;
      if (!code) {
        return;
      }
      const aoeRef = child.supportingInfo?.find((ref): ref is Reference<QuestionnaireResponse> =>
        isReference(ref, 'QuestionnaireResponse')
      );
      testMetadata[code] = {
        priority: child.priority,
        notes: child.note?.[0]?.text,
        aoeResponses: aoeRef ? await medplum.readReference(aoeRef) : undefined,
      };
    })
  );

  const billTo = getExtensionValue(order, MEDPLUM_HEALTH_GORILLA_LAB_ORDER_EXTENSION_URL_BILL_TO);
  const performingLabAccountNumber = getExtensionValue(
    order,
    MEDPLUM_HEALTH_GORILLA_LAB_ORDER_EXTENSION_URL_PERFORMING_LAB_AN
  );
  const performingLabPhysicianAccountNumber = getExtensionValue(
    order,
    MEDPLUM_HEALTH_GORILLA_LAB_ORDER_EXTENSION_URL_PERFORMING_LAB_PHYSICIAN_AN
  );
  const collectedDateTime = specimen?.collection?.collectedDateTime;

  return {
    patient,
    requester,
    encounter: isReference(order.encounter, 'Encounter') ? order.encounter : undefined,
    task,
    performingLab,
    performingLabAccountNumber: typeof performingLabAccountNumber === 'string' ? performingLabAccountNumber : undefined,
    performingLabPhysicianAccountNumber:
      typeof performingLabPhysicianAccountNumber === 'string' ? performingLabPhysicianAccountNumber : undefined,
    tests,
    unresolvedTests,
    testMetadata,
    diagnoses: (order.reasonCode ?? []).filter(
      (concept): concept is DiagnosisCodeableConcept => !!concept.coding?.[0]?.system && !!concept.coding?.[0]?.code
    ),
    billTo: isBillTo(billTo) ? billTo : undefined,
    orderNotes: order.note?.[0]?.text,
    specimenCollectedDateTime: collectedDateTime ? new Date(collectedDateTime) : undefined,
  };
}

/**
 * Drafts that were not created by the order form (e.g. from a care plan) carry their tests as
 * SNOMED, LOINC or CPT codings, which Health Gorilla rejects. Looks those up in the performing
 * lab's compendium so the resumed order carries the lab's own coding. Compendium codings are
 * kept as-is; tests that cannot be found are reported separately rather than sent.
 * @param medplum - The Medplum client.
 * @param tests - The test codings read from the draft.
 * @param performingLab - The draft's performing lab, if any.
 * @returns The resolved test codings and the ones that could not be matched.
 */
async function resolveTests(
  medplum: MedplumClient,
  tests: TestCoding[],
  performingLab: Organization | undefined
): Promise<Pick<LabOrderDraftDefaults, 'tests' | 'unresolvedTests'>> {
  const labId = performingLab && getIdentifier(performingLab, HEALTH_GORILLA_SYSTEM);
  const search = labId ? getAutocompleteSearchFunction(medplum, AUTOCOMPLETE_BOT) : undefined;
  const resolved = await Promise.all(
    tests.map(async (test): Promise<TestCoding | undefined> => {
      if (isCompendiumCoding(test)) {
        return test;
      }
      if (!search || !labId) {
        return undefined;
      }
      // The compendium is searched by the draft's code and then by its name, but a hit only counts
      // when the lab's code is the same string. Terminology codes rarely coincide with a lab's own
      // codes, so most terminology-coded tests end up unresolved; that is preferred over guessing a
      // different test by name on a clinical order.
      try {
        for (const query of [test.code, test.display?.replace(/\s*\(procedure\)$/i, '')]) {
          if (!query) {
            continue;
          }
          const { result } = await search<TestSearch>({ type: 'test', query, labId });
          const match = result.find((candidate) => candidate.code === test.code);
          if (match) {
            return match;
          }
        }
      } catch {
        // A failed lookup is reported as an unresolved test rather than blocking the whole draft
      }
      return undefined;
    })
  );

  return {
    tests: resolved.filter((test): test is TestCoding => !!test),
    unresolvedTests: tests.filter((_, index) => !resolved[index]),
  };
}

/**
 * Health Gorilla compendium codings use the lab's own `urn:uuid:` system rather than a terminology.
 * @param coding - A test coding from the draft.
 * @returns True if the coding already comes from a lab compendium.
 */
function isCompendiumCoding(coding: TestCoding): boolean {
  return !!coding.system?.startsWith('urn:uuid:');
}
