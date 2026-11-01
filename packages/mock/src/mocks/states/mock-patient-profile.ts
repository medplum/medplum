// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { StructureDefinition } from '@medplum/fhirtypes';
import definitions from '../structuredefinitions.json';

const patient = (definitions as StructureDefinition[]).find((sd) => sd.type === 'Patient') as StructureDefinition;

/** Demo profile: require a given name and birth date without adding other demographics. */
export const mockPatientProfile: StructureDefinition = {
  resourceType: 'StructureDefinition',
  url: 'https://example.com/StructureDefinition/mock-patient',
  name: 'MockPatient',
  status: 'draft',
  kind: 'resource',
  abstract: false,
  type: 'Patient',
  baseDefinition: 'http://hl7.org/fhir/StructureDefinition/Patient',
  derivation: 'constraint',
  snapshot: {
    element: (patient.snapshot?.element ?? []).flatMap((element) => {
      const entry = {
        ...element,
        base: element.base ?? { path: element.path, min: element.min ?? 0, max: element.max ?? '*' },
      };
      if (element.path === 'Patient.name') {
        return [
          { ...entry, min: 1 },
          {
            id: 'Patient.name.given',
            path: 'Patient.name.given',
            min: 1,
            max: '*',
            base: { path: 'HumanName.given', min: 0, max: '*' },
            type: [{ code: 'string' }],
          },
        ];
      }
      return [{ ...entry, min: element.path === 'Patient.birthDate' ? 1 : entry.min }];
    }),
  },
};
