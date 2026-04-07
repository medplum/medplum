// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MockClient } from '@medplum/mock';
import { expect, test, vi } from 'vitest';
import { handler } from './zoom-create-meeting';

const medplum = new MockClient();

vi.stubGlobal('fetch', vi.fn());

test('Create Zoom meeting from Appointment', async () => {
  const mockMeeting = {
    id: '123456789',
    join_url: 'https://zoom.us/j/123456789',
    start_url: 'https://zoom.us/s/123456789',
    password: 'abc123',
  };

  const appointment = await medplum.createResource({
    resourceType: 'Appointment',
    status: 'booked',
    description: 'Patient Consultation',
    start: '2024-04-10T15:00:00Z',
    minutesDuration: 30,
    participant: [{ status: 'accepted' }],
  });

  // Mock token request
  (fetch as any).mockImplementationOnce(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ access_token: 'mock-token' }),
    })
  );

  // Mock meeting creation request
  (fetch as any).mockImplementationOnce(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve(mockMeeting),
    })
  );

  const result = await handler(medplum, {
    input: appointment,
    bot: { reference: 'Bot/123' },
    contentType: 'application/json',
    secrets: {
      ZOOM_ACCOUNT_ID: { name: 'ZOOM_ACCOUNT_ID', valueString: 'test-account-id' },
      ZOOM_CLIENT_ID: { name: 'ZOOM_CLIENT_ID', valueString: 'test-client-id' },
      ZOOM_CLIENT_SECRET: { name: 'ZOOM_CLIENT_SECRET', valueString: 'test-client-secret' },
      ZOOM_USER_EMAIL: { name: 'ZOOM_USER_EMAIL', valueString: 'test-user-email' },
    },
  });

  expect(result.extension?.[0]).toMatchObject({
    url: 'https://medplum.com/zoom',
    extension: [
      {
        url: 'meeting-id',
        valueString: mockMeeting.id,
      },
      {
        url: 'meeting-password',
        valueString: mockMeeting.password,
      },
      {
        url: 'meeting-start-url',
        valueString: mockMeeting.start_url,
      },
      {
        url: 'meeting-join-url',
        valueString: mockMeeting.join_url,
      },
    ],
  });

  // Verify appointment was updated with Zoom details
  const updatedAppointment = await medplum.readResource('Appointment', appointment.id);
  expect(updatedAppointment.extension?.[0]).toMatchObject({
    url: 'https://medplum.com/zoom',
    extension: [
      {
        url: 'meeting-id',
        valueString: mockMeeting.id,
      },
      {
        url: 'meeting-password',
        valueString: mockMeeting.password,
      },
      {
        url: 'meeting-start-url',
        valueString: mockMeeting.start_url,
      },
      {
        url: 'meeting-join-url',
        valueString: mockMeeting.join_url,
      },
    ],
  });
});

test('Handle missing credentials', async () => {
  await expect(
    handler(medplum, {
      input: {
        resourceType: 'Appointment',
        id: '123',
        status: 'booked',
        description: 'Test Meeting',
        start: '2024-04-10T15:00:00Z',
        minutesDuration: 30,
        participant: [{ status: 'accepted' }],
      },
      bot: { reference: 'Bot/123' },
      contentType: 'application/json',
      secrets: {},
    })
  ).rejects.toThrow('Missing Zoom credentials in bot secrets');
});
