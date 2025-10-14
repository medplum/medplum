// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MockClient } from '@medplum/mock';
import { expect, test, vi, beforeEach, afterEach, describe } from 'vitest';
import { handler } from './auto-responder-bot';
import { ContentType, createReference } from '@medplum/core';
import type { Communication, Practitioner, Patient, Bot } from '@medplum/fhirtypes';

describe('Auto Responder Bot', () => {
  let medplum: MockClient;
  let practitioner: Practitioner;
  let patient: Patient;
  let thread: Communication;
  let bot: Bot;
  let mockDate: Date;

  beforeEach(async () => {
    // Mock the date to a fixed timestamp for consistent testing
    mockDate = new Date('2024-01-15T10:30:00.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(mockDate);

    medplum = new MockClient();
    practitioner = await medplum.createResource<Practitioner>({
      resourceType: 'Practitioner',
      name: [{ given: ['John'], family: 'Doe' }],
    });
    patient = await medplum.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Jane'], family: 'Doe' }],
    });
    thread = await medplum.createResource<Communication>({
      resourceType: 'Communication',
      status: 'in-progress',
      subject: createReference(patient),
      sender: createReference(practitioner),
      recipient: [createReference(patient), createReference(practitioner)],
      topic: { text: 'Test Thread' },
    });
    bot = await medplum.createResource<Bot>({
      resourceType: 'Bot',
      name: 'Auto Responder Bot',
      description: 'A bot that automatically responds to messages from Practitioners',
    });
  });

  afterEach(() => {
    // Restore real timers after each test
    vi.useRealTimers();
  });

  test('Send automatic response message if sender is Practitioner', async () => {
    const communication = await medplum.createResource({
      resourceType: 'Communication',
      status: 'in-progress',
      sender: createReference(practitioner),
      recipient: [createReference(patient)],
      payload: [{ contentString: 'Hello' }],
      partOf: [createReference(thread)],
      sent: mockDate.toISOString(),
    });

    const communicationAutoResponse = (await handler(medplum, {
      bot: createReference(bot),
      input: communication,
      contentType: ContentType.FHIR_JSON,
      secrets: {},
    })) as Communication;

    expect(communicationAutoResponse).toBeDefined();
    expect(communicationAutoResponse?.resourceType).toBe('Communication');
    expect(communicationAutoResponse?.status).toBe('in-progress');
    expect(communicationAutoResponse?.sender).toEqual(createReference(patient));
    expect(communicationAutoResponse?.recipient).toEqual([createReference(practitioner)]);
    expect(communicationAutoResponse?.payload).toEqual([{ contentString: 'This is an auto generated response' }]);
    expect(communicationAutoResponse?.partOf).toEqual([createReference(thread)]);
    expect(communicationAutoResponse?.sent).toEqual(mockDate.toISOString());
    expect(communicationAutoResponse?.note).toEqual([{ text: 'Auto-generated response' }]);
  });

  test('Skip non-Practitioner sender', async () => {
    const communication = await medplum.createResource({
      resourceType: 'Communication',
      status: 'in-progress',
      sender: createReference(patient),
      recipient: [createReference(practitioner)],
      payload: [{ contentString: 'Hello' }],
      partOf: [createReference(thread)],
      sent: mockDate.toISOString(),
    });

    const communicationAutoResponse = await handler(medplum, {
      bot: createReference(bot),
      input: communication,
      contentType: ContentType.FHIR_JSON,
      secrets: {},
    });

    expect(communicationAutoResponse).toBeUndefined();
  });

  test('Skip missing partOf', async () => {
    const communication = await medplum.createResource({
      resourceType: 'Communication',
      status: 'in-progress',
      sender: createReference(practitioner),
      recipient: [createReference(patient)],
      payload: [{ contentString: 'Hello' }],
    });

    const communicationAutoResponse = await handler(medplum, {
      bot: createReference(bot),
      input: communication,
      contentType: ContentType.FHIR_JSON,
      secrets: {},
    });

    expect(communicationAutoResponse).toBeUndefined();
  });

  test('Skip if already auto-generated', async () => {
    const communication = await medplum.createResource({
      resourceType: 'Communication',
      status: 'in-progress',
      sender: createReference(practitioner),
      recipient: [createReference(patient)],
      payload: [{ contentString: 'This is a auto-generated response' }],
      partOf: [createReference(thread)],
      sent: mockDate.toISOString(),
      note: [{ text: 'Auto-generated response' }],
    });

    const communicationAutoResponse = await handler(medplum, {
      bot: createReference(bot),
      input: communication,
      contentType: ContentType.FHIR_JSON,
      secrets: {},
    });

    expect(communicationAutoResponse).toBeUndefined();
  });
});
