// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ProjectMembership } from '@medplum/fhirtypes';
import { describe, expect, test } from 'vitest';
import { hasDoseSpotIdentifier } from './utils';

describe('utils', () => {
  describe('hasDoseSpotIdentifier', () => {
    test('returns true when membership has DoseSpot identifier', () => {
      const membership: ProjectMembership = {
        resourceType: 'ProjectMembership',
        id: 'membership-1',
        identifier: [
          {
            system: 'http://dosespot.com/identifier',
            value: 'dosespot-user-123',
          },
        ],
        project: { id: 'project-1' },
        user: { id: 'user-1' },
        profile: { id: 'profile-1' },
      };

      expect(hasDoseSpotIdentifier(membership)).toBe(true);
    });

    test('returns false when identifier system contains "DOSESPOT" in uppercase (case-sensitive)', () => {
      const membership: ProjectMembership = {
        resourceType: 'ProjectMembership',
        id: 'membership-1',
        identifier: [
          {
            system: 'http://DOSESPOT.COM/identifier',
            value: 'user-123',
          },
        ],
        project: { id: 'project-1' },
        user: { id: 'user-1' },
        profile: { id: 'profile-1' },
      };

      expect(hasDoseSpotIdentifier(membership)).toBe(false);
    });

    test('returns true when identifier system contains "dosespot" as substring', () => {
      const membership: ProjectMembership = {
        resourceType: 'ProjectMembership',
        id: 'membership-1',
        identifier: [
          {
            system: 'http://example.com/dosespot-integration/user',
            value: 'user-123',
          },
        ],
        project: { id: 'project-1' },
        user: { id: 'user-1' },
        profile: { id: 'profile-1' },
      };

      expect(hasDoseSpotIdentifier(membership)).toBe(true);
    });

    test('returns false when membership has no DoseSpot identifier', () => {
      const membership: ProjectMembership = {
        resourceType: 'ProjectMembership',
        id: 'membership-1',
        identifier: [
          {
            system: 'http://example.com/identifier',
            value: 'user-123',
          },
        ],
        project: { id: 'project-1' },
        user: { id: 'user-1' },
        profile: { id: 'profile-1' },
      };

      expect(hasDoseSpotIdentifier(membership)).toBe(false);
    });

    test('returns false when membership has no identifiers', () => {
      const membership: ProjectMembership = {
        resourceType: 'ProjectMembership',
        id: 'membership-1',
        project: { id: 'project-1' },
        user: { id: 'user-1' },
        profile: { id: 'profile-1' },
      };

      expect(hasDoseSpotIdentifier(membership)).toBe(false);
    });

    test('returns false when membership is undefined', () => {
      expect(hasDoseSpotIdentifier(undefined)).toBe(false);
    });

    test('returns false when identifier array is empty', () => {
      const membership: ProjectMembership = {
        resourceType: 'ProjectMembership',
        id: 'membership-1',
        identifier: [],
        project: { id: 'project-1' },
        user: { id: 'user-1' },
        profile: { id: 'profile-1' },
      };

      expect(hasDoseSpotIdentifier(membership)).toBe(false);
    });

    test('returns true when one of multiple identifiers contains "dosespot"', () => {
      const membership: ProjectMembership = {
        resourceType: 'ProjectMembership',
        id: 'membership-1',
        identifier: [
          {
            system: 'http://example.com/identifier',
            value: 'user-123',
          },
          {
            system: 'http://dosespot.com/user',
            value: 'dosespot-user-123',
          },
          {
            system: 'http://other.com/identifier',
            value: 'other-123',
          },
        ],
        project: { id: 'project-1' },
        user: { id: 'user-1' },
        profile: { id: 'profile-1' },
      };

      expect(hasDoseSpotIdentifier(membership)).toBe(true);
    });

    test('handles identifier with undefined system', () => {
      const membership: ProjectMembership = {
        resourceType: 'ProjectMembership',
        id: 'membership-1',
        identifier: [
          {
            system: undefined,
            value: 'user-123',
          },
          {
            system: 'http://dosespot.com/user',
            value: 'dosespot-user-123',
          },
        ],
        project: { id: 'project-1' },
        user: { id: 'user-1' },
        profile: { id: 'profile-1' },
      };

      expect(hasDoseSpotIdentifier(membership)).toBe(true);
    });

    test('handles identifier with null system', () => {
      const membership: ProjectMembership = {
        resourceType: 'ProjectMembership',
        id: 'membership-1',
        identifier: [
          {
            system: null as any,
            value: 'user-123',
          },
        ],
        project: { id: 'project-1' },
        user: { id: 'user-1' },
        profile: { id: 'profile-1' },
      };

      expect(hasDoseSpotIdentifier(membership)).toBe(false);
    });
  });
});
