// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Bundle } from '@medplum/fhirtypes';

/**
 * This bundle demonstrates the FHIR upsert pattern using conditional PUT operations.
 *
 * For Patients: Using family and given name as search parameters
 * For other resources: Using unique identifiers to ensure proper upsert behavior
 *
 * The PUT method with search parameters allows the server to:
 * 1. Update the resource if it exists (matching the search criteria)
 * 2. Create a new resource if no match is found
 *
 * This approach prevents duplicate resources when the bundle is uploaded multiple times.
 */

export const RESOURCES_BUNDLE: Bundle = {
  resourceType: 'Bundle',
  type: 'transaction',
  entry: [
    // Patient A
    {
      request: {
        method: 'PUT',
        url: 'Patient?family=A&given=Patient',
      },
      resource: {
        resourceType: 'Patient',
        name: [{ family: 'A', given: ['Patient'], use: 'official' }],
        gender: 'female',
        birthDate: '1980-07-15',
      },
    },
    // Patient B
    {
      request: {
        method: 'PUT',
        url: 'Patient?family=B&given=Patient',
      },
      resource: {
        resourceType: 'Patient',
        name: [{ family: 'B', given: ['Patient'], use: 'official' }],
        gender: 'male',
        birthDate: '1975-03-22',
      },
    },
    // Patient C
    {
      request: {
        method: 'PUT',
        url: 'Patient?family=C&given=Patient',
      },
      resource: {
        resourceType: 'Patient',
        name: [{ family: 'C', given: ['Patient'], use: 'official' }],
        gender: 'male',
        birthDate: '1990-11-05',
      },
    },
    // Observation A
    {
      request: {
        method: 'PUT',
        url: 'Observation?identifier=observation-patient-a',
      },
      resource: {
        resourceType: 'Observation',
        identifier: [
          {
            system: 'https://example.org/identifiers',
            value: 'observation-patient-a',
          },
        ],
        status: 'final',
        code: {
          text: 'Observation about Patient A',
        },
        subject: { reference: `Patient?family=A` },
        valueString: 'Normal findings for Patient A',
      },
    },
    // Observation B
    {
      request: {
        method: 'PUT',
        url: 'Observation?identifier=observation-patient-b',
      },
      resource: {
        resourceType: 'Observation',
        identifier: [
          {
            system: 'https://example.org/identifiers',
            value: 'observation-patient-b',
          },
        ],
        status: 'final',
        code: {
          text: 'Observation about Patient B',
        },
        subject: { reference: `Patient?family=B` },
        valueString: 'Normal findings for Patient B',
      },
    },
    // Observation C
    {
      request: {
        method: 'PUT',
        url: 'Observation?identifier=observation-patient-c',
      },
      resource: {
        resourceType: 'Observation',
        identifier: [
          {
            system: 'https://example.org/identifiers',
            value: 'observation-patient-c',
          },
        ],
        status: 'final',
        code: {
          text: 'Observation about Patient C',
        },
        subject: { reference: `Patient?family=C` },
        valueString: 'Normal findings for Patient C',
      },
    },
    // Diagnostic Report A
    {
      request: {
        method: 'PUT',
        url: 'DiagnosticReport?identifier=diagnostic-report-patient-a',
      },
      resource: {
        resourceType: 'DiagnosticReport',
        identifier: [
          {
            system: 'https://example.org/identifiers',
            value: 'diagnostic-report-patient-a',
          },
        ],
        status: 'final',
        code: {
          text: 'Diagnostic Report for Patient A',
        },
        subject: { reference: `Patient?family=A` },
        conclusion: 'All tests normal for Patient A',
      },
    },
    // Diagnostic Report B
    {
      request: {
        method: 'PUT',
        url: 'DiagnosticReport?identifier=diagnostic-report-patient-b',
      },
      resource: {
        resourceType: 'DiagnosticReport',
        identifier: [
          {
            system: 'https://example.org/identifiers',
            value: 'diagnostic-report-patient-b',
          },
        ],
        status: 'final',
        code: {
          text: 'Diagnostic Report for Patient B',
        },
        subject: { reference: `Patient?family=B` },
        conclusion: 'All tests normal for Patient B',
      },
    },
    // Diagnostic Report C
    {
      request: {
        method: 'PUT',
        url: 'DiagnosticReport?identifier=diagnostic-report-patient-c',
      },
      resource: {
        resourceType: 'DiagnosticReport',
        identifier: [
          {
            system: 'https://example.org/identifiers',
            value: 'diagnostic-report-patient-c',
          },
        ],
        status: 'final',
        code: {
          text: 'Diagnostic Report for Patient C',
        },
        subject: { reference: `Patient?family=C` },
        conclusion: 'All tests normal for Patient C',
      },
    },
    // Encounter A
    {
      request: {
        method: 'PUT',
        url: 'Encounter?identifier=encounter-patient-a',
      },
      resource: {
        resourceType: 'Encounter',
        identifier: [
          {
            system: 'https://example.org/identifiers',
            value: 'encounter-patient-a',
          },
        ],
        status: 'finished',
        class: {
          system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
          code: 'AMB',
          display: 'ambulatory',
        },
        subject: { reference: `Patient?family=A` },
        reasonCode: [{ text: 'Encounter for Patient A' }],
      },
    },
    // Encounter B
    {
      request: {
        method: 'PUT',
        url: 'Encounter?identifier=encounter-patient-b',
      },
      resource: {
        resourceType: 'Encounter',
        identifier: [
          {
            system: 'https://example.org/identifiers',
            value: 'encounter-patient-b',
          },
        ],
        status: 'finished',
        class: {
          system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
          code: 'AMB',
          display: 'ambulatory',
        },
        subject: { reference: `Patient?family=B` },
        reasonCode: [{ text: 'Encounter for Patient B' }],
      },
    },
    // Encounter C
    {
      request: {
        method: 'PUT',
        url: 'Encounter?identifier=encounter-patient-c',
      },
      resource: {
        resourceType: 'Encounter',
        identifier: [
          {
            system: 'https://example.org/identifiers',
            value: 'encounter-patient-c',
          },
        ],
        status: 'finished',
        class: {
          system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
          code: 'AMB',
          display: 'ambulatory',
        },
        subject: { reference: `Patient?family=C` },
        reasonCode: [{ text: 'Encounter for Patient C' }],
      },
    },
    // Communication A
    {
      request: {
        method: 'PUT',
        url: 'Communication?identifier=communication-patient-a',
      },
      resource: {
        resourceType: 'Communication',
        identifier: [
          {
            system: 'https://example.org/identifiers',
            value: 'communication-patient-a',
          },
        ],
        status: 'completed',
        subject: { reference: `Patient?family=A` },
        payload: [{ contentString: 'Communication for Patient A' }],
      },
    },
    // Communication B
    {
      request: {
        method: 'PUT',
        url: 'Communication?identifier=communication-patient-b',
      },
      resource: {
        resourceType: 'Communication',
        identifier: [
          {
            system: 'https://example.org/identifiers',
            value: 'communication-patient-b',
          },
        ],
        status: 'completed',
        subject: { reference: `Patient?family=B` },
        payload: [{ contentString: 'Communication for Patient B' }],
      },
    },
    // Communication C
    {
      request: {
        method: 'PUT',
        url: 'Communication?identifier=communication-patient-c',
      },
      resource: {
        resourceType: 'Communication',
        identifier: [
          {
            system: 'https://example.org/identifiers',
            value: 'communication-patient-c',
          },
        ],
        status: 'completed',
        subject: { reference: `Patient?family=C` },
        payload: [{ contentString: 'Communication for Patient C' }],
      },
    },
  ],
};
