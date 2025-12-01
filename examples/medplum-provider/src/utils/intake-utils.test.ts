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
  addConsent,
  addCoverage,
  addExtension,
  addLanguage,
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
  });

  describe('addLanguage', () => {
    test('adds and updates preferred language', () => {
      const coding: Coding = { system: 'urn:ietf:bcp:47', code: 'en', display: 'English' };

      addLanguage(patient, coding);
      addLanguage(patient, coding, true);

      expect(patient.communication).toHaveLength(1);
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
        medplum as any,
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
        medplum as any,
        patient,
        observationCodeMapping.smokingStatus,
        observationCategoryMapping.socialHistory,
        'valueCodeableConcept',
        undefined
      );
      expect(upsertSpy).not.toHaveBeenCalled();
    });
  });

  describe('resource helpers', () => {
    test('addAllergy returns early without substance', async () => {
      const upsertSpy = vi.spyOn(medplum, 'upsertResource');
      await addAllergy(medplum as any, patient, {});
      expect(upsertSpy).not.toHaveBeenCalled();
    });

    test('addAllergy upserts when code present', async () => {
      const upsertSpy = vi.spyOn(medplum, 'upsertResource').mockResolvedValue({} as any);
      await addAllergy(medplum as any, patient, {
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

    test('addCoverage upserts coverage resource', async () => {
      const upsertSpy = vi.spyOn(medplum, 'upsertResource').mockResolvedValue({} as any);
      const answers: Record<string, QuestionnaireResponseItemAnswer> = {
        'insurance-provider': { valueReference: { reference: 'Organization/org-1' } as Reference<Organization> },
        'subscriber-id': { valueString: 'sub-1' },
        'relationship-to-subscriber': { valueCoding: { code: 'self' } },
      };

      await addCoverage(medplum as any, patient, answers);

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
        medplum as any,
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
  });
});
