// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type {
  Coding,
  Patient,
  Questionnaire,
  QuestionnaireResponse,
  QuestionnaireResponseItemAnswer,
  Reference,
  Organization,
} from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { describe, expect, test, beforeEach, vi } from 'vitest';
import {
  addAllergy,
  addCondition,
  addConsent,
  addCoverage,
  addExtension,
  addFamilyMemberHistory,
  addImmunization,
  addLanguage,
  addMedication,
  addPharmacy,
  convertDateToDateTime,
  findQuestionnaireItem,
  getGroupRepeatedAnswers,
  getHumanName,
  getPatientAddress,
  observationCategoryMapping,
  observationCodeMapping,
  upsertObservation,
} from './intake-utils';

describe('intake utils', () => {
  let medplum: MockClient;
  let patient: Patient;

  beforeEach(() => {
    medplum = new MockClient();
    patient = { resourceType: 'Patient', id: 'patient-1' };
  });

  describe('addExtension', () => {
    test('adds coded extension with sub extension text', () => {
      const answer: QuestionnaireResponseItemAnswer = {
        valueCoding: { system: 'http://example.com', code: 'code', display: 'Display' },
      };

      addExtension(patient, 'http://example.com/ext', 'valueCoding', answer, 'ombCategory');

      expect(patient.extension).toEqual([
        {
          url: 'http://example.com/ext',
          extension: [
            {
              url: 'ombCategory',
              valueCoding: { system: 'http://example.com', code: 'code', display: 'Display' },
            },
            {
              url: 'text',
              valueString: 'Display',
            },
          ],
        },
      ]);
    });

    test('adds boolean extension and interprets undefined as false', () => {
      addExtension(patient, 'http://example.com/bool', 'valueBoolean', {});

      expect(patient.extension).toEqual([
        expect.objectContaining({
          url: 'http://example.com/bool',
          valueBoolean: false,
        }),
      ]);
    });

    test('adds extension without sub extension', () => {
      const answer: QuestionnaireResponseItemAnswer = {
        valueCoding: { system: 'http://example.com', code: 'code' },
      };

      addExtension(patient, 'http://example.com/ext', 'valueCoding', answer);

      expect(patient.extension).toEqual([
        {
          url: 'http://example.com/ext',
          valueCoding: { system: 'http://example.com', code: 'code' },
        },
      ]);
    });

    test('adds extension with sub extension but no display text when display is missing', () => {
      const answer: QuestionnaireResponseItemAnswer = {
        valueCoding: { system: 'http://example.com', code: 'code' },
      };

      addExtension(patient, 'http://example.com/ext', 'valueCoding', answer, 'ombCategory');

      expect(patient.extension).toEqual([
        {
          url: 'http://example.com/ext',
          extension: [
            {
              url: 'ombCategory',
              valueCoding: { system: 'http://example.com', code: 'code' },
            },
          ],
        },
      ]);
    });

    test('returns early when value is undefined', () => {
      const initialExtensions = patient.extension;
      addExtension(patient, 'http://example.com/ext', 'valueCoding', undefined);
      expect(patient.extension).toBe(initialExtensions);
    });

    test('adds boolean extension with true value', () => {
      addExtension(patient, 'http://example.com/bool', 'valueBoolean', { valueBoolean: true });
      expect(patient.extension).toEqual([
        expect.objectContaining({
          url: 'http://example.com/bool',
          valueBoolean: true,
        }),
      ]);
    });
  });

  describe('addLanguage', () => {
    test('adds and updates preferred language', () => {
      const coding: Coding = { system: 'urn:ietf:bcp:47', code: 'en', display: 'English' };

      addLanguage(patient, coding);
      addLanguage(patient, coding, true);

      expect(patient.communication).toHaveLength(1);
      expect(patient.communication?.[0].preferred).toBe(true);
    });

    test('returns early when coding is undefined', () => {
      const initialCommunication = patient.communication;
      addLanguage(patient, undefined);
      expect(patient.communication).toBe(initialCommunication);
    });

    test('adds new language when not present', () => {
      const coding: Coding = { system: 'urn:ietf:bcp:47', code: 'es', display: 'Spanish' };
      addLanguage(patient, coding);
      expect(patient.communication).toHaveLength(1);
      expect(patient.communication?.[0].language.coding?.[0].code).toBe('es');
    });

    test('sets preferred flag on existing language', () => {
      const coding: Coding = { system: 'urn:ietf:bcp:47', code: 'en', display: 'English' };
      patient.communication = [
        {
          language: {
            coding: [{ system: 'urn:ietf:bcp:47', code: 'en', display: 'English' }],
          },
        },
      ];
      addLanguage(patient, coding, true);
      expect(patient.communication?.[0].preferred).toBe(true);
    });
  });

  describe('questionnaire helpers', () => {
    test('getHumanName builds full name', () => {
      const answers: Record<string, QuestionnaireResponseItemAnswer> = {
        'first-name': { valueString: 'Ada' },
        'middle-name': { valueString: 'M.' },
        'last-name': { valueString: 'Lovelace' },
      };
      expect(getHumanName(answers)).toEqual({ given: ['Ada', 'M.'], family: 'Lovelace' });
    });

    test('getHumanName builds name with prefix', () => {
      const answers: Record<string, QuestionnaireResponseItemAnswer> = {
        'related-person-first-name': { valueString: 'John' },
        'related-person-last-name': { valueString: 'Doe' },
      };
      expect(getHumanName(answers, 'related-person-')).toEqual({ given: ['John'], family: 'Doe' });
    });

    test('getHumanName returns undefined when no name fields present', () => {
      const answers: Record<string, QuestionnaireResponseItemAnswer> = {};
      expect(getHumanName(answers)).toBeUndefined();
    });

    test('getHumanName builds name with only first name', () => {
      const answers: Record<string, QuestionnaireResponseItemAnswer> = {
        'first-name': { valueString: 'Ada' },
      };
      expect(getHumanName(answers)).toEqual({ given: ['Ada'] });
    });

    test('getHumanName builds name with only last name', () => {
      const answers: Record<string, QuestionnaireResponseItemAnswer> = {
        'last-name': { valueString: 'Lovelace' },
      };
      expect(getHumanName(answers)).toEqual({ family: 'Lovelace' });
    });

    test('getPatientAddress builds address', () => {
      const answers: Record<string, QuestionnaireResponseItemAnswer> = {
        street: { valueString: '1 Main St' },
        city: { valueString: 'Springfield' },
        state: { valueCoding: { code: 'CA' } },
        zip: { valueString: '12345' },
      };
      expect(getPatientAddress(answers)).toEqual(
        expect.objectContaining({ city: 'Springfield', state: 'CA', postalCode: '12345', use: 'home' })
      );
    });

    test('getPatientAddress returns undefined when no address fields present', () => {
      const answers: Record<string, QuestionnaireResponseItemAnswer> = {};
      expect(getPatientAddress(answers)).toBeUndefined();
    });

    test('getPatientAddress builds partial address', () => {
      const answers: Record<string, QuestionnaireResponseItemAnswer> = {
        city: { valueString: 'Springfield' },
      };
      expect(getPatientAddress(answers)).toEqual(
        expect.objectContaining({ city: 'Springfield', use: 'home', type: 'physical' })
      );
    });

    test('findQuestionnaireItem finds nested item', () => {
      const questionnaire: Questionnaire = {
        resourceType: 'Questionnaire',
        item: [
          {
            linkId: 'group',
            type: 'group',
            item: [{ linkId: 'nested', type: 'string' }],
          },
        ],
        status: 'active',
      };
      const result = findQuestionnaireItem(questionnaire.item, 'nested');
      expect(result?.linkId).toBe('nested');
    });

    test('getGroupRepeatedAnswers flattens repeating groups', () => {
      const questionnaire: Questionnaire = {
        status: 'active',
        resourceType: 'Questionnaire',
        item: [{ linkId: 'allergies', type: 'group', item: [{ linkId: 'allergy-substance', type: 'string' }] }],
      };
      const response: QuestionnaireResponse = {
        status: 'completed',
        resourceType: 'QuestionnaireResponse',
        item: [
          {
            linkId: 'allergies',
            item: [{ linkId: 'allergy-substance', answer: [{ valueString: 'Peanuts' }] }],
          },
          {
            linkId: 'allergies',
            item: [{ linkId: 'allergy-substance', answer: [{ valueString: 'Shellfish' }] }],
          },
        ],
      };

      const answers = getGroupRepeatedAnswers(questionnaire, response, 'allergies');
      expect(answers).toEqual([
        { 'allergy-substance': { valueString: 'Peanuts' } },
        { 'allergy-substance': { valueString: 'Shellfish' } },
      ]);
    });

    test('getGroupRepeatedAnswers returns empty array when no response groups found', () => {
      const questionnaire: Questionnaire = {
        status: 'active',
        resourceType: 'Questionnaire',
        item: [{ linkId: 'allergies', type: 'group', item: [{ linkId: 'allergy-substance', type: 'string' }] }],
      };
      const response: QuestionnaireResponse = {
        status: 'completed',
        resourceType: 'QuestionnaireResponse',
        item: [],
      };

      // When no response items match the groupLinkId, returns empty array
      const answers = getGroupRepeatedAnswers(questionnaire, response, 'allergies');
      expect(answers).toEqual([]);
    });

    test('getGroupRepeatedAnswers returns empty array when questionnaire item is not a group', () => {
      const questionnaire: Questionnaire = {
        status: 'active',
        resourceType: 'Questionnaire',
        item: [{ linkId: 'allergies', type: 'string' }],
      };
      const response: QuestionnaireResponse = {
        status: 'completed',
        resourceType: 'QuestionnaireResponse',
        item: [{ linkId: 'allergies' }],
      };

      const answers = getGroupRepeatedAnswers(questionnaire, response, 'allergies');
      expect(answers).toEqual([]);
    });

    test('getGroupRepeatedAnswers handles nested subgroups', () => {
      const questionnaire: Questionnaire = {
        status: 'active',
        resourceType: 'Questionnaire',
        item: [
          {
            linkId: 'group',
            type: 'group',
            item: [
              { linkId: 'field1', type: 'string' },
              {
                linkId: 'subgroup',
                type: 'group',
                item: [{ linkId: 'subfield1', type: 'string' }],
              },
            ],
          },
        ],
      };
      const response: QuestionnaireResponse = {
        status: 'completed',
        resourceType: 'QuestionnaireResponse',
        item: [
          {
            linkId: 'group',
            item: [
              { linkId: 'field1', answer: [{ valueString: 'value1' }] },
              {
                linkId: 'subgroup',
                item: [{ linkId: 'subfield1', answer: [{ valueString: 'subvalue1' }] }],
              },
            ],
          },
        ],
      };

      const answers = getGroupRepeatedAnswers(questionnaire, response, 'group');
      expect(answers).toEqual([
        {
          field1: { valueString: 'value1' },
          subgroup: { subfield1: { valueString: 'subvalue1' } },
        },
      ]);
    });

    test('findQuestionnaireItem returns undefined when item not found', () => {
      const questionnaire: Questionnaire = {
        resourceType: 'Questionnaire',
        item: [{ linkId: 'other', type: 'string' }],
        status: 'active',
      };
      const result = findQuestionnaireItem(questionnaire.item, 'not-found');
      expect(result).toBeUndefined();
    });

    test('findQuestionnaireItem returns undefined when items is undefined', () => {
      const result = findQuestionnaireItem(undefined, 'any');
      expect(result).toBeUndefined();
    });

    test('findQuestionnaireItem handles undefined currentItem in reduce', () => {
      const questionnaire: Questionnaire = {
        resourceType: 'Questionnaire',
        item: [undefined as any, { linkId: 'found', type: 'string' }],
        status: 'active',
      };
      const result = findQuestionnaireItem(questionnaire.item, 'found');
      expect(result?.linkId).toBe('found');
    });
  });

  describe('convertDateToDateTime', () => {
    test('converts date to ISO string', () => {
      expect(convertDateToDateTime('2020-01-01')).toContain('2020-01-01T00:00:00');
      expect(convertDateToDateTime(undefined)).toBeUndefined();
    });
  });

  describe('upsertObservation', () => {
    test('upserts codeable concept observation', async () => {
      const upsertSpy = vi.spyOn(medplum, 'upsertResource').mockResolvedValue({} as any);
      await upsertObservation(
        medplum,
        patient,
        observationCodeMapping.smokingStatus,
        observationCategoryMapping.socialHistory,
        'valueCodeableConcept',
        { valueCoding: { system: 'http://example.com', code: 'never' } }
      );
      expect(upsertSpy).toHaveBeenCalled();
    });

    test('skips when no value provided', async () => {
      const upsertSpy = vi.spyOn(medplum, 'upsertResource');
      await upsertObservation(
        medplum,
        patient,
        observationCodeMapping.smokingStatus,
        observationCategoryMapping.socialHistory,
        'valueCodeableConcept',
        undefined
      );
      expect(upsertSpy).not.toHaveBeenCalled();
    });

    test('skips when no code provided', async () => {
      const upsertSpy = vi.spyOn(medplum, 'upsertResource');
      // The function checks for !value || !code early, but if code is provided without coding,
      // it will try to access coding[0] which causes an error
      // So we test with undefined code to trigger the early return
      await upsertObservation(
        medplum as any,
        patient,
        undefined as any,
        observationCategoryMapping.socialHistory,
        'valueCodeableConcept',
        { valueCoding: { system: 'http://example.com', code: 'never' } }
      );
      expect(upsertSpy).not.toHaveBeenCalled();
    });

    test('upserts dateTime observation', async () => {
      const upsertSpy = vi.spyOn(medplum, 'upsertResource').mockResolvedValue({} as any);
      await upsertObservation(
        medplum as any,
        patient,
        observationCodeMapping.estimatedDeliveryDate,
        observationCategoryMapping.socialHistory,
        'valueDateTime',
        { valueDateTime: '2024-12-31T00:00:00Z' }
      );
      expect(upsertSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          valueDateTime: '2024-12-31T00:00:00Z',
        }),
        expect.any(Object)
      );
    });

    test('adds profile URL when provided', async () => {
      const upsertSpy = vi.spyOn(medplum, 'upsertResource').mockResolvedValue({} as any);
      await upsertObservation(
        medplum as any,
        patient,
        observationCodeMapping.smokingStatus,
        observationCategoryMapping.socialHistory,
        'valueCodeableConcept',
        { valueCoding: { system: 'http://example.com', code: 'never' } },
        'http://example.com/profile'
      );
      expect(upsertSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          meta: expect.objectContaining({
            profile: ['http://example.com/profile'],
          }),
        }),
        expect.any(Object)
      );
    });
  });

  describe('resource helpers', () => {
    test('addAllergy returns early without substance', async () => {
      const upsertSpy = vi.spyOn(medplum, 'upsertResource');
      await addAllergy(medplum, patient, {});
      expect(upsertSpy).not.toHaveBeenCalled();
    });

    test('addAllergy upserts when code present', async () => {
      const upsertSpy = vi.spyOn(medplum, 'upsertResource').mockResolvedValue({} as any);
      await addAllergy(medplum, patient, {
        'allergy-substance': { valueCoding: { system: 'http://example.com', code: 'peanut' } },
      });
      expect(upsertSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          resourceType: 'AllergyIntolerance',
        }),
        expect.objectContaining({
          patient: `Patient/${patient.id}`,
        })
      );
    });

    test('addAllergy includes reaction when provided', async () => {
      const upsertSpy = vi.spyOn(medplum, 'upsertResource').mockResolvedValue({} as any);
      await addAllergy(medplum as any, patient, {
        'allergy-substance': { valueCoding: { system: 'http://example.com', code: 'peanut' } },
        'allergy-reaction': { valueString: 'Hives' },
      });
      expect(upsertSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          reaction: [{ manifestation: [{ text: 'Hives' }] }],
        }),
        expect.any(Object)
      );
    });

    test('addAllergy includes onsetDateTime when provided', async () => {
      const upsertSpy = vi.spyOn(medplum, 'upsertResource').mockResolvedValue({} as any);
      await addAllergy(medplum as any, patient, {
        'allergy-substance': { valueCoding: { system: 'http://example.com', code: 'peanut' } },
        'allergy-onset': { valueDateTime: '2020-01-01T00:00:00Z' },
      });
      expect(upsertSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          onsetDateTime: '2020-01-01T00:00:00Z',
        }),
        expect.any(Object)
      );
    });

    test('addCoverage upserts coverage resource', async () => {
      const upsertSpy = vi.spyOn(medplum, 'upsertResource').mockResolvedValue({} as any);
      const answers: Record<string, QuestionnaireResponseItemAnswer> = {
        'insurance-provider': { valueReference: { reference: 'Organization/org-1' } as Reference<Organization> },
        'subscriber-id': { valueString: 'sub-1' },
        'relationship-to-subscriber': { valueCoding: { code: 'self' } },
      };

      await addCoverage(medplum, patient, answers);

      expect(upsertSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          resourceType: 'Coverage',
          beneficiary: expect.objectContaining({ reference: `Patient/${patient.id}` }),
        }),
        expect.objectContaining({
          beneficiary: `Patient/${patient.id}`,
        })
      );
    });

    test('addConsent creates resource with provided scope', async () => {
      const createSpy = vi.spyOn(medplum, 'createResource').mockResolvedValue({} as any);
      await addConsent(
        medplum,
        patient,
        true,
        observationCategoryMapping.socialHistory,
        observationCategoryMapping.sdoh,
        undefined,
        '2020-01-01'
      );
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          resourceType: 'Consent',
          patient: expect.objectContaining({ reference: `Patient/${patient.id}` }),
          status: 'active',
          dateTime: '2020-01-01',
        })
      );
    });

    test('addConsent creates resource with rejected status when consentGiven is false', async () => {
      const createSpy = vi.spyOn(medplum, 'createResource').mockResolvedValue({} as any);
      await addConsent(
        medplum as any,
        patient,
        false,
        observationCategoryMapping.socialHistory,
        observationCategoryMapping.sdoh,
        undefined,
        '2020-01-01'
      );
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'rejected',
        })
      );
    });

    test('addConsent includes policyRule when provided', async () => {
      const createSpy = vi.spyOn(medplum, 'createResource').mockResolvedValue({} as any);
      const policyRule = { coding: [{ code: 'hipaa-npp' }] };
      await addConsent(
        medplum as any,
        patient,
        true,
        observationCategoryMapping.socialHistory,
        observationCategoryMapping.sdoh,
        policyRule,
        '2020-01-01'
      );
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          policyRule: policyRule,
        })
      );
    });

    test('addMedication returns early without code', async () => {
      const upsertSpy = vi.spyOn(medplum, 'upsertResource');
      await addMedication(medplum as any, patient, {});
      expect(upsertSpy).not.toHaveBeenCalled();
    });

    test('addMedication upserts when code present', async () => {
      const upsertSpy = vi.spyOn(medplum, 'upsertResource').mockResolvedValue({} as any);
      await addMedication(medplum as any, patient, {
        'medication-code': { valueCoding: { system: 'http://example.com', code: 'aspirin' } },
      });
      expect(upsertSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          resourceType: 'MedicationRequest',
          status: 'active',
          intent: 'order',
        }),
        expect.any(Object)
      );
    });

    test('addMedication includes note when provided', async () => {
      const upsertSpy = vi.spyOn(medplum, 'upsertResource').mockResolvedValue({} as any);
      await addMedication(medplum as any, patient, {
        'medication-code': { valueCoding: { system: 'http://example.com', code: 'aspirin' } },
        'medication-note': { valueString: 'Take with food' },
      });
      expect(upsertSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          note: [{ text: 'Take with food' }],
        }),
        expect.any(Object)
      );
    });

    test('addCondition returns early without code', async () => {
      const upsertSpy = vi.spyOn(medplum, 'upsertResource');
      await addCondition(medplum as any, patient, {});
      expect(upsertSpy).not.toHaveBeenCalled();
    });

    test('addCondition upserts when code present', async () => {
      const upsertSpy = vi.spyOn(medplum, 'upsertResource').mockResolvedValue({} as any);
      await addCondition(medplum as any, patient, {
        'medical-history-problem': { valueCoding: { system: 'http://example.com', code: 'diabetes' } },
      });
      expect(upsertSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          resourceType: 'Condition',
        }),
        expect.any(Object)
      );
    });

    test('addCondition includes clinicalStatus when provided', async () => {
      const upsertSpy = vi.spyOn(medplum, 'upsertResource').mockResolvedValue({} as any);
      await addCondition(medplum as any, patient, {
        'medical-history-problem': { valueCoding: { system: 'http://example.com', code: 'diabetes' } },
        'medical-history-clinical-status': { valueCoding: { system: 'http://example.com', code: 'active' } },
      });
      expect(upsertSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          clinicalStatus: { coding: [{ system: 'http://example.com', code: 'active' }] },
        }),
        expect.any(Object)
      );
    });

    test('addCondition includes onsetDateTime when provided', async () => {
      const upsertSpy = vi.spyOn(medplum, 'upsertResource').mockResolvedValue({} as any);
      await addCondition(medplum as any, patient, {
        'medical-history-problem': { valueCoding: { system: 'http://example.com', code: 'diabetes' } },
        'medical-history-onset': { valueDateTime: '2020-01-01T00:00:00Z' },
      });
      expect(upsertSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          onsetDateTime: '2020-01-01T00:00:00Z',
        }),
        expect.any(Object)
      );
    });

    test('addFamilyMemberHistory returns early without condition or relationship', async () => {
      const upsertSpy = vi.spyOn(medplum, 'upsertResource');
      await addFamilyMemberHistory(medplum as any, patient, {
        'family-member-history-problem': { valueCoding: { system: 'http://example.com', code: 'diabetes' } },
      });
      expect(upsertSpy).not.toHaveBeenCalled();
    });

    test('addFamilyMemberHistory upserts when condition and relationship present', async () => {
      const upsertSpy = vi.spyOn(medplum, 'upsertResource').mockResolvedValue({} as any);
      await addFamilyMemberHistory(medplum as any, patient, {
        'family-member-history-problem': { valueCoding: { system: 'http://example.com', code: 'diabetes' } },
        'family-member-history-relationship': { valueCoding: { system: 'http://example.com', code: 'mother' } },
      });
      expect(upsertSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          resourceType: 'FamilyMemberHistory',
          status: 'completed',
        }),
        expect.any(Object)
      );
    });

    test('addFamilyMemberHistory includes deceasedBoolean when provided', async () => {
      const upsertSpy = vi.spyOn(medplum, 'upsertResource').mockResolvedValue({} as any);
      await addFamilyMemberHistory(medplum as any, patient, {
        'family-member-history-problem': { valueCoding: { system: 'http://example.com', code: 'diabetes' } },
        'family-member-history-relationship': { valueCoding: { system: 'http://example.com', code: 'mother' } },
        'family-member-history-deceased': { valueBoolean: true },
      });
      expect(upsertSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          deceasedBoolean: true,
        }),
        expect.any(Object)
      );
    });

    test('addImmunization returns early without code or date', async () => {
      const upsertSpy = vi.spyOn(medplum, 'upsertResource');
      await addImmunization(medplum as any, patient, {
        'immunization-vaccine': { valueCoding: { system: 'http://example.com', code: 'flu' } },
      });
      expect(upsertSpy).not.toHaveBeenCalled();
    });

    test('addImmunization upserts when code and date present', async () => {
      const upsertSpy = vi.spyOn(medplum, 'upsertResource').mockResolvedValue({} as any);
      await addImmunization(medplum as any, patient, {
        'immunization-vaccine': { valueCoding: { system: 'http://example.com', code: 'flu' } },
        'immunization-date': { valueDateTime: '2024-01-01T00:00:00Z' },
      });
      expect(upsertSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          resourceType: 'Immunization',
          status: 'completed',
        }),
        expect.any(Object)
      );
    });

    test('addPharmacy upserts CareTeam with pharmacy', async () => {
      const upsertSpy = vi.spyOn(medplum, 'upsertResource').mockResolvedValue({} as any);
      const pharmacy: Reference<Organization> = { reference: 'Organization/pharmacy-1' };
      await addPharmacy(medplum as any, patient, pharmacy);
      expect(upsertSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          resourceType: 'CareTeam',
          status: 'proposed',
          name: 'Patient Preferred Pharmacy',
        }),
        expect.objectContaining({
          name: 'Patient Preferred Pharmacy',
          subject: `Patient/${patient.id}`,
        })
      );
    });

    test('addCoverage creates RelatedPerson when relationship requires it', async () => {
      const createSpy = vi.spyOn(medplum, 'createResource').mockResolvedValue({} as any);
      const upsertSpy = vi.spyOn(medplum, 'upsertResource').mockResolvedValue({} as any);
      const answers: Record<string, QuestionnaireResponseItemAnswer> = {
        'insurance-provider': { valueReference: { reference: 'Organization/org-1' } as Reference<Organization> },
        'subscriber-id': { valueString: 'sub-1' },
        'relationship-to-subscriber': { valueCoding: { code: 'child', system: 'http://example.com' } },
        'related-person': {
          'related-person-first-name': { valueString: 'John' },
          'related-person-last-name': { valueString: 'Doe' },
        } as any,
      };

      await addCoverage(medplum as any, patient, answers);

      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          resourceType: 'RelatedPerson',
        })
      );
      expect(upsertSpy).toHaveBeenCalled();
    });

    test('addCoverage does not create RelatedPerson for self relationship', async () => {
      const createSpy = vi.spyOn(medplum, 'createResource');
      const upsertSpy = vi.spyOn(medplum, 'upsertResource').mockResolvedValue({} as any);
      const answers: Record<string, QuestionnaireResponseItemAnswer> = {
        'insurance-provider': { valueReference: { reference: 'Organization/org-1' } as Reference<Organization> },
        'subscriber-id': { valueString: 'sub-1' },
        'relationship-to-subscriber': { valueCoding: { code: 'self', system: 'http://example.com' } },
      };

      await addCoverage(medplum as any, patient, answers);

      expect(createSpy).not.toHaveBeenCalled();
      expect(upsertSpy).toHaveBeenCalled();
    });

    test('addCoverage does not create RelatedPerson for other relationship', async () => {
      const createSpy = vi.spyOn(medplum, 'createResource');
      const upsertSpy = vi.spyOn(medplum, 'upsertResource').mockResolvedValue({} as any);
      const answers: Record<string, QuestionnaireResponseItemAnswer> = {
        'insurance-provider': { valueReference: { reference: 'Organization/org-1' } as Reference<Organization> },
        'subscriber-id': { valueString: 'sub-1' },
        'relationship-to-subscriber': { valueCoding: { code: 'other', system: 'http://example.com' } },
      };

      await addCoverage(medplum as any, patient, answers);

      expect(createSpy).not.toHaveBeenCalled();
      expect(upsertSpy).toHaveBeenCalled();
    });

    test('addCoverage does not create RelatedPerson for injured relationship', async () => {
      const createSpy = vi.spyOn(medplum, 'createResource');
      const upsertSpy = vi.spyOn(medplum, 'upsertResource').mockResolvedValue({} as any);
      const answers: Record<string, QuestionnaireResponseItemAnswer> = {
        'insurance-provider': { valueReference: { reference: 'Organization/org-1' } as Reference<Organization> },
        'subscriber-id': { valueString: 'sub-1' },
        'relationship-to-subscriber': { valueCoding: { code: 'injured', system: 'http://example.com' } },
      };

      await addCoverage(medplum as any, patient, answers);

      expect(createSpy).not.toHaveBeenCalled();
      expect(upsertSpy).toHaveBeenCalled();
    });

    test('addCoverage does not create RelatedPerson when relationship code is missing', async () => {
      const createSpy = vi.spyOn(medplum, 'createResource');
      const upsertSpy = vi.spyOn(medplum, 'upsertResource').mockResolvedValue({} as any);
      const answers: Record<string, QuestionnaireResponseItemAnswer> = {
        'insurance-provider': { valueReference: { reference: 'Organization/org-1' } as Reference<Organization> },
        'subscriber-id': { valueString: 'sub-1' },
        'relationship-to-subscriber': { valueCoding: { system: 'http://example.com' } },
      };

      await addCoverage(medplum as any, patient, answers);

      expect(createSpy).not.toHaveBeenCalled();
      expect(upsertSpy).toHaveBeenCalled();
    });

    test('addCoverage does not create RelatedPerson when relatedPersonAnswers is missing', async () => {
      const createSpy = vi.spyOn(medplum, 'createResource');
      const upsertSpy = vi.spyOn(medplum, 'upsertResource').mockResolvedValue({} as any);
      const answers: Record<string, QuestionnaireResponseItemAnswer> = {
        'insurance-provider': { valueReference: { reference: 'Organization/org-1' } as Reference<Organization> },
        'subscriber-id': { valueString: 'sub-1' },
        'relationship-to-subscriber': { valueCoding: { code: 'child', system: 'http://example.com' } },
      };

      await addCoverage(medplum as any, patient, answers);

      expect(createSpy).not.toHaveBeenCalled();
      expect(upsertSpy).toHaveBeenCalled();
    });

    test('addCoverage creates RelatedPerson with birthDate and gender', async () => {
      const createSpy = vi.spyOn(medplum, 'createResource').mockResolvedValue({} as any);
      const upsertSpy = vi.spyOn(medplum, 'upsertResource').mockResolvedValue({} as any);
      const answers: Record<string, QuestionnaireResponseItemAnswer> = {
        'insurance-provider': { valueReference: { reference: 'Organization/org-1' } as Reference<Organization> },
        'subscriber-id': { valueString: 'sub-1' },
        'relationship-to-subscriber': { valueCoding: { code: 'parent', system: 'http://example.com' } },
        'related-person': {
          'related-person-first-name': { valueString: 'John' },
          'related-person-last-name': { valueString: 'Doe' },
          'related-person-dob': { valueDate: '1980-01-01' },
          'related-person-gender-identity': { valueCoding: { code: 'male', system: 'http://example.com' } },
        } as any,
      };

      await addCoverage(medplum as any, patient, answers);

      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          resourceType: 'RelatedPerson',
          birthDate: '1980-01-01',
          gender: 'male',
        })
      );
      expect(upsertSpy).toHaveBeenCalled();
    });

    test('addCoverage creates RelatedPerson with parent relationship', async () => {
      const createSpy = vi.spyOn(medplum, 'createResource').mockResolvedValue({} as any);
      const upsertSpy = vi.spyOn(medplum, 'upsertResource').mockResolvedValue({} as any);
      const answers: Record<string, QuestionnaireResponseItemAnswer> = {
        'insurance-provider': { valueReference: { reference: 'Organization/org-1' } as Reference<Organization> },
        'subscriber-id': { valueString: 'sub-1' },
        'relationship-to-subscriber': { valueCoding: { code: 'parent', system: 'http://example.com' } },
        'related-person': {
          'related-person-first-name': { valueString: 'John' },
          'related-person-last-name': { valueString: 'Doe' },
        } as any,
      };

      await addCoverage(medplum as any, patient, answers);

      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          resourceType: 'RelatedPerson',
          relationship: [
            {
              coding: [
                { system: 'http://terminology.hl7.org/CodeSystem/v3-RoleCode', code: 'CHILD', display: 'child' },
              ],
            },
          ],
        })
      );
      expect(upsertSpy).toHaveBeenCalled();
    });

    test('addCoverage creates RelatedPerson with spouse relationship', async () => {
      const createSpy = vi.spyOn(medplum, 'createResource').mockResolvedValue({} as any);
      const upsertSpy = vi.spyOn(medplum, 'upsertResource').mockResolvedValue({} as any);
      const answers: Record<string, QuestionnaireResponseItemAnswer> = {
        'insurance-provider': { valueReference: { reference: 'Organization/org-1' } as Reference<Organization> },
        'subscriber-id': { valueString: 'sub-1' },
        'relationship-to-subscriber': { valueCoding: { code: 'spouse', system: 'http://example.com' } },
        'related-person': {
          'related-person-first-name': { valueString: 'Jane' },
          'related-person-last-name': { valueString: 'Doe' },
        } as any,
      };

      await addCoverage(medplum as any, patient, answers);

      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          resourceType: 'RelatedPerson',
          relationship: [
            {
              coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-RoleCode', code: 'SPS', display: 'spouse' }],
            },
          ],
        })
      );
      expect(upsertSpy).toHaveBeenCalled();
    });

    test('addCoverage creates RelatedPerson with common relationship (treated as spouse)', async () => {
      const createSpy = vi.spyOn(medplum, 'createResource').mockResolvedValue({} as any);
      const upsertSpy = vi.spyOn(medplum, 'upsertResource').mockResolvedValue({} as any);
      const answers: Record<string, QuestionnaireResponseItemAnswer> = {
        'insurance-provider': { valueReference: { reference: 'Organization/org-1' } as Reference<Organization> },
        'subscriber-id': { valueString: 'sub-1' },
        'relationship-to-subscriber': { valueCoding: { code: 'common', system: 'http://example.com' } },
        'related-person': {
          'related-person-first-name': { valueString: 'Jane' },
          'related-person-last-name': { valueString: 'Doe' },
        } as any,
      };

      await addCoverage(medplum as any, patient, answers);

      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          resourceType: 'RelatedPerson',
          relationship: [
            {
              coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-RoleCode', code: 'SPS', display: 'spouse' }],
            },
          ],
        })
      );
      expect(upsertSpy).toHaveBeenCalled();
    });

    test('addCoverage creates RelatedPerson with undefined relationship when code not mapped', async () => {
      const createSpy = vi.spyOn(medplum, 'createResource').mockResolvedValue({} as any);
      const upsertSpy = vi.spyOn(medplum, 'upsertResource').mockResolvedValue({} as any);
      const answers: Record<string, QuestionnaireResponseItemAnswer> = {
        'insurance-provider': { valueReference: { reference: 'Organization/org-1' } as Reference<Organization> },
        'subscriber-id': { valueString: 'sub-1' },
        'relationship-to-subscriber': { valueCoding: { code: 'unknown-relationship', system: 'http://example.com' } },
        'related-person': {
          'related-person-first-name': { valueString: 'Jane' },
          'related-person-last-name': { valueString: 'Doe' },
        } as any,
      };

      await addCoverage(medplum as any, patient, answers);

      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          resourceType: 'RelatedPerson',
          relationship: undefined,
        })
      );
      expect(upsertSpy).toHaveBeenCalled();
    });

    test('addCoverage creates RelatedPerson without name when name is undefined', async () => {
      const createSpy = vi.spyOn(medplum, 'createResource').mockResolvedValue({} as any);
      const upsertSpy = vi.spyOn(medplum, 'upsertResource').mockResolvedValue({} as any);
      const answers: Record<string, QuestionnaireResponseItemAnswer> = {
        'insurance-provider': { valueReference: { reference: 'Organization/org-1' } as Reference<Organization> },
        'subscriber-id': { valueString: 'sub-1' },
        'relationship-to-subscriber': { valueCoding: { code: 'child', system: 'http://example.com' } },
        'related-person': {} as any,
      };

      await addCoverage(medplum as any, patient, answers);

      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          resourceType: 'RelatedPerson',
          name: undefined,
        })
      );
      expect(upsertSpy).toHaveBeenCalled();
    });
  });

  describe('getGroupRepeatedAnswers edge cases', () => {
    test('handles items with nested subgroups and answers', () => {
      const questionnaire: Questionnaire = {
        status: 'active',
        resourceType: 'Questionnaire',
        item: [
          {
            linkId: 'group',
            type: 'group',
            item: [
              { linkId: 'field1', type: 'string' },
              {
                linkId: 'subgroup',
                type: 'group',
                item: [{ linkId: 'subfield1', type: 'string' }],
              },
            ],
          },
        ],
      };
      const response: QuestionnaireResponse = {
        status: 'completed',
        resourceType: 'QuestionnaireResponse',
        item: [
          {
            linkId: 'group',
            item: [
              { linkId: 'field1', answer: [{ valueString: 'value1' }] },
              {
                linkId: 'subgroup',
                item: [{ linkId: 'subfield1', answer: [{ valueString: 'subvalue1' }] }],
              },
            ],
          },
        ],
      };

      const answers = getGroupRepeatedAnswers(questionnaire, response, 'group');
      expect(answers).toEqual([
        {
          field1: { valueString: 'value1' },
          subgroup: { subfield1: { valueString: 'subvalue1' } },
        },
      ]);
    });

    test('handles items without answers in nested subgroups', () => {
      const questionnaire: Questionnaire = {
        status: 'active',
        resourceType: 'Questionnaire',
        item: [
          {
            linkId: 'group',
            type: 'group',
            item: [
              {
                linkId: 'subgroup',
                type: 'group',
                item: [{ linkId: 'subfield1', type: 'string' }],
              },
            ],
          },
        ],
      };
      const response: QuestionnaireResponse = {
        status: 'completed',
        resourceType: 'QuestionnaireResponse',
        item: [
          {
            linkId: 'group',
            item: [
              {
                linkId: 'subgroup',
                item: [{ linkId: 'subfield1' }], // No answer
              },
            ],
          },
        ],
      };

      const answers = getGroupRepeatedAnswers(questionnaire, response, 'group');
      // When there's no answer, it returns an empty object
      expect(answers).toEqual([
        {
          subgroup: {},
        },
      ]);
    });

    test('handles items with empty answer arrays', () => {
      const questionnaire: Questionnaire = {
        status: 'active',
        resourceType: 'Questionnaire',
        item: [
          {
            linkId: 'group',
            type: 'group',
            item: [{ linkId: 'field1', type: 'string' }],
          },
        ],
      };
      const response: QuestionnaireResponse = {
        status: 'completed',
        resourceType: 'QuestionnaireResponse',
        item: [
          {
            linkId: 'group',
            item: [{ linkId: 'field1', answer: [] }],
          },
        ],
      };

      const answers = getGroupRepeatedAnswers(questionnaire, response, 'group');
      expect(answers).toEqual([
        {
          field1: {},
        },
      ]);
    });
  });
});
