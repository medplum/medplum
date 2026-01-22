// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient, WithId } from '@medplum/core';
import { createReference } from '@medplum/core';
import type { Coverage, Patient } from '@medplum/fhirtypes';

/**
 * Creates a self-pay coverage for a patient
 * @param medplum - Medplum client instance
 * @param patient - The patient resource
 * @returns Promise with the created Coverage resource
 */
export async function createSelfPayCoverage(medplum: MedplumClient, patient: WithId<Patient>): Promise<Coverage> {
  return medplum.createResource({
    resourceType: 'Coverage',
    status: 'active',
    type: {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
          code: 'SELFPAY',
          display: 'Self Pay',
        },
      ],
      text: 'Self Pay',
    },
    subscriber: createReference(patient),
    beneficiary: createReference(patient),
    payor: [createReference(patient)],
    period: {
      start: new Date().toISOString(),
    },
  });
}
