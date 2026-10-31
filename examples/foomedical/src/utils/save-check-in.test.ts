// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { getReferenceString } from '@medplum/core';
import type { Patient, QuestionnaireResponse } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import type { SmartCheckinResponse } from '@smart-health-checkin/client';
import { checkinRequest, CheckinResponse } from '@smart-health-checkin/client';
import { validateResponseAgainstRequest } from '@smart-health-checkin/client/model';
import { checkInRequest } from '../pages/CheckInPage.data';
import { saveCheckIn } from './save-check-in';

const phq2Canonical = 'https://smart-health-checkin.org/connectathon/Questionnaire/phq-2.json';

function buildResponse(options: { walletName?: string; phq2?: boolean; phq2Partial?: boolean } = {}): CheckinResponse {
  const request = checkinRequest(checkInRequest);
  const json: SmartCheckinResponse = {
    type: 'smart-health-checkin-response',
    version: '1',
    requestId: request.id,
    artifacts: [
      {
        id: 'a1',
        mediaType: 'application/fhir+json',
        fhirVersion: '4.0.1',
        fulfills: ['patient'],
        value: {
          resourceType: 'Patient',
          id: 'wallet-patient',
          name: [{ given: [options.walletName ?? 'Aria', 'Quinn'], family: 'Test' }],
          birthDate: '1981-02-03',
        },
      },
      ...(options.phq2 === false
        ? []
        : [
            {
              id: 'a2',
              mediaType: 'application/fhir+json' as const,
              fhirVersion: '4.0.1',
              fulfills: ['phq2'],
              value: {
                resourceType: 'QuestionnaireResponse',
                id: 'wallet-qr',
                status: 'completed',
                questionnaire: phq2Canonical,
                subject: { reference: 'Patient/wallet-patient' },
                encounter: { reference: 'Encounter/wallet-encounter' },
                item: [
                  { linkId: 'phq2-1', answer: [{ valueCoding: { system: 'http://loinc.org', code: 'LA6569-3' } }] },
                  ...(options.phq2Partial
                    ? []
                    : [
                        {
                          linkId: 'phq2-2',
                          answer: [{ valueCoding: { system: 'http://loinc.org', code: 'LA6570-1' } }],
                        },
                      ]),
                ],
              },
            },
          ]),
    ],
    requestStatus: request.items.map((item) => {
      const declined = item.id === 'immunizations' || (item.id === 'phq2' && options.phq2 === false);
      return { item: item.id, status: declined ? 'declined' : 'fulfilled' };
    }),
  };
  const validation = validateResponseAgainstRequest(request, json);
  if (!validation.ok) {
    throw new Error(validation.error);
  }
  return new CheckinResponse(validation, request);
}

describe('saveCheckIn', () => {
  let medplum: MockClient;
  let patient: WithId<Patient>;

  beforeEach(async () => {
    medplum = new MockClient();
    patient = await medplum.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Aria'], family: 'Test' }],
      birthDate: '1981-02-03',
    });
  });

  test('Stages the response, form answers, review task, and provenance', async () => {
    const { task, documentReference, warnings } = await saveCheckIn(medplum, patient, buildResponse(), 'Test Wallet');

    expect(warnings).toEqual([]);
    expect(documentReference.content.map((c) => c.attachment.title)).toEqual(['Check-in response', 'Check-in request']);
    expect(documentReference.content[0].attachment.url).toBeDefined();

    const qrRef = task.input?.find((i) => i.type.text === 'Two questions about your mood')?.valueReference;
    const qr = await medplum.readReference<QuestionnaireResponse>(qrRef as { reference: string });
    expect(qr.subject?.reference).toBe(getReferenceString(patient));
    expect(qr.questionnaire).toBe(phq2Canonical);
    expect(qr.encounter).toBeUndefined();

    expect(task.focus?.reference).toBe(getReferenceString(patient));
    expect(task.description).toContain('shared 6 of 7');
    expect(task.description).toContain('total score: 3');
    expect(task.input?.find((i) => i.type.text === 'Immunizations')?.valueString).toBe('declined');
    expect(task.note).toBeUndefined();

    // MockClient can't search Provenance by target, so list them all
    const [provenance] = await medplum.searchResources('Provenance');
    expect(provenance.target.map((t) => t.reference)).toEqual(
      expect.arrayContaining([getReferenceString(patient), getReferenceString(task)])
    );
  });

  test('Flags a wallet patient that does not match the account', async () => {
    const { task } = await saveCheckIn(medplum, patient, buildResponse({ walletName: 'Bob' }), 'Test Wallet');
    expect(task.note?.[0].text).toContain('Bob Quinn Test, born 1981-02-03');
  });

  test('Says when a scored form is only partly answered', async () => {
    const { task } = await saveCheckIn(medplum, patient, buildResponse({ phq2Partial: true }), 'Test Wallet');
    expect(task.description).toContain('total score: 1 (1 of 2 answered).');
  });

  test('Notes form answers that could not be saved instead of failing', async () => {
    const create = medplum.createResourceIfNoneExist.bind(medplum);
    vi.spyOn(medplum, 'createResourceIfNoneExist').mockImplementation((resource, query) =>
      resource.resourceType === 'QuestionnaireResponse' ? Promise.reject(new Error('Invalid')) : create(resource, query)
    );
    const { task } = await saveCheckIn(medplum, patient, buildResponse(), 'Test Wallet');
    expect(task.note?.[0].text).toContain("Two questions about your mood: answers couldn't be saved");
  });

  test('Saves without form answers', async () => {
    const { task } = await saveCheckIn(medplum, patient, buildResponse({ phq2: false }), 'Test Wallet');
    expect(task.input?.some((i) => i.valueReference?.reference?.startsWith('QuestionnaireResponse/'))).toBe(false);
    expect(task.description).not.toContain('score');
  });

  // MockClient can't search DocumentReference or QuestionnaireResponse by identifier; those are checked on a real server
  test('Retry reuses the review task', async () => {
    const response = buildResponse();
    const first = await saveCheckIn(medplum, patient, response, 'Test Wallet');
    const second = await saveCheckIn(medplum, patient, response, 'Test Wallet');
    expect(second.task.id).toBe(first.task.id);
  });
});
