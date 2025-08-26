// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType, createReference, SNOMED } from '@medplum/core';
import { Encounter, Patient, Practitioner } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { handler } from './b11-dsi-mammography-bot';

describe('B11 DSI Mammography Bot', () => {
  let medplum: MockClient, patient1: Patient, practitioner: Practitioner, baseEncounter: Encounter;

  const bot = { reference: 'Bot/123' };
  const contentType = ContentType.FHIR_JSON;
  const secrets = {};
  const today = new Date();

  beforeEach(async () => {
    medplum = new MockClient();
    patient1 = await medplum.createResource({
      resourceType: 'Patient',
      name: [{ given: ['Anna'], family: 'Doe' }],
      gender: 'female',
    });
    practitioner = await medplum.createResource({
      resourceType: 'Practitioner',
      name: [{ given: ['Joe'], family: 'Smith' }],
    });
    baseEncounter = {
      resourceType: 'Encounter',
      status: 'arrived',
      class: {
        system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
        code: 'AMB',
        display: 'ambulatory',
      },
      subject: createReference(patient1),
      participant: [{ individual: createReference(practitioner) }],
    };

    // Clean up existing tasks
    const tasks = await medplum.searchResources('Task');
    for (const task of tasks) {
      await medplum.deleteResource('Task', task.id);
    }
  });

  it('skips when encounter subject is not a patient', async () => {
    const encounter: Encounter = await medplum.createResource({
      ...baseEncounter,
      subject: { reference: 'Organization/123' },
    });

    await handler(medplum, { bot, input: encounter, contentType, secrets });

    const tasks = await medplum.searchResources('Task');
    expect(tasks).toHaveLength(0);
  });

  it('skips when encounter has no practitioner participant', async () => {
    const encounter: Encounter = await medplum.createResource({
      ...baseEncounter,
      participant: [],
    });

    await handler(medplum, { bot, input: encounter, contentType, secrets });

    const tasks = await medplum.searchResources('Task');
    expect(tasks).toHaveLength(0);
  });

  it('skips when patient has no birth date', async () => {
    const patientWithoutBirthDate = await medplum.createResource({
      ...patient1,
      birthDate: undefined,
    });

    const encounter: Encounter = await medplum.createResource({
      ...baseEncounter,
      subject: createReference(patientWithoutBirthDate),
    });

    await handler(medplum, { bot, input: encounter, contentType, secrets });

    const tasks = await medplum.searchResources('Task');
    expect(tasks).toHaveLength(0);
  });

  it('skips when patient is younger than 45 years', async () => {
    const youngPatient = await medplum.createResource({
      ...patient1,
      birthDate: new Date(today.getFullYear() - 23, 0, 1).toISOString().split('T')[0],
    });

    const encounter: Encounter = await medplum.createResource({
      ...baseEncounter,
      subject: createReference(youngPatient),
    });

    await handler(medplum, { bot, input: encounter, contentType, secrets });

    const tasks = await medplum.searchResources('Task');
    expect(tasks).toHaveLength(0);
  });

  it('skips when patient is not female', async () => {
    const notFemalePatient = await medplum.createResource({
      ...patient1,
      gender: 'unknown',
    });

    const encounter: Encounter = await medplum.createResource({
      ...baseEncounter,
      subject: createReference(notFemalePatient),
    });

    await handler(medplum, { bot, input: encounter, contentType, secrets });

    const tasks = await medplum.searchResources('Task');
    expect(tasks).toHaveLength(0);
  });

  it('successfully creates a task when patient is 40 years or older', async () => {
    const oldPatient = await medplum.createResource({
      ...patient1,
      birthDate: new Date(today.getFullYear() - 48, 0, 1).toISOString().split('T')[0], // 48 years old
    });

    const encounter: Encounter = await medplum.createResource({
      ...baseEncounter,
      subject: createReference(oldPatient),
    });

    await handler(medplum, { bot, input: encounter, contentType, secrets });

    const tasks = await medplum.searchResources('Task');
    expect(tasks).toHaveLength(1);
  });

  it('skips when patient has prior mammography in last 2 years', async () => {
    const oldPatient = await medplum.createResource({
      ...patient1,
      birthDate: new Date(today.getFullYear() - 48, 0, 1).toISOString().split('T')[0],
    });

    // Create a prior mammography procedure 1 year ago
    await medplum.createResource({
      resourceType: 'Procedure',
      status: 'completed',
      code: {
        coding: [
          {
            system: SNOMED,
            code: '71651007',
            display: 'Mammography',
          },
        ],
      },
      subject: createReference(oldPatient),
      performedDateTime: new Date(today.getFullYear() - 1, 0, 1).toISOString(),
    });

    const encounter: Encounter = await medplum.createResource({
      ...baseEncounter,
      subject: createReference(oldPatient),
    });

    await handler(medplum, { bot, input: encounter, contentType, secrets });

    const tasks = await medplum.searchResources('Task');
    expect(tasks).toHaveLength(0);
  });

  it('successfully creates a task when patient has mammography older than 2 years', async () => {
    const oldPatient = await medplum.createResource({
      ...patient1,
      birthDate: new Date(today.getFullYear() - 48, 0, 1).toISOString().split('T')[0],
    });

    // Create a prior mammography procedure 3 years ago
    await medplum.createResource({
      resourceType: 'Procedure',
      status: 'completed',
      code: {
        coding: [
          {
            system: SNOMED,
            code: '71651007',
            display: 'Mammography',
          },
        ],
      },
      subject: createReference(oldPatient),
      performedDateTime: new Date(today.getFullYear() - 3, 0, 1).toISOString(),
    });

    const encounter: Encounter = await medplum.createResource({
      ...baseEncounter,
      subject: createReference(oldPatient),
    });

    await handler(medplum, { bot, input: encounter, contentType, secrets });

    const tasks = await medplum.searchResources('Task');
    expect(tasks).toHaveLength(1);
  });

  it('skips when a task already exists for the same patient and encounter', async () => {
    const oldPatient = await medplum.createResource({
      ...patient1,
      birthDate: new Date(today.getFullYear() - 48, 0, 1).toISOString().split('T')[0],
    });

    const encounter: Encounter = await medplum.createResource({
      ...baseEncounter,
      subject: createReference(oldPatient),
    });

    await handler(medplum, { bot, input: encounter, contentType, secrets });
    let tasks = await medplum.searchResources('Task');
    expect(tasks).toHaveLength(1);

    await handler(medplum, { bot, input: encounter, contentType, secrets });
    tasks = await medplum.searchResources('Task');
    expect(tasks).toHaveLength(1);
  });

  it('creates a task with correct properties for eligible patient', async () => {
    const oldPatient = await medplum.createResource({
      ...patient1,
      birthDate: new Date(today.getFullYear() - 48, 0, 1).toISOString().split('T')[0],
    });

    const encounter: Encounter = await medplum.createResource({
      ...baseEncounter,
      subject: createReference(oldPatient),
    });

    const createdEncounter = await medplum.createResource(encounter);

    await handler(medplum, { bot, input: createdEncounter, contentType, secrets });

    const tasks = await medplum.searchResources('Task');
    expect(tasks).toHaveLength(1);
    const task = tasks[0];
    expect(task).toMatchObject({
      resourceType: 'Task',
      status: 'requested',
      intent: 'proposal',
      priority: 'routine',
      for: createReference(oldPatient),
      requester: createReference(practitioner),
      owner: createReference(practitioner),
      encounter: createReference(createdEncounter),
      code: {
        coding: [
          {
            system: SNOMED,
            code: '71651007',
            display: 'Mammography',
          },
        ],
        text: 'Mammography',
      },
    });
    expect(task.note?.[0]?.text).toContain('Breast Cancer Screening Recommendation');
    expect(task.note?.[0]?.text).toContain('Age 48 years (recommended: ≥40 years), female gender');
    expect(task.note?.[0]?.text).toContain('no mammography documented in the past 2 years');
    expect(task.note?.[0]?.text).toContain(
      'https://www.uspreventiveservicestaskforce.org/uspstf/recommendation/breast-cancer-screening'
    );
  });

  it('creates feedback questionnaire and links it to the task', async () => {
    const oldPatient = await medplum.createResource({
      ...patient1,
      birthDate: new Date(today.getFullYear() - 48, 0, 1).toISOString().split('T')[0],
    });

    const encounter: Encounter = await medplum.createResource({
      ...baseEncounter,
      subject: createReference(oldPatient),
    });

    const createdEncounter = await medplum.createResource(encounter);

    await handler(medplum, { bot, input: createdEncounter, contentType, secrets });

    const tasks = await medplum.searchResources('Task');
    const task = tasks[0];

    // Check that the task has a focus on a questionnaire
    expect(task.focus?.reference).toMatch(/^Questionnaire\//);
    expect(task.input?.[0]?.type?.text).toBe('Questionnaire');
    expect(task.input?.[0]?.valueReference?.reference).toMatch(/^Questionnaire\//);

    // Verify the questionnaire was created with correct identifier
    const questionnaires = await medplum.searchResources('Questionnaire', [
      ['identifier', 'https://www.medplum.com/questionnaires|dsi-feedback-mammography'],
    ]);
    expect(questionnaires).toHaveLength(1);
  });

  it('handles patient exactly at minimum age threshold', async () => {
    // Create a patient who is exactly 40 years old today
    const exactAgePatient = await medplum.createResource({
      ...patient1,
      birthDate: new Date(today.getFullYear() - 40, 0, 1).toISOString().split('T')[0],
    });

    const encounter: Encounter = await medplum.createResource({
      ...baseEncounter,
      subject: createReference(exactAgePatient),
    });

    await handler(medplum, { bot, input: encounter, contentType, secrets });

    const tasks = await medplum.searchResources('Task');
    expect(tasks).toHaveLength(1);
  });
});
