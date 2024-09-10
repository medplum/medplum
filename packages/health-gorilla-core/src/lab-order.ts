import { createReference, deepClone, isReference, MedplumClient, SNOMED } from '@medplum/core';
import {
  Bundle,
  Coverage,
  Extension,
  Patient,
  Practitioner,
  QuestionnaireResponse,
  Reference,
  Resource,
  ResourceType,
  ServiceRequest,
  Specimen,
} from '@medplum/fhirtypes';
import { getMissingRequiredQuestionnaireItems } from './aoe';
import {
  MEDPLUM_HEALTH_GORILLA_LAB_ORDER_EXTENSION_URL_BILL_TO,
  MEDPLUM_HEALTH_GORILLA_LAB_ORDER_EXTENSION_URL_PERFORMING_LAB_AN,
  MEDPLUM_HEALTH_GORILLA_LAB_ORDER_PROFILE,
} from './constants';
import {
  BillingInformation,
  DiagnosisCodeableConcept,
  isBillTo,
  LabOrderServiceRequest,
  LabOrderTestMetadata,
  LabOrganization,
  TestCoding,
} from './types';

export type LabOrderInputs = {
  /** `Patient` the tests are ordered for. This must be a reference to an existing `Patient` resource. */
  patient: Patient | (Reference<Patient> & { reference: string });
  /** The physician who requests diagnostic procedures for the patient and responsible for the order.  */
  requester: Practitioner | (Reference<Practitioner> & { reference: string });
  /** The desired performer for doing the diagnostic testing - laboratory, radiology imaging center, etc. */
  performingLab: LabOrganization;
  /**
   * (optional) Account Number for the performing lab. If not provided, the `HEALTH_GORILLA_SUBTENANT_ACCOUNT_NUMBER`
   * `Project.secret` is used.
   */
  performingLabAccountNumber?: string;
  /** The list of tests ordered within the given order. */
  selectedTests: TestCoding[];
  /** An object mapping the `Coding.code` of each selected test to an `LabOrderTestMetadata` object.  */
  testMetadata: Record<string, LabOrderTestMetadata>;
  /** An explanation or justification for why this diagnostic investigation is being requested in coded or textual form. */
  diagnoses: DiagnosisCodeableConcept[];
  /** (optional) The collection date of the lab order. */
  specimenCollectedDateTime?: Date;
  /** The billing preferences for the order. */
  billingInformation: BillingInformation;
  /** (optional) An order note - any comments that should be included in the requisition. */
  orderNotes?: string;
};

function tempId(): string {
  return 'urn:uuid:' + crypto.randomUUID();
}

/**
 * A modified type of `LabOrderInputs` that makes every field and sub-field optional and loosens
 * cardinality checks to facilitate typical type signatures of hooks and other state used in
 * React components that call `createLabOrderBundle`. This type is used in conjunction
 * with `validateLabOrderInputs`
 */
export type PartialLabOrderInputs = Partial<
  Omit<LabOrderInputs, 'billingInformation' | 'testMetadata'> & {
    testMetadata: Record<string, LabOrderTestMetadata | undefined>;
    billingInformation: Partial<
      Omit<BillingInformation, 'patientCoverage'> & {
        patientCoverage?: Coverage[];
      }
    >;
  }
>;

export function validateLabOrderInputs(args: PartialLabOrderInputs): asserts args is LabOrderInputs {
  const issues: string[] = [];

  if (!args.patient) {
    issues.push('Patient is required');
  }

  if (!args.requester) {
    issues.push('Requester is required');
  }

  if (!args.performingLab) {
    issues.push('Performing lab is required');
  }

  if (!args.selectedTests || args.selectedTests.length === 0) {
    issues.push('Tests are required');
  }

  if (!args.testMetadata) {
    issues.push('Test metadata is required');
  } else if (args.selectedTests) {
    for (const test of args.selectedTests) {
      const meta = args.testMetadata[test.code];
      if (!meta) {
        issues.push(`Missing metadata for ${formatTestCoding(test)}`);
      } else {
        const q = meta.aoeQuestionnaire;
        if (q) {
          const missing = getMissingRequiredQuestionnaireItems(
            q,
            meta.aoeResponses,
            Boolean(args.specimenCollectedDateTime)
          );
          if (missing.length > 0) {
            issues.push(`Missing required AOE responses for ${formatTestCoding(test)}: ${missing.join(', ')}`);
          }
        }
      }
    }
  }

  if (!args.billingInformation?.billTo) {
    issues.push('BillingInformation.billTo is required');
  } else if (!isBillTo(args.billingInformation.billTo)) {
    issues.push('BillingInformation.billTo is invalid');
  } else if (args.billingInformation.billTo === 'insurance') {
    const coverageCount = args.billingInformation.patientCoverage?.length ?? 0;
    if (coverageCount < 1 || coverageCount > 3) {
      issues.push('BillingInformation.patientCoverage must contain 1-3 Coverage resources when billing to insurance');
    }
  }

  if (issues.length === 0) {
    return;
  }

  throw new LabOrderValidationError(issues);
}

export class LabOrderValidationError extends Error {
  constructor(readonly issues: string[]) {
    super('Lab order validation errors: ' + issues.join(', '));
  }
}

type PopulatedBundleEntry = NonNullable<Bundle['entry']> &
  {
    fullUrl: string;
    resource: Resource;
    request: { method: 'POST'; url: ResourceType };
  }[];

/**
 * Prepares a Bundle containing the resources necessary to create a `ServiceRequest` representing
 * a Health Gorilla lab order.
 * @param inputs - An object containing the required fields for creating a lab order bundle
 * @returns A transaction `Bundle` containing the resources necessary to create
 * a `ServiceRequest` representing the Health Gorilla lab order.
 */
export function createLabOrderBundle(inputs: PartialLabOrderInputs): Bundle {
  validateLabOrderInputs(inputs);
  inputs satisfies LabOrderInputs;

  const {
    patient,
    requester,
    performingLab,
    performingLabAccountNumber,
    selectedTests,
    testMetadata,
    diagnoses,
    specimenCollectedDateTime,
    billingInformation,
    orderNotes,
  } = inputs;

  const bundle: Bundle = {
    resourceType: 'Bundle',
    type: 'transaction',
  };

  const labOrderTempId = tempId();
  const labOrderExtension: Extension[] = [];
  const bundleEntry: PopulatedBundleEntry = [];

  const subjectReference = isReference(patient) ? patient : createReference(patient);
  const requesterReference = isReference(requester) ? requester : createReference(requester);
  const performerReference = createReference(performingLab);

  const testEntries: PopulatedBundleEntry = [];
  for (const test of selectedTests) {
    const metadata = testMetadata[test.code];

    let qr: QuestionnaireResponse | undefined;
    if (metadata.aoeResponses) {
      qr = deepClone(metadata.aoeResponses);
      qr.id = tempId();
      bundleEntry.push({
        fullUrl: qr.id,
        resource: qr,
        request: { method: 'POST', url: 'QuestionnaireResponse' },
      });
    }

    const testSR: ServiceRequest = {
      resourceType: 'ServiceRequest',
      id: tempId(),
      status: 'draft',
      intent: 'order',
      basedOn: [{ reference: labOrderTempId }],
      subject: subjectReference,
      requester: requesterReference,
      performer: [performerReference],
      category: [{ coding: [{ system: SNOMED, code: '103693007', display: 'Diagnostic procedure' }] }],
      code: { coding: [test] },
      priority: metadata.priority,
      note: metadata.notes
        ? [{ authorReference: requesterReference, time: new Date().toISOString(), text: metadata.notes }]
        : undefined,
      supportingInfo: qr ? [{ reference: qr.id }] : undefined,
    };

    testEntries.push({
      fullUrl: testSR.id,
      resource: testSR,
      request: { method: 'POST', url: 'ServiceRequest' },
    });
  }

  let specimen: Specimen | undefined;
  if (specimenCollectedDateTime) {
    specimen = {
      resourceType: 'Specimen',
      id: tempId(),
      subject: subjectReference,
      collection: { collectedDateTime: specimenCollectedDateTime.toISOString() },
    };
    bundleEntry.push({
      fullUrl: specimen.id,
      resource: specimen,
      request: { method: 'POST', url: 'Specimen' },
    });
  }

  labOrderExtension.push({
    url: MEDPLUM_HEALTH_GORILLA_LAB_ORDER_EXTENSION_URL_BILL_TO,
    valueString: billingInformation.billTo,
  });

  if (performingLabAccountNumber) {
    labOrderExtension.push({
      url: MEDPLUM_HEALTH_GORILLA_LAB_ORDER_EXTENSION_URL_PERFORMING_LAB_AN,
      valueString: performingLabAccountNumber,
    });
  }

  let insurance: Reference<Coverage>[] | undefined;
  if (billingInformation.billTo === 'insurance') {
    insurance = (billingInformation.patientCoverage ?? []).map((coverage) => {
      return createReference(coverage);
    });
  }

  const labOrder: LabOrderServiceRequest = {
    resourceType: 'ServiceRequest',
    id: labOrderTempId,
    meta: { profile: [MEDPLUM_HEALTH_GORILLA_LAB_ORDER_PROFILE] },
    extension: labOrderExtension,
    status: 'draft',
    intent: 'order',
    subject: subjectReference,
    requester: requesterReference,
    performer: [performerReference],
    reasonCode: diagnoses,
    category: [{ coding: [{ system: SNOMED, code: '108252007', display: 'Laboratory procedure' }] }],
    // individual test codes are included in the ServcieRequest referenced in supporting Info.
    // TBD what should go in the `code` field of the lab order. Leaving the tests there for now
    // since code is required.
    code: { coding: selectedTests },
    insurance,
    specimen: specimen ? [{ reference: specimen.id }] : undefined,
    note: orderNotes
      ? [{ authorReference: requesterReference, time: new Date().toISOString(), text: orderNotes }]
      : undefined,
  };

  bundleEntry.push({
    fullUrl: labOrder.id,
    resource: labOrder,
    request: { method: 'POST', url: 'ServiceRequest' },
  });

  bundleEntry.push(...testEntries);

  // Remove resource.id to avoid breaking the transaction processing of the urn:uuid:<uuid> temp IDs.
  for (const entry of bundleEntry) {
    if (entry.resource) {
      delete entry.resource.id;
    }
  }

  bundle.entry = bundleEntry;

  return bundle;
}

export async function getCoverageFromLabOrder(
  medplum: MedplumClient,
  labOrder: LabOrderServiceRequest
): Promise<Coverage[]> {
  const coverageRefs = labOrder.insurance?.filter((ref) =>
    ref.reference?.startsWith('Coverage/')
  ) as Reference<Coverage>[];
  const coverages = await Promise.all(coverageRefs?.map((ref) => medplum.readReference(ref)) ?? []);

  return coverages;
}

function formatTestCoding(test: TestCoding): string {
  if (test.display) {
    return `${test.display}${test.code ? ' (' + test.code + ')' : ''}`;
  }

  return test.code ?? '';
}
