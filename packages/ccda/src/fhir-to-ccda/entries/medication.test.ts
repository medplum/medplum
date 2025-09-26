// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { createReference } from '@medplum/core';
import { Bundle, Composition, Medication, MedicationRequest, Patient } from '@medplum/fhirtypes';
import { OID_LOINC_CODE_SYSTEM, OID_MEDICATION_ACTIVITY, OID_MEDICATION_FREE_TEXT_SIG } from '../../oids';
import { LOINC_MEDICATION_INSTRUCTIONS } from '../../systems';
import { CcdaText } from '../../types';
import { FhirToCcdaConverter } from '../convert';
import { createMedicationEntry } from './medication';

describe('medication entry functions', () => {
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

  describe('createMedicationEntry', () => {
    test('should create basic medication entry', () => {
      const medicationRequest: MedicationRequest = {
        id: 'medication-request-1',
        resourceType: 'MedicationRequest',
        status: 'active',
        intent: 'order',
        subject: createReference(patient),
        medicationCodeableConcept: {
          coding: [
            {
              system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
              code: '197696',
              display: 'Aspirin 325 mg oral tablet',
            },
          ],
        },
        authoredOn: '2024-01-01T10:00:00Z',
      };

      const result = createMedicationEntry(converter, medicationRequest);

      expect(result).toBeDefined();
      expect(result.substanceAdministration).toBeDefined();
      expect(result.substanceAdministration?.length).toBe(1);

      const substanceAdmin = result.substanceAdministration?.[0];
      expect(substanceAdmin?.['@_classCode']).toBe('SBADM');
      expect(substanceAdmin?.['@_moodCode']).toBe('EVN');
      expect(substanceAdmin?.templateId).toEqual([
        { '@_root': OID_MEDICATION_ACTIVITY, '@_extension': '2014-06-09' },
        { '@_root': OID_MEDICATION_ACTIVITY },
      ]);
      expect(substanceAdmin?.id).toBeDefined();
      expect(substanceAdmin?.statusCode?.['@_code']).toBe('active');
      expect(substanceAdmin?.consumable).toBeDefined();
    });

    test('should handle medication with contained medication resource', () => {
      const medication: Medication = {
        id: 'med-1',
        resourceType: 'Medication',
        code: {
          coding: [
            {
              system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
              code: '197696',
              display: 'Aspirin 325 mg oral tablet',
            },
          ],
        },
        manufacturer: {
          display: 'Bayer',
        },
        extension: [
          {
            url: 'https://medplum.com/fhir/StructureDefinition/ccda-narrative-reference',
            valueString: '#medication-text',
          },
        ],
      };

      const medicationRequest: MedicationRequest = {
        id: 'medication-request-1',
        resourceType: 'MedicationRequest',
        status: 'active',
        intent: 'order',
        subject: createReference(patient),
        contained: [medication],
        authoredOn: '2024-01-01T10:00:00Z',
      };

      const result = createMedicationEntry(converter, medicationRequest);

      expect(result).toBeDefined();
      const substanceAdmin = result.substanceAdministration?.[0];
      expect(substanceAdmin?.consumable?.manufacturedProduct?.[0]?.manufacturedMaterial?.[0]?.code?.[0]).toBeDefined();
      expect(
        substanceAdmin?.consumable?.manufacturedProduct?.[0]?.manufacturedMaterial?.[0]?.code?.[0]?.originalText
          ?.reference?.['@_value']
      ).toBe('#medication-text');
      expect(substanceAdmin?.consumable?.manufacturedProduct?.[0]?.manufacturerOrganization).toBeDefined();
      expect(substanceAdmin?.consumable?.manufacturedProduct?.[0]?.manufacturerOrganization?.[0]?.name?.[0]).toBe(
        'Bayer'
      );
    });

    test('should handle medication with manufacturer with id and identifier', () => {
      const medication: Medication = {
        id: 'med-1',
        resourceType: 'Medication',
        code: {
          coding: [
            {
              system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
              code: '197696',
              display: 'Aspirin 325 mg oral tablet',
            },
          ],
        },
        manufacturer: {
          id: 'manufacturer-1',
          identifier: { value: 'mfg-123' },
          display: 'Bayer',
        },
      };

      const medicationRequest: MedicationRequest = {
        id: 'medication-request-1',
        resourceType: 'MedicationRequest',
        status: 'active',
        intent: 'order',
        subject: createReference(patient),
        contained: [medication],
        authoredOn: '2024-01-01T10:00:00Z',
      };

      const result = createMedicationEntry(converter, medicationRequest);

      expect(result).toBeDefined();
      const substanceAdmin = result.substanceAdministration?.[0];
      expect(substanceAdmin?.consumable?.manufacturedProduct?.[0]?.manufacturerOrganization?.[0]?.id).toBeDefined();
    });

    test('should handle medication without manufacturer', () => {
      const medicationRequest: MedicationRequest = {
        id: 'medication-request-1',
        resourceType: 'MedicationRequest',
        status: 'active',
        intent: 'order',
        subject: createReference(patient),
        medicationCodeableConcept: {
          coding: [
            {
              system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
              code: '197696',
              display: 'Aspirin 325 mg oral tablet',
            },
          ],
        },
        authoredOn: '2024-01-01T10:00:00Z',
      };

      const result = createMedicationEntry(converter, medicationRequest);

      expect(result).toBeDefined();
      const substanceAdmin = result.substanceAdministration?.[0];
      expect(substanceAdmin?.consumable?.manufacturedProduct?.[0]?.manufacturerOrganization).toBeUndefined();
    });

    test('should handle medication with dispense validity period', () => {
      const medicationRequest: MedicationRequest = {
        id: 'medication-request-1',
        resourceType: 'MedicationRequest',
        status: 'active',
        intent: 'order',
        subject: createReference(patient),
        medicationCodeableConcept: {
          coding: [
            {
              system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
              code: '197696',
              display: 'Aspirin 325 mg oral tablet',
            },
          ],
        },
        dispenseRequest: {
          validityPeriod: {
            start: '2024-01-01',
            end: '2024-12-31',
          },
        },
        authoredOn: '2024-01-01T10:00:00Z',
      };

      const result = createMedicationEntry(converter, medicationRequest);

      expect(result).toBeDefined();
      const substanceAdmin = result.substanceAdministration?.[0];
      expect(substanceAdmin?.effectiveTime).toBeDefined();
      expect(substanceAdmin?.effectiveTime?.length).toBeGreaterThan(0);
    });

    test('should handle medication with dosage timing', () => {
      const medicationRequest: MedicationRequest = {
        id: 'medication-request-1',
        resourceType: 'MedicationRequest',
        status: 'active',
        intent: 'order',
        subject: createReference(patient),
        medicationCodeableConcept: {
          coding: [
            {
              system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
              code: '197696',
              display: 'Aspirin 325 mg oral tablet',
            },
          ],
        },
        dosageInstruction: [
          {
            timing: {
              repeat: {
                period: 24,
                periodUnit: 'h',
              },
            },
          },
        ],
        authoredOn: '2024-01-01T10:00:00Z',
      };

      const result = createMedicationEntry(converter, medicationRequest);

      expect(result).toBeDefined();
      const substanceAdmin = result.substanceAdministration?.[0];
      expect(substanceAdmin?.effectiveTime).toBeDefined();
      expect(substanceAdmin?.effectiveTime?.length).toBe(1);
      expect(substanceAdmin?.effectiveTime?.[0]?.['@_xsi:type']).toBe('PIVL_TS');
      expect(substanceAdmin?.effectiveTime?.[0]?.period?.['@_value']).toBe('24');
      expect(substanceAdmin?.effectiveTime?.[0]?.period?.['@_unit']).toBe('h');
    });

    test('should handle medication with route', () => {
      const medicationRequest: MedicationRequest = {
        id: 'medication-request-1',
        resourceType: 'MedicationRequest',
        status: 'active',
        intent: 'order',
        subject: createReference(patient),
        medicationCodeableConcept: {
          coding: [
            {
              system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
              code: '197696',
              display: 'Aspirin 325 mg oral tablet',
            },
          ],
        },
        dosageInstruction: [
          {
            route: {
              coding: [
                {
                  system: 'http://snomed.info/sct',
                  code: '26643006',
                  display: 'Oral route',
                },
              ],
            },
          },
        ],
        authoredOn: '2024-01-01T10:00:00Z',
      };

      const result = createMedicationEntry(converter, medicationRequest);

      expect(result).toBeDefined();
      const substanceAdmin = result.substanceAdministration?.[0];
      expect(substanceAdmin?.routeCode).toBeDefined();
      expect(substanceAdmin?.routeCode?.['@_code']).toBe('26643006');
    });

    test('should handle medication without route', () => {
      const medicationRequest: MedicationRequest = {
        id: 'medication-request-1',
        resourceType: 'MedicationRequest',
        status: 'active',
        intent: 'order',
        subject: createReference(patient),
        medicationCodeableConcept: {
          coding: [
            {
              system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
              code: '197696',
              display: 'Aspirin 325 mg oral tablet',
            },
          ],
        },
        dosageInstruction: [
          {
            // No route specified
          },
        ],
        authoredOn: '2024-01-01T10:00:00Z',
      };

      const result = createMedicationEntry(converter, medicationRequest);

      expect(result).toBeDefined();
      const substanceAdmin = result.substanceAdministration?.[0];
      expect(substanceAdmin?.routeCode).toBeUndefined();
    });

    test('should handle medication with dose quantity', () => {
      const medicationRequest: MedicationRequest = {
        id: 'medication-request-1',
        resourceType: 'MedicationRequest',
        status: 'active',
        intent: 'order',
        subject: createReference(patient),
        medicationCodeableConcept: {
          coding: [
            {
              system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
              code: '197696',
              display: 'Aspirin 325 mg oral tablet',
            },
          ],
        },
        dosageInstruction: [
          {
            doseAndRate: [
              {
                doseQuantity: {
                  value: 325,
                  unit: 'mg',
                },
              },
            ],
          },
        ],
        authoredOn: '2024-01-01T10:00:00Z',
      };

      const result = createMedicationEntry(converter, medicationRequest);

      expect(result).toBeDefined();
      const substanceAdmin = result.substanceAdministration?.[0];
      expect(substanceAdmin?.doseQuantity).toBeDefined();
      expect(substanceAdmin?.doseQuantity?.['@_value']).toBe('325');
      expect(substanceAdmin?.doseQuantity?.['@_unit']).toBe('mg');
    });

    test('should handle medication without dose quantity', () => {
      const medicationRequest: MedicationRequest = {
        id: 'medication-request-1',
        resourceType: 'MedicationRequest',
        status: 'active',
        intent: 'order',
        subject: createReference(patient),
        medicationCodeableConcept: {
          coding: [
            {
              system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
              code: '197696',
              display: 'Aspirin 325 mg oral tablet',
            },
          ],
        },
        dosageInstruction: [
          {
            doseAndRate: [
              {
                // No doseQuantity
              },
            ],
          },
        ],
        authoredOn: '2024-01-01T10:00:00Z',
      };

      const result = createMedicationEntry(converter, medicationRequest);

      expect(result).toBeDefined();
      const substanceAdmin = result.substanceAdministration?.[0];
      expect(substanceAdmin?.doseQuantity).toBeUndefined();
    });

    test('should handle medication without doseAndRate', () => {
      const medicationRequest: MedicationRequest = {
        id: 'medication-request-1',
        resourceType: 'MedicationRequest',
        status: 'active',
        intent: 'order',
        subject: createReference(patient),
        medicationCodeableConcept: {
          coding: [
            {
              system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
              code: '197696',
              display: 'Aspirin 325 mg oral tablet',
            },
          ],
        },
        dosageInstruction: [
          {
            // No doseAndRate
          },
        ],
        authoredOn: '2024-01-01T10:00:00Z',
      };

      const result = createMedicationEntry(converter, medicationRequest);

      expect(result).toBeDefined();
      const substanceAdmin = result.substanceAdministration?.[0];
      expect(substanceAdmin?.doseQuantity).toBeUndefined();
    });

    test('should handle medication with extension for text reference', () => {
      const medicationRequest: MedicationRequest = {
        id: 'medication-request-1',
        resourceType: 'MedicationRequest',
        status: 'active',
        intent: 'order',
        subject: createReference(patient),
        medicationCodeableConcept: {
          coding: [
            {
              system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
              code: '197696',
              display: 'Aspirin 325 mg oral tablet',
            },
          ],
        },
        extension: [
          {
            url: 'https://medplum.com/fhir/StructureDefinition/ccda-narrative-reference',
            valueString: '#medication-narrative',
          },
        ],
        authoredOn: '2024-01-01T10:00:00Z',
      };

      const result = createMedicationEntry(converter, medicationRequest);

      expect(result).toBeDefined();
      const substanceAdmin = result.substanceAdministration?.[0];
      expect((substanceAdmin?.text as CcdaText).reference?.['@_value']).toBe('#medication-narrative');
    });

    test('should handle medication with requester', () => {
      const medicationRequest: MedicationRequest = {
        id: 'medication-request-1',
        resourceType: 'MedicationRequest',
        status: 'active',
        intent: 'order',
        subject: createReference(patient),
        medicationCodeableConcept: {
          coding: [
            {
              system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
              code: '197696',
              display: 'Aspirin 325 mg oral tablet',
            },
          ],
        },
        requester: { display: 'Dr. Smith' },
        authoredOn: '2024-01-01T10:00:00Z',
      };

      const result = createMedicationEntry(converter, medicationRequest);

      expect(result).toBeDefined();
      const substanceAdmin = result.substanceAdministration?.[0];
      // Note: mapAuthor may return undefined for display-only requesters
      expect(substanceAdmin?.author).toBeUndefined();
    });

    test('should handle medication with dosage instruction extensions', () => {
      const medicationRequest: MedicationRequest = {
        id: 'medication-request-1',
        resourceType: 'MedicationRequest',
        status: 'active',
        intent: 'order',
        subject: createReference(patient),
        medicationCodeableConcept: {
          coding: [
            {
              system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
              code: '197696',
              display: 'Aspirin 325 mg oral tablet',
            },
          ],
        },
        dosageInstruction: [
          {
            extension: [
              {
                url: 'https://medplum.com/fhir/StructureDefinition/ccda-narrative-reference',
                valueString: '#dosage-instruction-1',
              },
            ],
          },
          {
            extension: [
              {
                url: 'https://medplum.com/fhir/StructureDefinition/ccda-narrative-reference',
                valueString: '#dosage-instruction-2',
              },
            ],
          },
          {
            // No extensions - should be filtered out
          },
        ],
        authoredOn: '2024-01-01T10:00:00Z',
      };

      const result = createMedicationEntry(converter, medicationRequest);

      expect(result).toBeDefined();
      const substanceAdmin = result.substanceAdministration?.[0];
      expect(substanceAdmin?.entryRelationship).toBeDefined();
      expect(substanceAdmin?.entryRelationship?.length).toBe(2);

      const firstInstruction = substanceAdmin?.entryRelationship?.[0];
      expect(firstInstruction?.['@_typeCode']).toBe('COMP');
      expect(firstInstruction?.substanceAdministration?.[0]?.templateId).toEqual([
        { '@_root': OID_MEDICATION_FREE_TEXT_SIG },
      ]);
      expect(firstInstruction?.substanceAdministration?.[0]?.code).toEqual({
        '@_code': LOINC_MEDICATION_INSTRUCTIONS,
        '@_codeSystem': OID_LOINC_CODE_SYSTEM,
        '@_codeSystemName': 'LOINC',
        '@_displayName': 'Medication Instructions',
      });
      expect((firstInstruction?.substanceAdministration?.[0]?.text as CcdaText).reference?.['@_value']).toBe(
        '#dosage-instruction-1'
      );
      expect(
        firstInstruction?.substanceAdministration?.[0]?.consumable?.manufacturedProduct?.[0]
          ?.manufacturedLabeledDrug?.[0]?.['@_nullFlavor']
      ).toBe('NA');
    });

    test('should handle medication without id', () => {
      const medicationRequest: MedicationRequest = {
        resourceType: 'MedicationRequest',
        status: 'active',
        intent: 'order',
        subject: createReference(patient),
        medicationCodeableConcept: {
          coding: [
            {
              system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
              code: '197696',
              display: 'Aspirin 325 mg oral tablet',
            },
          ],
        },
        authoredOn: '2024-01-01T10:00:00Z',
      };

      const result = createMedicationEntry(converter, medicationRequest);

      expect(result).toBeDefined();
      const substanceAdmin = result.substanceAdministration?.[0];
      expect(substanceAdmin?.id).toBeDefined();
      expect(substanceAdmin?.id?.length).toBe(1);
      expect(substanceAdmin?.id?.[0]?.['@_root']).toBeDefined();
    });

    test('should handle various medication statuses', () => {
      const medicationRequest: MedicationRequest = {
        id: 'medication-request-1',
        resourceType: 'MedicationRequest',
        status: 'stopped',
        intent: 'order',
        subject: createReference(patient),
        medicationCodeableConcept: {
          coding: [
            {
              system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
              code: '197696',
              display: 'Aspirin 325 mg oral tablet',
            },
          ],
        },
        authoredOn: '2024-01-01T10:00:00Z',
      };

      const result = createMedicationEntry(converter, medicationRequest);

      expect(result).toBeDefined();
      const substanceAdmin = result.substanceAdministration?.[0];
      // Status mapper should handle the mapping
      expect(substanceAdmin?.statusCode?.['@_code']).toBeDefined();
    });
  });
});
