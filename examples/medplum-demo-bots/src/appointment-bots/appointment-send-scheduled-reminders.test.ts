import { Bot } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { expect, test, vi } from 'vitest';
import { handler } from './appointment-send-scheduled-reminders';

const medplum = new MockClient();

test('Send Scheduled Reminders - Success', async () => {
  // Mock the reminder bot
  const reminderBot = await medplum.createResource<Bot>({
    resourceType: 'Bot',
    name: 'appointment-reminder'
  });

  // Mock the searchOne call to return our reminder bot
  medplum.searchOne = vi.fn().mockResolvedValue(reminderBot);

  // Create a patient and practitioner
  const patient = await medplum.createResource({
    resourceType: 'Patient',
    name: [{ given: ['John'], family: 'Doe' }]
  });

  const practitioner = await medplum.createResource({
    resourceType: 'Practitioner',
    name: [{ given: ['Jane'], family: 'Smith' }]
  });

  // Create an appointment for tomorrow
  const time1 = '2025-04-16T15:00:00.000Z'; // April 14th 5:00pm
  const time2 = '2025-04-15T15:00:00.000Z'; // April 15th 5:00pm
  const time3 = '2025-04-16T15:00:00.000Z'; // April 16th 5:00pm

 await medplum.createResource({
    resourceType: 'Appointment',
    status: 'booked',
    start: time1 ,
    participant: [
      { actor: { reference: `Patient/${patient.id}` }, status: 'accepted' },
      { actor: { reference: `Practitioner/${practitioner.id}` }, status: 'accepted' }
    ]
  });
  await medplum.createResource({
    resourceType: 'Appointment',
    status: 'booked',
    start: time2,
    participant: [
      { actor: { reference: `Patient/${patient.id}` }, status: 'accepted' },
      { actor: { reference: `Practitioner/${practitioner.id}` }, status: 'accepted' }
    ]
  });
  await medplum.createResource({
    resourceType: 'Appointment',
    status: 'booked',
    start: time3,
    participant: [
      { actor: { reference: `Patient/${patient.id}` }, status: 'accepted' },
      { actor: { reference: `Practitioner/${practitioner.id}` }, status: 'accepted' }
    ]
  })

  const result = await handler(medplum, {
    bot: { reference: 'Bot/123' },
    input: {},
    contentType: 'application/fhir+json',
    secrets: {}
  });

  expect(result).toBe(true);
}); 