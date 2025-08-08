// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MockClient } from '@medplum/mock';
import { expect, test, vi } from 'vitest';
import { handler } from './send-appointment-reminders';
import { ResourceType } from '@medplum/fhirtypes';

const medplum = new MockClient();

test('Send Scheduled Reminders - Success', async () => {
  // Mock console.log
  // Create a patient and practitioner
  const patient = await medplum.createResource({
    resourceType: 'Patient',
    name: [{ given: ['John'], family: 'Doe' }],
  });

  const practitioner = await medplum.createResource({
    resourceType: 'Practitioner',
    name: [{ given: ['Jane'], family: 'Smith' }],
  });

  // Mock the current time to ensure consistent test behavior
  vi.setSystemTime(new Date('2025-01-01T12:00:00Z'));
  const now = new Date();
  const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
  const twelveHoursFromNow = new Date(now.getTime() + 12 * 60 * 60 * 1000).toISOString();
  const twentyFourHoursFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

  // Create test appointments
  const appointment1 = await medplum.createResource({
    resourceType: 'Appointment',
    identifier: [{ value: '123' }],
    status: 'booked',
    start: oneHourFromNow,
    participant: [
      { actor: { reference: `Patient/${patient.id}` }, status: 'accepted' },
      { actor: { reference: `Practitioner/${practitioner.id}` }, status: 'accepted' },
    ],
  });

  const appointment2 = await medplum.createResource({
    resourceType: 'Appointment',
    identifier: [{ value: '456' }],
    status: 'booked',
    start: twelveHoursFromNow,
    participant: [
      { actor: { reference: `Patient/${patient.id}` }, status: 'accepted' },
      { actor: { reference: `Practitioner/${practitioner.id}` }, status: 'accepted' },
    ],
  });

  // Create an appointment that should NOT trigger a reminder (too far in future)
  await medplum.createResource({
    resourceType: 'Appointment',
    status: 'booked',
    start: twentyFourHoursFromNow,
    identifier: [{ value: '789' }],
    participant: [
      { actor: { reference: `Patient/${patient.id}` }, status: 'accepted' },
      { actor: { reference: `Practitioner/${practitioner.id}` }, status: 'accepted' },
    ],
  });

  // Mock the searchResources call to return our test appointments
  const originalSearchResources = medplum.searchResources;
  medplum.searchResources = vi.fn().mockImplementation(async (resourceType: ResourceType, query: any) => {
    if (resourceType === 'Appointment') {
      return [appointment1, appointment2];
    }
    return originalSearchResources.call(medplum, resourceType, query);
  });

  await handler(medplum, {
    bot: { reference: 'Bot/123' },
    input: {},
    contentType: 'application/fhir+json',
    secrets: {},
  });

  // Verify communications were created for both appointments
  const communications = await medplum.searchResources('Communication');
  const comm1 = communications.find((c) => c.basedOn?.[0]?.reference === `Appointment/${appointment1.id}`);
  const comm2 = communications.find((c) => c.basedOn?.[0]?.reference === `Appointment/${appointment2.id}`);
  expect(comm1).toBeDefined();
  expect(comm2).toBeDefined();
});
