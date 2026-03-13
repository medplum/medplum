// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { createReference, indexSearchParameterBundle, indexStructureDefinitionBundle } from '@medplum/core';
import { SEARCH_PARAMETER_BUNDLE_FILES, readJson } from '@medplum/definitions';
import { Bundle, Encounter, Patient, Practitioner, SearchParameter } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { expect, test, describe, beforeAll, vi } from 'vitest';
import { handler } from './encounter-follow-up-email-bot';

describe('Encounter Follow-up Email Bot', () => {
  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    for (const filename of SEARCH_PARAMETER_BUNDLE_FILES) {
      indexSearchParameterBundle(readJson(filename) as Bundle<SearchParameter>);
    }
  });

  test('Success - sends follow-up email for finished encounter', async () => {
    const medplum = new MockClient();

    // Create patient with email
    const patient: Patient = await medplum.createResource({
      resourceType: 'Patient',
      name: [
        {
          family: 'Smith',
          given: ['John'],
        },
      ],
      telecom: [
        {
          system: 'email',
          value: 'john.smith@example.com',
        },
      ],
    });

    // Create practitioner
    const practitioner: Practitioner = await medplum.createResource({
      resourceType: 'Practitioner',
      name: [
        {
          family: 'Johnson',
          given: ['Dr. Jane'],
        },
      ],
    });

    // Create finished encounter
    const encounter: Encounter = await medplum.createResource({
      resourceType: 'Encounter',
      status: 'finished',
      subject: createReference(patient),
      participant: [
        {
          type: [
            {
              coding: [
                {
                  code: 'PPRF',
                  system: 'http://terminology.hl7.org/CodeSystem/v3-ParticipationType',
                  display: 'Primary Performer',
                },
              ],
            },
          ],
          individual: {
            reference: `Practitioner/${practitioner.id}`,
            display: 'Dr. Jane Johnson',
          },
        },
      ],
      period: {
        start: '2024-01-15T10:00:00Z',
      },
      appointment: [
        {
          reference: 'Appointment/123',
        },
      ],
    });

    // Mock sendEmail to capture the call
    const sendEmailSpy = vi.spyOn(medplum, 'sendEmail').mockResolvedValue(undefined);

    // Invoke the bot
    await handler(medplum, {
      bot: { reference: 'Bot/123' },
      input: encounter,
      contentType: 'application/fhir+json',
      secrets: {},
    });

    // Verify email was sent
    expect(sendEmailSpy).toHaveBeenCalledWith({
      to: 'john.smith@example.com',
      subject: 'Follow up from your appointment with Dr. Jane Johnson - Monday, January 15',
      html: expect.stringContaining('Hello John Smith'),
    });

    sendEmailSpy.mockRestore();
  });

  test('Skips non-finished encounters', async () => {
    const medplum = new MockClient();

    const patient: Patient = await medplum.createResource({
      resourceType: 'Patient',
      name: [{ family: 'Smith', given: ['John'] }],
      telecom: [{ system: 'email', value: 'john.smith@example.com' }],
    });

    const encounter: Encounter = await medplum.createResource({
      resourceType: 'Encounter',
      status: 'in-progress', // Not finished
      subject: createReference(patient),
    });

    const sendEmailSpy = vi.spyOn(medplum, 'sendEmail').mockResolvedValue(undefined);

    await handler(medplum, {
      bot: { reference: 'Bot/123' },
      input: encounter,
      contentType: 'application/fhir+json',
      secrets: {},
    });

    expect(sendEmailSpy).not.toHaveBeenCalled();
    sendEmailSpy.mockRestore();
  });

  test('Skips if previous encounter was also finished', async () => {
    const medplum = new MockClient();

    const patient: Patient = await medplum.createResource({
      resourceType: 'Patient',
      name: [{ family: 'Smith', given: ['John'] }],
      telecom: [{ system: 'email', value: 'john.smith@example.com' }],
    });

    const encounter: Encounter = await medplum.createResource({
      resourceType: 'Encounter',
      status: 'finished',
      subject: createReference(patient),
    });

    // Mock readHistory to return a previous finished encounter
    const readHistorySpy = vi.spyOn(medplum, 'readHistory').mockResolvedValue({
      entry: [
        { resource: encounter }, // Current encounter
        { resource: { ...encounter, status: 'finished' } }, // Previous encounter (also finished)
      ],
    });

    const sendEmailSpy = vi.spyOn(medplum, 'sendEmail').mockResolvedValue(undefined);

    await handler(medplum, {
      bot: { reference: 'Bot/123' },
      input: encounter,
      contentType: 'application/fhir+json',
      secrets: {},
    });

    expect(sendEmailSpy).not.toHaveBeenCalled();
    readHistorySpy.mockRestore();
    sendEmailSpy.mockRestore();
  });

  test('Handles encounter with no subject reference', async () => {
    const medplum = new MockClient();

    const encounter: Encounter = await medplum.createResource({
      resourceType: 'Encounter',
      status: 'finished',
      // No subject reference
    });

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const sendEmailSpy = vi.spyOn(medplum, 'sendEmail').mockResolvedValue(undefined);

    await handler(medplum, {
      bot: { reference: 'Bot/123' },
      input: encounter,
      contentType: 'application/fhir+json',
      secrets: {},
    });

    expect(consoleSpy).toHaveBeenCalledWith('Encounter has no subject reference, skipping email');
    expect(sendEmailSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
    sendEmailSpy.mockRestore();
  });

  test('Handles patient read error', async () => {
    const medplum = new MockClient();

    const encounter: Encounter = await medplum.createResource({
      resourceType: 'Encounter',
      status: 'finished',
      subject: { reference: 'Patient/invalid-id' },
    });

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const sendEmailSpy = vi.spyOn(medplum, 'sendEmail').mockResolvedValue(undefined);

    await handler(medplum, {
      bot: { reference: 'Bot/123' },
      input: encounter,
      contentType: 'application/fhir+json',
      secrets: {},
    });

    expect(consoleSpy).toHaveBeenCalledWith('Failed to read patient reference:', expect.any(Error));
    expect(sendEmailSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
    sendEmailSpy.mockRestore();
  });

  test('Handles patient with no email address', async () => {
    const medplum = new MockClient();

    const patient: Patient = await medplum.createResource({
      resourceType: 'Patient',
      name: [{ family: 'Smith', given: ['John'] }],
      // No telecom/email
    });

    const encounter: Encounter = await medplum.createResource({
      resourceType: 'Encounter',
      status: 'finished',
      subject: createReference(patient),
    });

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const sendEmailSpy = vi.spyOn(medplum, 'sendEmail').mockResolvedValue(undefined);

    await handler(medplum, {
      bot: { reference: 'Bot/123' },
      input: encounter,
      contentType: 'application/fhir+json',
      secrets: {},
    });

    expect(consoleSpy).toHaveBeenCalledWith('Patient has no email address, skipping email');
    expect(sendEmailSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
    sendEmailSpy.mockRestore();
  });

  test('Extracts provider name from primary performer', async () => {
    const medplum = new MockClient();

    const patient: Patient = await medplum.createResource({
      resourceType: 'Patient',
      name: [{ family: 'Smith', given: ['John'] }],
      telecom: [{ system: 'email', value: 'john.smith@example.com' }],
    });

    const practitioner: Practitioner = await medplum.createResource({
      resourceType: 'Practitioner',
      name: [{ family: 'Johnson', given: ['Dr. Jane'] }],
    });

    const encounter: Encounter = await medplum.createResource({
      resourceType: 'Encounter',
      status: 'finished',
      subject: createReference(patient),
      participant: [
        {
          type: [
            {
              coding: [
                {
                  code: 'PPRF',
                  system: 'http://terminology.hl7.org/CodeSystem/v3-ParticipationType',
                  display: 'Primary Performer',
                },
              ],
            },
          ],
          individual: {
            reference: `Practitioner/${practitioner.id}`,
            display: 'Dr. Jane Johnson',
          },
        },
      ],
      period: { start: '2024-01-15T10:00:00Z' },
    });

    const sendEmailSpy = vi.spyOn(medplum, 'sendEmail').mockResolvedValue(undefined);

    await handler(medplum, {
      bot: { reference: 'Bot/123' },
      input: encounter,
      contentType: 'application/fhir+json',
      secrets: {},
    });

    expect(sendEmailSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: expect.stringContaining('Dr. Jane Johnson'),
      })
    );
    sendEmailSpy.mockRestore();
  });

  test('Falls back to any practitioner when no primary performer', async () => {
    const medplum = new MockClient();

    const patient: Patient = await medplum.createResource({
      resourceType: 'Patient',
      name: [{ family: 'Smith', given: ['John'] }],
      telecom: [{ system: 'email', value: 'john.smith@example.com' }],
    });

    const practitioner: Practitioner = await medplum.createResource({
      resourceType: 'Practitioner',
      name: [{ family: 'Johnson', given: ['Dr. Jane'] }],
    });

    const encounter: Encounter = await medplum.createResource({
      resourceType: 'Encounter',
      status: 'finished',
      subject: createReference(patient),
      participant: [
        {
          individual: {
            reference: `Practitioner/${practitioner.id}`,
            display: 'Dr. Jane Johnson',
          },
        },
      ],
      period: { start: '2024-01-15T10:00:00Z' },
    });

    const sendEmailSpy = vi.spyOn(medplum, 'sendEmail').mockResolvedValue(undefined);

    await handler(medplum, {
      bot: { reference: 'Bot/123' },
      input: encounter,
      contentType: 'application/fhir+json',
      secrets: {},
    });

    expect(sendEmailSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: expect.stringContaining('Dr. Jane Johnson'),
      })
    );
    sendEmailSpy.mockRestore();
  });

  test('Handles missing provider name gracefully', async () => {
    const medplum = new MockClient();

    const patient: Patient = await medplum.createResource({
      resourceType: 'Patient',
      name: [{ family: 'Smith', given: ['John'] }],
      telecom: [{ system: 'email', value: 'john.smith@example.com' }],
    });

    const encounter: Encounter = await medplum.createResource({
      resourceType: 'Encounter',
      status: 'finished',
      subject: createReference(patient),
      // No participants
      period: { start: '2024-01-15T10:00:00Z' },
    });

    const sendEmailSpy = vi.spyOn(medplum, 'sendEmail').mockResolvedValue(undefined);

    await handler(medplum, {
      bot: { reference: 'Bot/123' },
      input: encounter,
      contentType: 'application/fhir+json',
      secrets: {},
    });

    expect(sendEmailSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'Follow up from your appointment with  - Monday, January 15',
      })
    );
    sendEmailSpy.mockRestore();
  });

  test('Formats patient name correctly', async () => {
    const medplum = new MockClient();

    const patient: Patient = await medplum.createResource({
      resourceType: 'Patient',
      name: [
        {
          family: 'Smith',
          given: ['John', 'Michael'],
        },
      ],
      telecom: [{ system: 'email', value: 'john.smith@example.com' }],
    });

    const encounter: Encounter = await medplum.createResource({
      resourceType: 'Encounter',
      status: 'finished',
      subject: createReference(patient),
      period: { start: '2024-01-15T10:00:00Z' },
    });

    const sendEmailSpy = vi.spyOn(medplum, 'sendEmail').mockResolvedValue(undefined);

    await handler(medplum, {
      bot: { reference: 'Bot/123' },
      input: encounter,
      contentType: 'application/fhir+json',
      secrets: {},
    });

    expect(sendEmailSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        html: expect.stringContaining('Hello John Michael Smith'),
      })
    );
    sendEmailSpy.mockRestore();
  });

  test('Extracts appointment ID from encounter', async () => {
    const medplum = new MockClient();

    const patient: Patient = await medplum.createResource({
      resourceType: 'Patient',
      name: [{ family: 'Smith', given: ['John'] }],
      telecom: [{ system: 'email', value: 'john.smith@example.com' }],
    });

    const encounter: Encounter = await medplum.createResource({
      resourceType: 'Encounter',
      status: 'finished',
      subject: createReference(patient),
      period: { start: '2024-01-15T10:00:00Z' },
      appointment: [{ reference: 'Appointment/12345' }],
    });

    const sendEmailSpy = vi.spyOn(medplum, 'sendEmail').mockResolvedValue(undefined);

    await handler(medplum, {
      bot: { reference: 'Bot/123' },
      input: encounter,
      contentType: 'application/fhir+json',
      secrets: {},
    });

    expect(sendEmailSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        html: expect.stringContaining('href="https://example.com/Appointment/12345"'),
      })
    );
    sendEmailSpy.mockRestore();
  });

  test('Handles missing appointment reference', async () => {
    const medplum = new MockClient();

    const patient: Patient = await medplum.createResource({
      resourceType: 'Patient',
      name: [{ family: 'Smith', given: ['John'] }],
      telecom: [{ system: 'email', value: 'john.smith@example.com' }],
    });

    const encounter: Encounter = await medplum.createResource({
      resourceType: 'Encounter',
      status: 'finished',
      subject: createReference(patient),
      period: { start: '2024-01-15T10:00:00Z' },
      // No appointment reference
    });

    const sendEmailSpy = vi.spyOn(medplum, 'sendEmail').mockResolvedValue(undefined);

    await handler(medplum, {
      bot: { reference: 'Bot/123' },
      input: encounter,
      contentType: 'application/fhir+json',
      secrets: {},
    });

    expect(sendEmailSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        html: expect.stringContaining('href="https://example.com/Appointment/"'),
      })
    );
    sendEmailSpy.mockRestore();
  });

  test('Uses provider display name from participant', async () => {
    const medplum = new MockClient();

    const patient: Patient = await medplum.createResource({
      resourceType: 'Patient',
      name: [{ family: 'Smith', given: ['John'] }],
      telecom: [{ system: 'email', value: 'john.smith@example.com' }],
    });

    const encounter: Encounter = await medplum.createResource({
      resourceType: 'Encounter',
      status: 'finished',
      subject: createReference(patient),
      participant: [
        {
          type: [
            {
              coding: [
                {
                  code: 'PPRF',
                  system: 'http://terminology.hl7.org/CodeSystem/v3-ParticipationType',
                  display: 'Primary Performer',
                },
              ],
            },
          ],
          individual: {
            reference: 'Practitioner/123',
            display: 'Dr. Jane Johnson',
          },
        },
      ],
      period: { start: '2024-01-15T10:00:00Z' },
    });

    const sendEmailSpy = vi.spyOn(medplum, 'sendEmail').mockResolvedValue(undefined);

    await handler(medplum, {
      bot: { reference: 'Bot/123' },
      input: encounter,
      contentType: 'application/fhir+json',
      secrets: {},
    });

    expect(sendEmailSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'Follow up from your appointment with Dr. Jane Johnson - Monday, January 15',
      })
    );
    sendEmailSpy.mockRestore();
  });


  test('Formats provider name with prefix, given, and family names when no display field', async () => {
    const medplum = new MockClient();

    const patient: Patient = await medplum.createResource({
      resourceType: 'Patient',
      name: [{ family: 'Smith', given: ['John'] }],
      telecom: [{ system: 'email', value: 'john.smith@example.com' }],
    });

    const practitioner: Practitioner = await medplum.createResource({
      resourceType: 'Practitioner',
      name: [
        {
          prefix: ['Dr.'],
          given: ['Jane', 'Elizabeth'],
          family: 'Johnson',
        },
      ],
    });

    const encounter: Encounter = await medplum.createResource({
      resourceType: 'Encounter',
      status: 'finished',
      subject: createReference(patient),
      participant: [
        {
          type: [
            {
              coding: [
                {
                  code: 'PPRF',
                  system: 'http://terminology.hl7.org/CodeSystem/v3-ParticipationType',
                  display: 'Primary Performer',
                },
              ],
            },
          ],
          individual: {
            reference: `Practitioner/${practitioner.id}`,
          },
        },
      ],
      period: { start: '2024-01-15T10:00:00Z' },
    });

    const sendEmailSpy = vi.spyOn(medplum, 'sendEmail').mockResolvedValue(undefined);

    await handler(medplum, {
      bot: { reference: 'Bot/123' },
      input: encounter,
      contentType: 'application/fhir+json',
      secrets: {},
    });

    expect(sendEmailSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'Follow up from your appointment with Dr. Jane Elizabeth Johnson - Monday, January 15',
      })
    );
    sendEmailSpy.mockRestore();
  });
});
