import { MockClient } from '@medplum/mock';
import { expect, test } from 'vitest';
import { handler } from './appointment-reminder';

const medplum = new MockClient();

test('Send Reminder - Success', async () => {

  // Create a patient and practitioner
  const patient = await medplum.createResource({
    resourceType: 'Patient',
    name: [{ given: ['John'], family: 'Doe' }]
  });

  const practitioner = await medplum.createResource({
    resourceType: 'Practitioner',
    name: [{ given: ['Jane'], family: 'Smith' }]
  });

  // Create an appointment
  const appointment = {
    resourceType: 'Appointment',
    status: 'booked',
    start: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    participant: [
      { actor: { reference: `Patient/${patient.id}` }, status: 'accepted' },
      { actor: { reference: `Practitioner/${practitioner.id}` }, status: 'accepted' }
    ]
  };

  const result = await handler(medplum, {
    bot: { reference: 'Bot/123' },
    input: appointment,
    contentType: 'application/fhir+json',
    secrets: {}
  });

  expect(result).toBeDefined();
  expect(result.resourceType).toBe('Appointment');
});

test('Send Reminder - Missing Patient', async () => {
  const appointment = {
    resourceType: 'Appointment',
    status: 'booked',
    start: new Date().toISOString(),
    participant: [
      { actor: { reference: 'Patient/not-found' }, status: 'accepted' }
    ]
  };

  await expect(handler(medplum, {
    bot: { reference: 'Bot/123' },
    input: appointment,
    contentType: 'application/fhir+json',
    secrets: {}
  })).rejects.toThrow('Not found');
});

test('Send Reminder - Missing Practitioner', async () => {
  const patient = await medplum.createResource({
    resourceType: 'Patient',
    name: [{ given: ['John'], family: 'Doe' }]
  });

  const appointment = {
    resourceType: 'Appointment',
    status: 'booked',
    start: new Date().toISOString(),
    participant: [
      { actor: { reference: `Patient/${patient.id}` }, status: 'accepted' },
      { actor: { reference: 'Practitioner/not-found' }, status: 'accepted' }
    ]
  };

  await expect(handler(medplum, {
    bot: { reference: 'Bot/123' },
    input: appointment,
    contentType: 'application/fhir+json',
    secrets: {}
  })).rejects.toThrow('Not found');
}); 