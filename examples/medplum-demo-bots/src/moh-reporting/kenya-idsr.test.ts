// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from 'vitest';
import {
  KENYA_IDSR_REVIEW_TASK_CODE,
  createIdsrOruSenderSubscription,
  createKenyaIdsrAccessPolicy,
  createReportabilityCheckSubscription,
} from './kenya-idsr';

describe('Kenya IDSR resource factories', () => {
  test('creates least-privilege AccessPolicy for IDSR reporting bots', () => {
    const accessPolicy = createKenyaIdsrAccessPolicy();

    expect(accessPolicy).toMatchObject({
      resourceType: 'AccessPolicy',
      name: 'Kenya MOH IDSR Reporting Bot Policy',
    });
    expect(accessPolicy.resource).toEqual(
      expect.arrayContaining([
        { resourceType: 'Patient', interaction: ['read', 'search'] },
        { resourceType: 'Observation', interaction: ['read', 'search'] },
        { resourceType: 'DiagnosticReport', interaction: ['read', 'search'] },
        { resourceType: 'GuidanceResponse', interaction: ['create', 'read', 'search'] },
        { resourceType: 'Task', interaction: ['create', 'read', 'search'] },
        { resourceType: 'Communication', interaction: ['create', 'read', 'search'] },
      ])
    );
  });

  test('creates reportability-check Subscription targeting the detection bot', () => {
    const subscription = createReportabilityCheckSubscription('reportability-bot-id');

    expect(subscription).toMatchObject({
      resourceType: 'Subscription',
      status: 'active',
      criteria: 'DiagnosticReport?status=final',
      channel: {
        type: 'rest-hook',
        endpoint: 'Bot/reportability-bot-id/$execute',
        payload: 'application/fhir+json',
      },
    });
  });

  test('creates ORU sender Subscription targeting completed IDSR review tasks', () => {
    const subscription = createIdsrOruSenderSubscription('oru-sender-bot-id');

    expect(subscription).toMatchObject({
      resourceType: 'Subscription',
      status: 'active',
      criteria: `Task?status=completed&code=${KENYA_IDSR_REVIEW_TASK_CODE}`,
      channel: {
        type: 'rest-hook',
        endpoint: 'Bot/oru-sender-bot-id/$execute',
        payload: 'application/fhir+json',
      },
    });
  });
});
