// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient, WithId } from '@medplum/core';
import {
  badRequest,
  getExtensionValue,
  getIdentifier,
  getReferenceString,
  isReference,
  OperationOutcomeError,
  parseReference,
  resolveId,
  SNOMED,
} from '@medplum/core';
import type {
  Bundle,
  BundleEntry,
  Encounter,
  Organization,
  Patient,
  Practitioner,
  QuestionnaireResponse,
  Reference,
  Resource,
  ServiceRequest,
  Specimen,
  Task,
} from '@medplum/fhirtypes';
import type {
  BillTo,
  DiagnosisCodeableConcept,
  LabOrderTestMetadata,
  LabOrganization,
  PartialLabOrderInputs,
  TestCoding,
} from '@medplum/health-gorilla-core';
import {
  createLabOrderBundle,
  HEALTH_GORILLA_SYSTEM,
  isBillTo,
  MEDPLUM_HEALTH_GORILLA_LAB_ORDER_EXTENSION_URL_BILL_TO,
  MEDPLUM_HEALTH_GORILLA_LAB_ORDER_EXTENSION_URL_PERFORMING_LAB_AN,
  MEDPLUM_HEALTH_GORILLA_LAB_ORDER_EXTENSION_URL_PERFORMING_LAB_PHYSICIAN_AN,
  MEDPLUM_HEALTH_GORILLA_LAB_ORDER_PROFILE,
  validateLabOrderInputs,
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
      const code = getTestCode(child);
      if (!code) {
        return;
      }
      const aoeRef = getAoeReference(child);
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

/** Extensions the order form writes on a lab order. Any others on a resumed draft are kept. */
const FORM_EXTENSION_URLS = new Set([
  MEDPLUM_HEALTH_GORILLA_LAB_ORDER_EXTENSION_URL_BILL_TO,
  MEDPLUM_HEALTH_GORILLA_LAB_ORDER_EXTENSION_URL_PERFORMING_LAB_AN,
  MEDPLUM_HEALTH_GORILLA_LAB_ORDER_EXTENSION_URL_PERFORMING_LAB_PHYSICIAN_AN,
]);

/**
 * Saves the lab order form as a draft lab order, without sending it to the lab.
 *
 * Without `draft`, a new draft is created. With `draft`, that draft and its per-test requests, AOE
 * answers and specimen are updated in place, so resuming it again shows what was saved. Unlike
 * submitting, the bill-to and required AOE answers can still be missing.
 * @param medplum - The Medplum client.
 * @param inputs - The values entered in the lab order form.
 * @param draft - The draft lab order to update, if any.
 * @returns The saved draft lab order.
 */
export async function saveLabOrderDraft(
  medplum: MedplumClient,
  inputs: PartialLabOrderInputs,
  draft?: ServiceRequest
): Promise<WithId<ServiceRequest>> {
  const bundle = createLabOrderDraftBundle(inputs);
  const entries = bundle.entry ?? [];
  const orderIndex = entries.findIndex(isLabOrderEntry);
  if (draft?.id) {
    await targetExistingDraft(medplum, entries, entries[orderIndex], draft.id);
  }

  const response = await medplum.executeBatch(bundle);
  const failed = response.entry?.find((entry) => !entry.response?.status?.startsWith('2'));
  if (failed) {
    throw new OperationOutcomeError(failed.response?.outcome ?? badRequest('Lab order draft was not saved'));
  }
  notifyBatchModified(medplum, entries, response);
  return response.entry?.[orderIndex]?.resource as WithId<ServiceRequest>;
}

function createLabOrderDraftBundle(inputs: PartialLabOrderInputs): Bundle {
  // Skip the builder's checks on AOE answers and billing, which only need to be complete on submit
  const testMetadata = Object.fromEntries(
    Object.entries(inputs.testMetadata ?? {}).map(([code, metadata]) => [
      code,
      metadata && { ...metadata, aoeQuestionnaire: undefined },
    ])
  );
  const billingComplete = !validateLabOrderInputs(inputs)?.billingInformation;
  const bundle = createLabOrderBundle({
    ...inputs,
    testMetadata,
    billingInformation: billingComplete ? inputs.billingInformation : { billTo: 'patient' },
  });
  if (billingComplete) {
    return bundle;
  }

  // Record the bill-to chosen so far in place of the placeholder
  const order = bundle.entry?.find(isLabOrderEntry)?.resource as ServiceRequest;
  const billTo = inputs.billingInformation?.billTo;
  const extension = (order.extension ?? []).filter(
    (ext) => ext.url !== MEDPLUM_HEALTH_GORILLA_LAB_ORDER_EXTENSION_URL_BILL_TO
  );
  if (billTo) {
    extension.push({ url: MEDPLUM_HEALTH_GORILLA_LAB_ORDER_EXTENSION_URL_BILL_TO, valueString: billTo });
  }
  order.extension = extension.length > 0 ? extension : undefined;
  return bundle;
}

/**
 * Turns the creates in a new draft's bundle into updates of an existing draft's resources, and
 * deletes the per-test requests, AOE answers and specimen the form no longer has.
 * @param medplum - The Medplum client.
 * @param entries - The entries of the bundle built from the form, which are modified in place.
 * @param orderEntry - The entry for the top-level lab order.
 * @param draftId - The ID of the draft lab order to update.
 */
async function targetExistingDraft(
  medplum: MedplumClient,
  entries: BundleEntry[],
  orderEntry: BundleEntry,
  draftId: string
): Promise<void> {
  const [current, currentTests] = await Promise.all([
    medplum.readResource('ServiceRequest', draftId, { cache: 'no-cache' }),
    medplum.searchResources('ServiceRequest', { 'based-on': `ServiceRequest/${draftId}` }, { cache: 'no-cache' }),
  ]);
  const currentSpecimenRef = current.specimen?.find((ref): ref is Reference<Specimen> => isReference(ref, 'Specimen'));
  const currentSpecimen = currentSpecimenRef
    ? await medplum.readReference(currentSpecimenRef, { cache: 'no-cache' })
    : undefined;
  const deletes: string[] = [];

  const unmatchedTests = [...currentTests];
  for (const entry of entries) {
    const test = entry.resource as ServiceRequest | undefined;
    if (test?.resourceType !== 'ServiceRequest' || test.basedOn?.[0]?.reference !== orderEntry.fullUrl) {
      continue;
    }
    const index = unmatchedTests.findIndex((currentTest) => getTestCode(currentTest) === getTestCode(test));
    if (index === -1) {
      continue;
    }
    const [currentTest] = unmatchedTests.splice(index, 1);
    const aoeEntry = findEntry(entries, test.supportingInfo?.[0]?.reference);
    const currentAoeRef = getAoeReference(currentTest);
    updateEntry(entry, getReferenceString(currentTest), currentTest);
    if (currentAoeRef?.reference) {
      if (aoeEntry) {
        updateEntry(aoeEntry, currentAoeRef.reference);
      } else {
        deletes.push(currentAoeRef.reference);
      }
    }
  }
  for (const removedTest of unmatchedTests) {
    deletes.push(getReferenceString(removedTest));
    const aoeRef = getAoeReference(removedTest);
    if (aoeRef?.reference) {
      deletes.push(aoeRef.reference);
    }
  }

  if (currentSpecimen) {
    const specimenEntry = findEntry(entries, (orderEntry.resource as ServiceRequest).specimen?.[0]?.reference);
    if (specimenEntry) {
      updateEntry(specimenEntry, getReferenceString(currentSpecimen), currentSpecimen);
    } else {
      deletes.push(getReferenceString(currentSpecimen));
    }
  }

  const formExtensions = (orderEntry.resource as ServiceRequest).extension ?? [];
  updateEntry(orderEntry, getReferenceString(current), current);
  const extension = [
    ...(current.extension ?? []).filter((ext) => !FORM_EXTENSION_URLS.has(ext.url)),
    ...formExtensions,
  ];
  (orderEntry.resource as ServiceRequest).extension = extension.length > 0 ? extension : undefined;

  entries.push(...deletes.map((url): BundleEntry => ({ request: { method: 'DELETE', url } })));
}

/**
 * Turns a create entry into an update of the resource at `reference`. Fields of `existing` that the
 * form does not set, such as the draft's encounter, are kept. The entry's `fullUrl` is left as is,
 * so other entries' references to it resolve to the updated resource.
 * @param entry - The bundle entry to modify in place.
 * @param reference - The reference string of the resource to update.
 * @param existing - The current version of the resource, to keep the fields the form does not set.
 */
function updateEntry(entry: BundleEntry, reference: string, existing?: Resource): void {
  const resource = entry.resource as Resource;
  entry.request = { method: 'PUT', url: reference };
  entry.resource = { ...existing, ...resource, id: resolveId({ reference }) } as Resource;
  if (existing?.meta && resource.meta) {
    entry.resource.meta = { ...existing.meta, ...resource.meta };
  }
}

/**
 * executeBatch does not tell the client what it changed, so cached reads and searches would
 * show the draft as it was before the save when it is resumed again.
 * @param medplum - The Medplum client.
 * @param entries - The entries of the bundle that was executed.
 * @param response - The batch response, whose entries are in the same order.
 */
function notifyBatchModified(medplum: MedplumClient, entries: BundleEntry[], response: Bundle): void {
  entries.forEach((entry, index) => {
    const resource = response.entry?.[index]?.resource as WithId<Resource> | undefined;
    if (resource) {
      const operation = entry.request?.method === 'PUT' ? 'update' : 'create';
      medplum.notifyResourceModified({ resourceType: resource.resourceType, operation, id: resource.id, resource });
    } else if (entry.request?.method === 'DELETE') {
      const [resourceType, id] = parseReference({ reference: entry.request.url });
      medplum.notifyResourceModified({ resourceType, operation: 'delete', id });
    }
  });
}

function isLabOrderEntry(entry: BundleEntry): boolean {
  return !!entry.resource?.meta?.profile?.includes(MEDPLUM_HEALTH_GORILLA_LAB_ORDER_PROFILE);
}

/**
 * @param entries - The bundle entries to search.
 * @param placeholder - A `urn:uuid:` reference to another entry in the same bundle.
 * @returns The entry that the placeholder refers to, if any.
 */
function findEntry(entries: BundleEntry[], placeholder: string | undefined): BundleEntry | undefined {
  return placeholder ? entries.find((entry) => entry.fullUrl === placeholder) : undefined;
}

function getTestCode(test: ServiceRequest): string | undefined {
  return test.code?.coding?.[0]?.code;
}

function getAoeReference(test: ServiceRequest): Reference<QuestionnaireResponse> | undefined {
  return test.supportingInfo?.find((ref): ref is Reference<QuestionnaireResponse> =>
    isReference(ref, 'QuestionnaireResponse')
  );
}
