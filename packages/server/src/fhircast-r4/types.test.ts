// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import {
  getEventCategory,
  subscriberWantsEvent,
  isFhircastMessagePayload,
  isSubscriberResponse,
  RedisKeys,
  parseProjectAndTopic,
} from './types';

describe('FHIRcast R4 types', () => {
  describe('getEventCategory', () => {
    test('open events', () => {
      expect(getEventCategory('Patient-open')).toBe('open');
      expect(getEventCategory('DiagnosticReport-open')).toBe('open');
      expect(getEventCategory('ImagingStudy-open')).toBe('open');
      expect(getEventCategory('Encounter-open')).toBe('open');
    });

    test('close events', () => {
      expect(getEventCategory('Patient-close')).toBe('close');
      expect(getEventCategory('DiagnosticReport-close')).toBe('close');
    });

    test('update events', () => {
      expect(getEventCategory('DiagnosticReport-update')).toBe('update');
    });

    test('select events', () => {
      expect(getEventCategory('DiagnosticReport-select')).toBe('select');
    });

    test('other events', () => {
      expect(getEventCategory('syncerror')).toBe('other');
      expect(getEventCategory('heartbeat')).toBe('other');
      expect(getEventCategory('userlogout')).toBe('other');
    });
  });

  describe('subscriberWantsEvent', () => {
    test('single event match', () => {
      expect(subscriberWantsEvent('Patient-open', 'Patient-open')).toBe(true);
    });

    test('single event no match', () => {
      expect(subscriberWantsEvent('Patient-open', 'Patient-close')).toBe(false);
    });

    test('multiple events match', () => {
      expect(subscriberWantsEvent('Patient-open,Patient-close', 'Patient-close')).toBe(true);
    });

    test('case insensitive', () => {
      expect(subscriberWantsEvent('patient-open', 'Patient-open')).toBe(true);
      expect(subscriberWantsEvent('Patient-open', 'patient-open')).toBe(true);
    });

    test('with spaces', () => {
      expect(subscriberWantsEvent('Patient-open, Patient-close', 'Patient-close')).toBe(true);
    });
  });

  describe('isFhircastMessagePayload', () => {
    test('valid payload', () => {
      expect(
        isFhircastMessagePayload({
          timestamp: '2024-01-01T00:00:00Z',
          id: 'test-id',
          event: {
            'hub.topic': 'test-topic',
            'hub.event': 'Patient-open',
            context: [],
          },
        })
      ).toBe(true);
    });

    test('null', () => {
      expect(isFhircastMessagePayload(null)).toBe(false);
    });

    test('missing fields', () => {
      expect(isFhircastMessagePayload({ id: 'test' })).toBe(false);
      expect(isFhircastMessagePayload({ timestamp: '2024', id: 'test' })).toBe(false);
    });

    test('missing event fields', () => {
      expect(
        isFhircastMessagePayload({
          timestamp: '2024',
          id: 'test',
          event: { 'hub.topic': 'topic' },
        })
      ).toBe(false);
    });
  });

  describe('isSubscriberResponse', () => {
    test('valid response', () => {
      expect(isSubscriberResponse({ id: 'test-id', status: '200' })).toBe(true);
    });

    test('invalid - missing id', () => {
      expect(isSubscriberResponse({ status: '200' })).toBe(false);
    });

    test('invalid - missing status', () => {
      expect(isSubscriberResponse({ id: 'test-id' })).toBe(false);
    });

    test('invalid - non-string status', () => {
      expect(isSubscriberResponse({ id: 'test-id', status: 200 })).toBe(false);
    });

    test('null', () => {
      expect(isSubscriberResponse(null)).toBe(false);
    });
  });

  describe('RedisKeys', () => {
    test('topicSubscribers', () => {
      expect(RedisKeys.topicSubscribers('proj1', 'topic1')).toBe(
        'medplum:fhircast-r4:project:proj1:topic:topic1:subs'
      );
    });

    test('endpointMapping', () => {
      expect(RedisKeys.endpointMapping('ep1')).toBe('medplum:fhircast-r4:endpoint:ep1:topic');
    });

    test('topicCurrentContext', () => {
      expect(RedisKeys.topicCurrentContext('proj1', 'topic1')).toBe(
        'medplum:fhircast-r4:project:proj1:topic:topic1:latest'
      );
    });

    test('topicChannel', () => {
      expect(RedisKeys.topicChannel('proj1', 'topic1')).toBe('fhircast-r4:proj1:topic1');
    });

    test('keys do not collide with old hub', () => {
      const oldKey = 'medplum:fhircast:project:proj1:topic:topic1:latest';
      const newKey = RedisKeys.topicCurrentContext('proj1', 'topic1');
      expect(newKey).not.toBe(oldKey);
      expect(newKey).toContain('fhircast-r4');
    });
  });

  describe('parseProjectAndTopic', () => {
    test('valid string', () => {
      expect(parseProjectAndTopic('proj1:topic1')).toEqual({
        projectId: 'proj1',
        topic: 'topic1',
      });
    });

    test('topic with colon', () => {
      expect(parseProjectAndTopic('proj1:topic:with:colons')).toEqual({
        projectId: 'proj1',
        topic: 'topic:with:colons',
      });
    });

    test('no colon', () => {
      expect(parseProjectAndTopic('nocolon')).toBeUndefined();
    });
  });
});
