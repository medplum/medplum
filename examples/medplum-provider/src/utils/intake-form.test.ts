// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { badRequest, OperationOutcomeError } from '@medplum/core';
import type { Questionnaire, QuestionnaireResponse, QuestionnaireResponseItemAnswer } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import type { Mock } from 'vitest';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const mockAnswers = {
  'first-name': { valueString: 'Jamie' },
  'last-name': { valueString: 'Doe' },
  dob: { valueDate: '1990-01-01' },
  phone: { valueString: '555-5555' },
  ssn: { valueString: '123-45-6789' },
  street: { valueString: '1 Main St' },
  city: { valueString: 'Springfield' },
  state: { valueCoding: { code: 'CA' } },
  zip: { valueString: '90210' },
  'languages-spoken': { valueCoding: { code: 'en' } },
  'preferred-language': { valueCoding: { code: 'en' } },
  race: { valueCoding: { code: 'race-code', display: 'Race' } },
  ethnicity: { valueCoding: { code: 'eth-code', display: 'Ethnicity' } },
  'veteran-status': { valueBoolean: true },
  'consent-for-treatment-signature': { valueBoolean: true },
  'consent-for-treatment-date': { valueDate: '2024-01-01' },
  'agreement-to-pay-for-treatment-help': { valueBoolean: true },
  'agreement-to-pay-for-treatment-date': { valueDate: '2024-01-02' },
  'notice-of-privacy-practices-signature': { valueBoolean: true },
  'notice-of-privacy-practices-date': { valueDate: '2024-01-03' },
  'acknowledgement-for-advance-directives-signature': { valueBoolean: true },
  'acknowledgement-for-advance-directives-date': { valueDate: '2024-01-04' },
  'preferred-pharmacy-reference': { valueReference: { reference: 'Organization/pharmacy-1' } },
} satisfies Record<string, QuestionnaireResponseItemAnswer>;

const mockIntakeUtils = vi.hoisted(() => ({
  addAllergy: vi.fn(),
  addCondition: vi.fn(),
  addConsent: vi.fn(),
  addCoverage: vi.fn(),
  addExtension: vi.fn(),
  addFamilyMemberHistory: vi.fn(),
  addImmunization: vi.fn(),
  addLanguage: vi.fn(),
  addMedication: vi.fn(),
  addPharmacy: vi.fn(),
  consentCategoryMapping: {
    med: { coding: [] },
    pay: { coding: [] },
    nopp: { coding: [] },
    acd: { coding: [] },
  },
  consentPolicyRuleMapping: {
    cric: { coding: [] },
    hipaaSelfPay: { coding: [] },
    hipaaNpp: { coding: [] },
    adr: { coding: [] },
  },
  consentScopeMapping: {
    treatment: { coding: [] },
    patientPrivacy: { coding: [] },
    adr: { coding: [] },
  },
  convertDateToDateTime: vi.fn((date?: string) => (date ? `${date}T00:00:00Z` : undefined)),
  extensionURLMapping: {
    race: 'race-url',
    ethnicity: 'ethnicity-url',
    veteran: 'veteran-url',
  },
  getGroupRepeatedAnswers: vi.fn((_, __, groupId) => {
    if (groupId === 'coverage-information') {
      return [
        {
          'insurance-provider': { valueReference: { reference: 'Organization/org-1' } },
          'subscriber-id': { valueString: 'sub-1' },
          'relationship-to-subscriber': { valueCoding: { code: 'self' } },
        },
      ];
    }
    if (groupId === 'allergies') {
      return [{ 'allergy-substance': { valueCoding: { code: 'peanut' } } }];
    }
    return [];
  }),
  getHumanName: vi.fn(() => ({ given: ['Jamie'], family: 'Doe' })),
  getPatientAddress: vi.fn(() => ({ line: ['1 Main St'] })),
  observationCategoryMapping: {
    socialHistory: { coding: [] },
    sdoh: { coding: [] },
  },
  observationCodeMapping: {
    sexualOrientation: { coding: [] },
    housingStatus: { coding: [] },
    educationLevel: { coding: [] },
    smokingStatus: { coding: [] },
    pregnancyStatus: { coding: [] },
    estimatedDeliveryDate: { coding: [] },
  },
  PROFILE_URLS: {
    Patient: 'patient-profile',
    ObservationSexualOrientation: 'obs-profile',
  },
  upsertObservation: vi.fn(),
}));

vi.mock('./intake-utils', () => mockIntakeUtils);

import { onboardPatient } from './intake-form';

describe('onboardPatient', () => {
  let medplum: MockClient;

  beforeEach(() => {
    medplum = new MockClient();
    vi.clearAllMocks();
  });

  test('submits all onboarding resources as a single transaction', async () => {
    const createSpy = vi.spyOn(medplum, 'createResource');
    const batchSpy = vi.spyOn(medplum, 'executeBatch').mockResolvedValue({
      resourceType: 'Bundle',
      type: 'transaction-response',
      entry: [{ resource: { resourceType: 'Patient', id: 'patient-1' } }],
    });

    const questionnaire = { resourceType: 'Questionnaire' } as Questionnaire;
    const response = buildResponseFromAnswers(mockAnswers);

    const patient = await onboardPatient(medplum, questionnaire, response);

    expect(patient.id).toBe('patient-1');
    expect(createSpy).not.toHaveBeenCalled();
    expect(batchSpy).toHaveBeenCalledTimes(1);
    const bundle = batchSpy.mock.calls[0][0];
    expect(bundle.type).toBe('transaction');
    expect(bundle.entry?.some((e) => e.resource?.resourceType === 'Patient')).toBe(true);
    expect(bundle.entry?.some((e) => e.resource?.resourceType === 'QuestionnaireResponse')).toBe(true);
    expect(mockIntakeUtils.addExtension).toHaveBeenCalledWith(
      expect.objectContaining({}),
      'race-url',
      'valueCoding',
      mockAnswers['race'],
      'ombCategory'
    );
    expect(mockIntakeUtils.addLanguage).toHaveBeenCalledTimes(2);
    expect(mockIntakeUtils.addCoverage).toHaveBeenCalledWith(expect.anything(), expect.any(Object), expect.any(Object));
    expect(mockIntakeUtils.addAllergy).toHaveBeenCalled();
    expect(mockIntakeUtils.addConsent).toHaveBeenCalled();
    expect(mockIntakeUtils.addPharmacy).toHaveBeenCalled();
  });

  test('does not create any resources when the transaction fails', async () => {
    const createSpy = vi.spyOn(medplum, 'createResource');
    vi.spyOn(medplum, 'executeBatch').mockRejectedValue(new OperationOutcomeError(badRequest('Invalid response')));

    const questionnaire = { resourceType: 'Questionnaire' } as Questionnaire;
    const response = buildResponseFromAnswers(mockAnswers);

    await expect(onboardPatient(medplum, questionnaire, response)).rejects.toThrow('Invalid response');

    expect(createSpy).not.toHaveBeenCalled();
  });

  test('rejects before submitting when a coverage group is missing required answers', async () => {
    const batchSpy = vi.spyOn(medplum, 'executeBatch');
    (mockIntakeUtils.getGroupRepeatedAnswers as Mock).mockImplementation((_, __, groupId) =>
      groupId === 'coverage-information' ? [{ 'subscriber-id': { valueString: 'sub-1' } }] : []
    );

    const questionnaire = { resourceType: 'Questionnaire' } as Questionnaire;
    const response = buildResponseFromAnswers(mockAnswers);

    await expect(onboardPatient(medplum, questionnaire, response)).rejects.toThrow(
      'Coverage Information is missing required answers'
    );

    expect(batchSpy).not.toHaveBeenCalled();
  });
});

function buildResponseFromAnswers(answers: Record<string, QuestionnaireResponseItemAnswer>): QuestionnaireResponse {
  return {
    resourceType: 'QuestionnaireResponse',
    status: 'completed',
    item: Object.entries(answers).map(([linkId, answer]) => ({
      linkId,
      answer: [answer],
    })),
  };
}
