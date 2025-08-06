// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MedplumClient } from '@medplum/core';
import { Coverage } from '@medplum/fhirtypes';

/**
 * Creates a self-pay coverage for a patient
 * @param medplum - Medplum client instance
 * @param patientId - ID of the patient
 * @returns Promise with the created Coverage resource
 */
export async function createSelfPayCoverage(medplum: MedplumClient, patientId: string): Promise<Coverage> {
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
    subscriber: { reference: `Patient/${patientId}` },
    beneficiary: { reference: `Patient/${patientId}` },
    payor: [{ reference: `Patient/${patientId}` }],
    period: {
      start: new Date().toISOString(),
    },
  });
}
