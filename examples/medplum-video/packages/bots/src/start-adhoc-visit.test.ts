// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { ContentType } from '@medplum/core';
import type { Bot, Reference } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { expect, test } from 'vitest';
import { handler } from './start-adhoc-visit';
import { EXT } from './constants';

const bot: Reference<Bot> = { reference: 'Bot/123' };
const contentType = ContentType.FHIR_JSON;
const secrets = {};

test('Creates ad-hoc encounter with arrived status', async () => {
  const medplum = new MockClient();
  const result = await handler(medplum, {
    bot,
    input: { patientId: 'pt-1', practitionerId: 'pr-1' },
    contentType,
    secrets,
  });

  expect(result.resourceType).toBe('Encounter');
  expect(result.status).toBe('arrived');
  expect(result.class?.code).toBe('VR');
  expect(result.subject?.reference).toBe('Patient/pt-1');
  expect(result.participant?.[0]?.individual?.reference).toBe('Practitioner/pr-1');

  const mode = result.extension?.find((e) => e.url === EXT.visitMode)?.valueCode;
  expect(mode).toBe('ad-hoc');
});

test('Sets custom grace period', async () => {
  const medplum = new MockClient();
  const result = await handler(medplum, {
    bot,
    input: { patientId: 'pt-1', practitionerId: 'pr-1', gracePeriodMinutes: 30 },
    contentType,
    secrets,
  });

  const gp = result.extension?.find((e) => e.url === EXT.gracePeriod)?.valueInteger;
  expect(gp).toBe(30);
});

test('Uses default grace period of 15', async () => {
  const medplum = new MockClient();
  const result = await handler(medplum, {
    bot,
    input: { patientId: 'pt-1', practitionerId: 'pr-1' },
    contentType,
    secrets,
  });

  const gp = result.extension?.find((e) => e.url === EXT.gracePeriod)?.valueInteger;
  expect(gp).toBe(15);
});

test('Sets reason when provided', async () => {
  const medplum = new MockClient();
  const result = await handler(medplum, {
    bot,
    input: { patientId: 'pt-1', practitionerId: 'pr-1', reason: 'Urgent follow-up' },
    contentType,
    secrets,
  });

  expect(result.reasonCode?.[0]?.text).toBe('Urgent follow-up');
});

test('Omits reasonCode when reason not provided', async () => {
  const medplum = new MockClient();
  const result = await handler(medplum, {
    bot,
    input: { patientId: 'pt-1', practitionerId: 'pr-1' },
    contentType,
    secrets,
  });

  expect(result.reasonCode).toBeUndefined();
});

test('Sets period start to current time', async () => {
  const medplum = new MockClient();
  const before = new Date().toISOString();
  const result = await handler(medplum, {
    bot,
    input: { patientId: 'pt-1', practitionerId: 'pr-1' },
    contentType,
    secrets,
  });
  const after = new Date().toISOString();

  const start = result.period?.start;
  expect(start).toBeDefined();
  if (start) {
    expect(start >= before).toBe(true);
    expect(start <= after).toBe(true);
  }
});
