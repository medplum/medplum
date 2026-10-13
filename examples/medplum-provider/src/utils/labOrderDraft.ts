// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient } from '@medplum/core';
import { getExtensionValue, isReference } from '@medplum/core';
import type { Organization, Patient, Practitioner, Reference, ServiceRequest, Specimen } from '@medplum/fhirtypes';
import type {
  BillTo,
  DiagnosisCodeableConcept,
  LabOrderTestMetadata,
  LabOrganization,
  TestCoding,
} from '@medplum/health-gorilla-core';
import {
  isBillTo,
  MEDPLUM_HEALTH_GORILLA_LAB_ORDER_EXTENSION_URL_BILL_TO,
  MEDPLUM_HEALTH_GORILLA_LAB_ORDER_EXTENSION_URL_PERFORMING_LAB_AN,
} from '@medplum/health-gorilla-core';

/**
 * The values needed to pre-fill the lab order form from an existing draft lab order.
 */
export interface LabOrderDraftDefaults {
  patient?: Patient;
  requester?: Practitioner;
  performingLab?: LabOrganization;
  performingLabAccountNumber?: string;
  tests: TestCoding[];
  testMetadata: Record<string, Pick<LabOrderTestMetadata, 'priority' | 'notes'>>;
  diagnoses: DiagnosisCodeableConcept[];
  billTo?: BillTo;
  orderNotes?: string;
  specimenCollectedDateTime?: Date;
}

/**
 * Reads the resources referenced by a draft lab order so the order form can be re-populated with it.
 *
 * A lab order is a top-level `ServiceRequest` (holding the selected tests, diagnoses, billing and notes)
 * plus one child `ServiceRequest` per test (holding that test's priority and notes).
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

  const [patient, requester, performingLab, specimen, childRequests] = await Promise.all([
    subjectRef ? medplum.readReference(subjectRef) : undefined,
    requesterRef ? medplum.readReference(requesterRef) : undefined,
    performerRef ? medplum.readReference(performerRef) : undefined,
    specimenRef ? medplum.readReference(specimenRef) : undefined,
    order.id ? medplum.searchResources('ServiceRequest', { 'based-on': `ServiceRequest/${order.id}` }) : [],
  ]);

  const tests = (order.code?.coding ?? []).filter((coding): coding is TestCoding => !!coding.code);

  const testMetadata: LabOrderDraftDefaults['testMetadata'] = {};
  for (const child of childRequests) {
    const code = child.code?.coding?.[0]?.code;
    if (code) {
      testMetadata[code] = { priority: child.priority, notes: child.note?.[0]?.text };
    }
  }

  const billTo = getExtensionValue(order, MEDPLUM_HEALTH_GORILLA_LAB_ORDER_EXTENSION_URL_BILL_TO);
  const performingLabAccountNumber = getExtensionValue(
    order,
    MEDPLUM_HEALTH_GORILLA_LAB_ORDER_EXTENSION_URL_PERFORMING_LAB_AN
  );
  const collectedDateTime = specimen?.collection?.collectedDateTime;

  return {
    patient,
    requester,
    performingLab,
    performingLabAccountNumber: typeof performingLabAccountNumber === 'string' ? performingLabAccountNumber : undefined,
    tests,
    testMetadata,
    diagnoses: (order.reasonCode ?? []).filter(
      (concept): concept is DiagnosisCodeableConcept => !!concept.coding?.[0]?.system && !!concept.coding?.[0]?.code
    ),
    billTo: isBillTo(billTo) ? billTo : undefined,
    orderNotes: order.note?.[0]?.text,
    specimenCollectedDateTime: collectedDateTime ? new Date(collectedDateTime) : undefined,
  };
}
