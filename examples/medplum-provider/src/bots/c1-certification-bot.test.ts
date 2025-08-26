// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType, createReference, getReferenceString } from '@medplum/core';
import { Patient, QuestionnaireResponse } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { handler } from './c1-certification-bot';
import { patientCurtisStrickland, patientJulianJohnston } from '@/bots/test-data/patient-records';

describe('C1 Certification Bot', () => {
  let medplum: MockClient, input: QuestionnaireResponse, patient1: Patient, patient2: Patient;

  const bot = { reference: 'Bot/123' };
  const contentType = ContentType.FHIR_JSON;
  const secrets = {};
  const measure = 'cms68v14';
  const periodStart = '2023-01-01T00:00:00';
  const periodEnd = '2023-12-31T23:59:59';

  beforeEach(async () => {
    medplum = new MockClient();
    patient1 = await medplum.createResource(patientCurtisStrickland);
    patient2 = await medplum.createResource(patientJulianJohnston);
    input = {
      resourceType: 'QuestionnaireResponse',
      status: 'completed',
      item: [
        {
          linkId: 'measure',
          answer: [{ valueCoding: { code: measure } }],
        },
        {
          linkId: 'measure-period-start',
          answer: [{ valueDateTime: periodStart }],
        },
        {
          linkId: 'measure-period-end',
          answer: [{ valueDateTime: periodEnd }],
        },
        {
          linkId: 'patient-ids',
          answer: [{ valueString: `${patient1.id},${patient2.id}` }],
        },
      ],
    };
  });
  it('throws an error if the measure is not supported', async () => {
    const modifiedInput = {
      ...input,
      item: input.item?.map((item) =>
        item.linkId === 'measure' ? { ...item, answer: [{ valueCoding: { code: 'cms68v15' } }] } : item
      ),
    };
    await expect(handler(medplum, { bot, input: modifiedInput, contentType, secrets })).rejects.toThrow(
      'Not supported measure: cms68v15'
    );
  });

  it('throws an error if period start is missing', async () => {
    const modifiedInput = {
      ...input,
      item: input.item?.filter((item) => item.linkId !== 'measure-period-start'),
    };
    await expect(handler(medplum, { bot, input: modifiedInput, contentType, secrets })).rejects.toThrow(
      'Missing required fields'
    );
  });

  it('throws an error if period end is missing', async () => {
    const modifiedInput = {
      ...input,
      item: input.item?.filter((item) => item.linkId !== 'measure-period-end'),
    };
    await expect(handler(medplum, { bot, input: modifiedInput, contentType, secrets })).rejects.toThrow(
      'Missing required fields'
    );
  });

  it('throws an error if patient ids are missing', async () => {
    const modifiedInput = {
      ...input,
      item: input.item?.filter((item) => item.linkId !== 'patient-ids'),
    };
    await expect(handler(medplum, { bot, input: modifiedInput, contentType, secrets })).rejects.toThrow(
      'Missing required fields'
    );
  });

  it('creates a Media resource for patients with data to export', async () => {
    let patient1Media = await medplum.searchResources('Media', {
      subject: getReferenceString(patient1),
    });
    await medplum.createResource({
      resourceType: 'Encounter',
      status: 'finished',
      class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'AMB' },
      subject: createReference(patient1),
      period: { start: '2023-02-15T08:00:00', end: '2023-02-15T09:00:00' },
    });
    let patient2Media = await medplum.searchResources('Media', {
      subject: getReferenceString(patient2),
    });
    expect(patient1Media).toHaveLength(0);
    expect(patient2Media).toHaveLength(0);

    await handler(medplum, { bot, input, contentType, secrets });

    patient1Media = await medplum.searchResources('Media', {
      subject: getReferenceString(patient1),
    });
    patient2Media = await medplum.searchResources('Media', {
      subject: getReferenceString(patient2),
    });
    expect(patient1Media).toHaveLength(1);
    expect(patient2Media).toHaveLength(0);
  });

  it('returns a Media resource for the zip file', async () => {
    const result = await handler(medplum, { bot, input, contentType, secrets });

    expect(result).toMatchObject({
      resourceType: 'Media',
      status: 'completed',
      content: {
        contentType: 'application/zip',
        url: expect.stringContaining('Binary/'),
        title: expect.stringMatching(/^CMS68v14_.*\.qrda\.zip$/),
      },
    });
  });
});
