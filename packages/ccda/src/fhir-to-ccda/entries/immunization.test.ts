// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { createReference } from '@medplum/core';
import {
  Bundle,
  Composition,
  Immunization,
  Organization,
  Patient,
  Practitioner,
  PractitionerRole,
} from '@medplum/fhirtypes';
import { OID_IMMUNIZATION_ACTIVITY } from '../../oids';
import { CcdaText } from '../../types';
import { FhirToCcdaConverter } from '../convert';
import { createImmunizationEntry, mapImmunizationPerformerToCcdaPerformer } from './immunization';

describe('immunization entry functions', () => {
  let converter: FhirToCcdaConverter;
  let bundle: Bundle;
  let patient: Patient;

  beforeEach(() => {
    patient = {
      id: 'patient-1',
      resourceType: 'Patient',
      name: [{ given: ['John'], family: 'Doe' }],
    };

    bundle = {
      resourceType: 'Bundle',
      type: 'document',
      entry: [
        { resource: patient },
        {
          resource: {
            id: 'composition-1',
            resourceType: 'Composition',
            status: 'final',
            type: { text: 'test' },
            date: new Date().toISOString(),
            author: [{ display: 'test' }],
            title: 'test',
            subject: createReference(patient),
            section: [],
          } as Composition,
        },
      ],
    };

    converter = new FhirToCcdaConverter(bundle);
  });

  describe('createImmunizationEntry', () => {
    test('should create basic immunization entry', () => {
      const immunization: Immunization = {
        id: 'immunization-1',
        resourceType: 'Immunization',
        status: 'completed',
        patient: createReference(patient),
        vaccineCode: {
          coding: [
            {
              system: 'http://hl7.org/fhir/sid/cvx',
              code: '03',
              display: 'MMR',
            },
          ],
        },
        occurrenceDateTime: '2024-01-01T10:00:00Z',
        identifier: [{ value: 'imm-123' }],
      };

      const result = createImmunizationEntry(converter, immunization);

      expect(result).toBeDefined();
      expect(result.substanceAdministration).toBeDefined();
      expect(result.substanceAdministration?.length).toBe(1);

      const substanceAdmin = result.substanceAdministration?.[0];
      expect(substanceAdmin?.['@_classCode']).toBe('SBADM');
      expect(substanceAdmin?.['@_moodCode']).toBe('EVN');
      expect(substanceAdmin?.['@_negationInd']).toBe('false');
      expect(substanceAdmin?.templateId).toEqual([
        { '@_root': OID_IMMUNIZATION_ACTIVITY },
        { '@_root': OID_IMMUNIZATION_ACTIVITY, '@_extension': '2015-08-01' },
      ]);
      expect(substanceAdmin?.id).toBeDefined();
      expect(substanceAdmin?.statusCode?.['@_code']).toBe('completed');
      expect(substanceAdmin?.effectiveTime?.[0]?.['@_value']).toBe('20240101');
      expect(substanceAdmin?.consumable).toBeDefined();
    });

    test('should handle immunization with manufacturer', () => {
      const manufacturer = { display: 'Pfizer Inc.' };
      const immunization: Immunization = {
        id: 'immunization-1',
        resourceType: 'Immunization',
        status: 'completed',
        patient: createReference(patient),
        vaccineCode: {
          coding: [
            {
              system: 'http://hl7.org/fhir/sid/cvx',
              code: '03',
              display: 'MMR',
            },
          ],
        },
        occurrenceDateTime: '2024-01-01T10:00:00Z',
        manufacturer,
        lotNumber: 'LOT123',
      };

      const result = createImmunizationEntry(converter, immunization);

      expect(result).toBeDefined();
      const substanceAdmin = result.substanceAdministration?.[0];
      expect(substanceAdmin?.consumable?.manufacturedProduct?.[0]?.manufacturerOrganization).toBeDefined();
      expect(substanceAdmin?.consumable?.manufacturedProduct?.[0]?.manufacturerOrganization?.[0]?.name?.[0]).toBe(
        'Pfizer Inc.'
      );
      expect(substanceAdmin?.consumable?.manufacturedProduct?.[0]?.manufacturedMaterial?.[0]?.lotNumberText?.[0]).toBe(
        'LOT123'
      );
    });

    test('should handle immunization with manufacturer with id and identifier', () => {
      const manufacturer = {
        id: 'manufacturer-1',
        identifier: { value: 'mfg-123' },
        display: 'Pfizer Inc.',
      };
      const immunization: Immunization = {
        id: 'immunization-1',
        resourceType: 'Immunization',
        status: 'completed',
        patient: createReference(patient),
        vaccineCode: {
          coding: [
            {
              system: 'http://hl7.org/fhir/sid/cvx',
              code: '03',
              display: 'MMR',
            },
          ],
        },
        occurrenceDateTime: '2024-01-01T10:00:00Z',
        manufacturer,
      };

      const result = createImmunizationEntry(converter, immunization);

      expect(result).toBeDefined();
      const substanceAdmin = result.substanceAdministration?.[0];
      expect(substanceAdmin?.consumable?.manufacturedProduct?.[0]?.manufacturerOrganization).toBeDefined();
      expect(substanceAdmin?.consumable?.manufacturedProduct?.[0]?.manufacturerOrganization?.[0]?.id).toBeDefined();
    });

    test('should handle immunization without manufacturer', () => {
      const immunization: Immunization = {
        id: 'immunization-1',
        resourceType: 'Immunization',
        status: 'completed',
        patient: createReference(patient),
        vaccineCode: {
          coding: [
            {
              system: 'http://hl7.org/fhir/sid/cvx',
              code: '03',
              display: 'MMR',
            },
          ],
        },
        occurrenceDateTime: '2024-01-01T10:00:00Z',
      };

      const result = createImmunizationEntry(converter, immunization);

      expect(result).toBeDefined();
      const substanceAdmin = result.substanceAdministration?.[0];
      expect(substanceAdmin?.consumable?.manufacturedProduct?.[0]?.manufacturerOrganization).toBeUndefined();
    });

    test('should handle immunization without lot number', () => {
      const immunization: Immunization = {
        id: 'immunization-1',
        resourceType: 'Immunization',
        status: 'completed',
        patient: createReference(patient),
        vaccineCode: {
          coding: [
            {
              system: 'http://hl7.org/fhir/sid/cvx',
              code: '03',
              display: 'MMR',
            },
          ],
        },
        occurrenceDateTime: '2024-01-01T10:00:00Z',
      };

      const result = createImmunizationEntry(converter, immunization);

      expect(result).toBeDefined();
      const substanceAdmin = result.substanceAdministration?.[0];
      expect(
        substanceAdmin?.consumable?.manufacturedProduct?.[0]?.manufacturedMaterial?.[0]?.lotNumberText
      ).toBeUndefined();
    });

    test('should handle immunization with extension for text reference', () => {
      const immunization: Immunization = {
        id: 'immunization-1',
        resourceType: 'Immunization',
        status: 'completed',
        patient: createReference(patient),
        vaccineCode: {
          coding: [
            {
              system: 'http://hl7.org/fhir/sid/cvx',
              code: '03',
              display: 'MMR',
            },
          ],
        },
        occurrenceDateTime: '2024-01-01T10:00:00Z',
        extension: [
          {
            url: 'https://medplum.com/fhir/StructureDefinition/ccda-narrative-reference',
            valueString: '#immunization-narrative',
          },
        ],
      };

      const result = createImmunizationEntry(converter, immunization);

      expect(result).toBeDefined();
      const substanceAdmin = result.substanceAdministration?.[0];
      expect((substanceAdmin?.text as CcdaText).reference?.['@_value']).toBe('#immunization-narrative');
    });

    test('should handle immunization with performer', () => {
      const practitioner: Practitioner = {
        id: 'practitioner-1',
        resourceType: 'Practitioner',
        name: [{ given: ['Jane'], family: 'Smith' }],
        identifier: [{ value: 'pract-123' }],
        address: [
          {
            line: ['123 Main St'],
            city: 'Anytown',
            state: 'CA',
            postalCode: '12345',
          },
        ],
        telecom: [{ system: 'phone', value: '555-0123' }],
      };

      bundle.entry?.push({ resource: practitioner });

      const immunization: Immunization = {
        id: 'immunization-1',
        resourceType: 'Immunization',
        status: 'completed',
        patient: createReference(patient),
        vaccineCode: {
          coding: [
            {
              system: 'http://hl7.org/fhir/sid/cvx',
              code: '03',
              display: 'MMR',
            },
          ],
        },
        occurrenceDateTime: '2024-01-01T10:00:00Z',
        performer: [
          {
            actor: createReference(practitioner),
          },
        ],
      };

      const result = createImmunizationEntry(converter, immunization);

      expect(result).toBeDefined();
      const substanceAdmin = result.substanceAdministration?.[0];
      expect(substanceAdmin?.performer).toBeDefined();
      expect(substanceAdmin?.performer?.length).toBe(1);
      expect(substanceAdmin?.performer?.[0]?.assignedEntity?.assignedPerson).toBeDefined();
    });

    test('should handle immunization with organization performer', () => {
      const organization: Organization = {
        id: 'org-1',
        resourceType: 'Organization',
        name: 'Test Clinic',
        identifier: [{ value: 'org-123' }],
        address: [
          {
            line: ['456 Clinic St'],
            city: 'Medical City',
            state: 'NY',
            postalCode: '67890',
          },
        ],
        telecom: [{ system: 'phone', value: '555-0456' }],
      };

      bundle.entry?.push({ resource: organization });

      const immunization: Immunization = {
        id: 'immunization-1',
        resourceType: 'Immunization',
        status: 'completed',
        patient: createReference(patient),
        vaccineCode: {
          coding: [
            {
              system: 'http://hl7.org/fhir/sid/cvx',
              code: '03',
              display: 'MMR',
            },
          ],
        },
        occurrenceDateTime: '2024-01-01T10:00:00Z',
        performer: [
          {
            actor: createReference(organization),
          },
        ],
      };

      const result = createImmunizationEntry(converter, immunization);

      expect(result).toBeDefined();
      const substanceAdmin = result.substanceAdministration?.[0];
      expect(substanceAdmin?.performer).toBeDefined();
      expect(substanceAdmin?.performer?.length).toBe(1);
      expect(substanceAdmin?.performer?.[0]?.assignedEntity?.representedOrganization).toBeDefined();
      expect(substanceAdmin?.performer?.[0]?.assignedEntity?.assignedPerson).toBeUndefined();
    });

    test('should handle immunization with practitioner role performer', () => {
      const practitioner: Practitioner = {
        id: 'practitioner-1',
        resourceType: 'Practitioner',
        name: [{ given: ['Jane'], family: 'Smith' }],
        identifier: [{ value: 'pract-123' }],
        address: [
          {
            line: ['123 Main St'],
            city: 'Anytown',
            state: 'CA',
            postalCode: '12345',
          },
        ],
      };

      const organization: Organization = {
        id: 'org-1',
        resourceType: 'Organization',
        name: 'Test Clinic',
        identifier: [{ value: 'org-123' }],
        address: [
          {
            line: ['456 Clinic St'],
            city: 'Medical City',
            state: 'NY',
            postalCode: '67890',
          },
        ],
        telecom: [{ system: 'phone', value: '555-0456' }],
      };

      const practitionerRole: PractitionerRole = {
        id: 'role-1',
        resourceType: 'PractitionerRole',
        practitioner: createReference(practitioner),
        organization: createReference(organization),
        identifier: [{ value: 'role-123' }],
        telecom: [{ system: 'phone', value: '555-0789' }],
      };

      bundle.entry?.push({ resource: practitioner }, { resource: organization }, { resource: practitionerRole });

      const immunization: Immunization = {
        id: 'immunization-1',
        resourceType: 'Immunization',
        status: 'completed',
        patient: createReference(patient),
        vaccineCode: {
          coding: [
            {
              system: 'http://hl7.org/fhir/sid/cvx',
              code: '03',
              display: 'MMR',
            },
          ],
        },
        occurrenceDateTime: '2024-01-01T10:00:00Z',
        performer: [
          {
            actor: createReference(practitionerRole),
          },
        ],
      };

      const result = createImmunizationEntry(converter, immunization);

      expect(result).toBeDefined();
      const substanceAdmin = result.substanceAdministration?.[0];
      expect(substanceAdmin?.performer).toBeDefined();
      expect(substanceAdmin?.performer?.length).toBe(1);
      expect(substanceAdmin?.performer?.[0]?.assignedEntity?.assignedPerson).toBeDefined();
      expect(substanceAdmin?.performer?.[0]?.assignedEntity?.representedOrganization).toBeDefined();
    });

    test('should filter out invalid performers', () => {
      const immunization: Immunization = {
        id: 'immunization-1',
        resourceType: 'Immunization',
        status: 'completed',
        patient: createReference(patient),
        vaccineCode: {
          coding: [
            {
              system: 'http://hl7.org/fhir/sid/cvx',
              code: '03',
              display: 'MMR',
            },
          ],
        },
        occurrenceDateTime: '2024-01-01T10:00:00Z',
        performer: [
          {
            actor: { reference: 'Practitioner/nonexistent' },
          },
          undefined as any, // Invalid performer
        ],
      };

      const result = createImmunizationEntry(converter, immunization);

      expect(result).toBeDefined();
      const substanceAdmin = result.substanceAdministration?.[0];
      expect(substanceAdmin?.performer).toBeDefined();
      expect(substanceAdmin?.performer?.length).toBe(0);
    });

    test('should handle various immunization statuses', () => {
      const immunization: Immunization = {
        id: 'immunization-1',
        resourceType: 'Immunization',
        status: 'not-done',
        patient: createReference(patient),
        vaccineCode: {
          coding: [
            {
              system: 'http://hl7.org/fhir/sid/cvx',
              code: '03',
              display: 'MMR',
            },
          ],
        },
        occurrenceDateTime: '2024-01-01T10:00:00Z',
      };

      const result = createImmunizationEntry(converter, immunization);

      expect(result).toBeDefined();
      const substanceAdmin = result.substanceAdministration?.[0];
      // Status mapper should handle non-standard statuses
      expect(substanceAdmin?.statusCode?.['@_code']).toBeDefined();
    });
  });

  describe('mapImmunizationPerformerToCcdaPerformer', () => {
    test('should return undefined for undefined performer', () => {
      const result = mapImmunizationPerformerToCcdaPerformer(converter, undefined);

      expect(result).toBeUndefined();
    });

    test('should return undefined for performer with invalid reference', () => {
      const performer = {
        actor: { reference: 'Practitioner/nonexistent' },
      };

      const result = mapImmunizationPerformerToCcdaPerformer(converter, performer);

      expect(result).toBeUndefined();
    });

    test('should map practitioner performer', () => {
      const practitioner: Practitioner = {
        id: 'practitioner-1',
        resourceType: 'Practitioner',
        name: [{ given: ['Jane'], family: 'Smith' }],
        identifier: [{ value: 'pract-123' }],
        address: [
          {
            line: ['123 Main St'],
            city: 'Anytown',
            state: 'CA',
            postalCode: '12345',
          },
        ],
        telecom: [{ system: 'phone', value: '555-0123' }],
      };

      bundle.entry?.push({ resource: practitioner });

      const performer = {
        actor: createReference(practitioner),
      };

      const result = mapImmunizationPerformerToCcdaPerformer(converter, performer);

      expect(result).toBeDefined();
      expect(result?.assignedEntity?.assignedPerson).toBeDefined();
      expect(result?.assignedEntity?.representedOrganization).toBeUndefined();
      expect(result?.assignedEntity?.addr).toBeDefined();
      expect(result?.assignedEntity?.telecom).toBeDefined();
    });

    test('should map organization performer', () => {
      const organization: Organization = {
        id: 'org-1',
        resourceType: 'Organization',
        name: 'Test Clinic',
        identifier: [{ value: 'org-123' }],
        address: [
          {
            line: ['456 Clinic St'],
            city: 'Medical City',
            state: 'NY',
            postalCode: '67890',
          },
        ],
        telecom: [{ system: 'phone', value: '555-0456' }],
      };

      bundle.entry?.push({ resource: organization });

      const performer = {
        actor: createReference(organization),
      };

      const result = mapImmunizationPerformerToCcdaPerformer(converter, performer);

      expect(result).toBeDefined();
      expect(result?.assignedEntity?.assignedPerson).toBeUndefined();
      expect(result?.assignedEntity?.representedOrganization).toBeDefined();
      expect(result?.assignedEntity?.representedOrganization?.name?.[0]).toBe('Test Clinic');
    });

    test('should map practitioner role performer', () => {
      const practitioner: Practitioner = {
        id: 'practitioner-1',
        resourceType: 'Practitioner',
        name: [{ given: ['Jane'], family: 'Smith' }],
        identifier: [{ value: 'pract-123' }],
        address: [
          {
            line: ['123 Main St'],
            city: 'Anytown',
            state: 'CA',
            postalCode: '12345',
          },
        ],
      };

      const organization: Organization = {
        id: 'org-1',
        resourceType: 'Organization',
        name: 'Test Clinic',
        identifier: [{ value: 'org-123' }],
        address: [
          {
            line: ['456 Clinic St'],
            city: 'Medical City',
            state: 'NY',
            postalCode: '67890',
          },
        ],
        telecom: [{ system: 'phone', value: '555-0456' }],
      };

      const practitionerRole: PractitionerRole = {
        id: 'role-1',
        resourceType: 'PractitionerRole',
        practitioner: createReference(practitioner),
        organization: createReference(organization),
        identifier: [{ value: 'role-123' }],
        telecom: [{ system: 'phone', value: '555-0789' }],
      };

      bundle.entry?.push({ resource: practitioner }, { resource: organization }, { resource: practitionerRole });

      const performer = {
        actor: createReference(practitionerRole),
      };

      const result = mapImmunizationPerformerToCcdaPerformer(converter, performer);

      expect(result).toBeDefined();
      expect(result?.assignedEntity?.assignedPerson).toBeDefined();
      expect(result?.assignedEntity?.representedOrganization).toBeDefined();
      expect(result?.assignedEntity?.addr).toBeDefined();
      expect(result?.assignedEntity?.telecom).toBeDefined();
    });

    test('should handle organization without name', () => {
      const organization: Organization = {
        id: 'org-1',
        resourceType: 'Organization',
        identifier: [{ value: 'org-123' }],
      };

      bundle.entry?.push({ resource: organization });

      const performer = {
        actor: createReference(organization),
      };

      const result = mapImmunizationPerformerToCcdaPerformer(converter, performer);

      expect(result).toBeDefined();
      expect(result?.assignedEntity?.representedOrganization?.name).toBeUndefined();
    });

    test('should handle unknown resource type performer', () => {
      // Create a Patient as an example of unsupported resource type
      const unknownResource = {
        id: 'unknown-1',
        resourceType: 'Patient', // Unsupported type for performer
        name: [{ given: ['Test'], family: 'Patient' }],
      };

      bundle.entry?.push({ resource: unknownResource as any });

      const performer = {
        actor: { reference: 'Patient/unknown-1' },
      };

      const result = mapImmunizationPerformerToCcdaPerformer(converter, performer);

      expect(result).toBeDefined();
      expect(result?.assignedEntity?.assignedPerson).toBeUndefined();
      expect(result?.assignedEntity?.representedOrganization).toBeUndefined();
    });
  });
});
