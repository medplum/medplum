// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { ActivityDefinition, CodeableConcept, Extension, Schedule } from '@medplum/fhirtypes';
import type { RenderHookResult } from '@testing-library/react';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { useScheduling } from '../hooks/useScheduling';
import type { SchedulingContextValue, SchedulingParametersExtension } from './SchedulingContext';
import { SchedulingContextProvider } from './SchedulingContext';

const SchedulingParametersURI = 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters';

const checkup: CodeableConcept = {
  coding: [{ system: 'http://example.com', code: 'checkup' }],
  text: 'Annual Checkup',
};

const followup: CodeableConcept = {
  coding: [{ system: 'http://example.com', code: 'followup' }],
  text: 'Follow-up Visit',
};

const makeSchedulingParams = (serviceTypes: CodeableConcept[]): SchedulingParametersExtension => ({
  url: SchedulingParametersURI,
  extension: [
    ...serviceTypes.map((st) => ({ url: 'serviceType', valueCodeableConcept: st }) as const),
    { url: 'duration', valueDuration: { value: 30, unit: 'min' } },
  ],
});

const makeSchedule = (id: string, params: Extension[] | undefined): WithId<Schedule> => ({
  resourceType: 'Schedule',
  id,
  actor: [],
  extension: params,
});

type Resources = (ActivityDefinition | Schedule | undefined)[];

const setup = (resources: Resources): RenderHookResult<SchedulingContextValue, void> =>
  renderHook(() => useScheduling(), {
    wrapper: ({ children }) => <SchedulingContextProvider resources={resources}>{children}</SchedulingContextProvider>,
  });

describe('SchedulingContextProvider', () => {
  describe('availableSchedulingParameters', () => {
    test('is empty when the resource has no extension attribute', () => {
      const schedule: Schedule = {
        resourceType: 'Schedule',
        id: 's1',
        actor: [],
      };
      const { result } = setup([schedule]);
      expect(result.current.availableSchedulingParameters).toHaveLength(0);
    });

    test('is empty when resources empty extensions array', () => {
      const { result } = setup([makeSchedule('s1', [])]);
      expect(result.current.availableSchedulingParameters).toHaveLength(0);
    });

    test('extracts SchedulingParameters extensions from a schedule', () => {
      const params = makeSchedulingParams([checkup]);
      const { result } = setup([makeSchedule('s1', [params])]);
      expect(result.current.availableSchedulingParameters).toEqual([params]);
    });

    test('ignores extensions with a different URL', () => {
      const schedule: WithId<Schedule> = {
        resourceType: 'Schedule',
        id: 's1',
        actor: [],
        extension: [{ url: 'https://example.com/other' }, makeSchedulingParams([checkup])],
      };
      const { result } = setup([schedule]);
      expect(result.current.availableSchedulingParameters).toHaveLength(1);
    });

    test('skips undefined resources', () => {
      const { result } = setup([undefined, undefined]);
      expect(result.current.availableSchedulingParameters).toHaveLength(0);
    });

    test('merges extensions across multiple resources', () => {
      // This might not ultimately be the best behavior, but it works for us
      // for now (immediate usage: merging from ActivityDefinition and Schedule
      // resources)
      const s1 = makeSchedule('s1', [makeSchedulingParams([checkup])]);
      const ad1: ActivityDefinition = {
        resourceType: 'ActivityDefinition',
        code: followup,
        status: 'active',
        extension: [makeSchedulingParams([followup])],
      };
      const { result } = setup([s1, ad1]);
      expect(result.current.availableSchedulingParameters).toHaveLength(2);
    });

    test('includes multiple extensions from the same resource', () => {
      const schedule = makeSchedule('s1', [makeSchedulingParams([checkup]), makeSchedulingParams([followup])]);
      const { result } = setup([schedule]);
      expect(result.current.availableSchedulingParameters).toHaveLength(2);
    });
  });

  describe('serviceTypes', () => {
    test('is empty when there are no scheduling parameters', () => {
      const { result } = setup([makeSchedule('s1', [])]);
      expect(result.current.serviceTypes).toHaveLength(0);
    });

    test('produces one option per serviceType sub-extension', () => {
      const { result } = setup([makeSchedule('s1', [makeSchedulingParams([checkup, followup])])]);
      expect(result.current.serviceTypes).toHaveLength(2);
      expect(result.current.serviceTypes[0].serviceType).toEqual(checkup);
      expect(result.current.serviceTypes[1].serviceType).toEqual(followup);
    });

    test('each option references its parent schedulingParameters', () => {
      const params = makeSchedulingParams([checkup, followup]);
      const { result } = setup([makeSchedule('s1', [params])]);
      for (const option of result.current.serviceTypes) {
        expect(option.schedulingParameters).toEqual(params);
      }
    });

    test('produces a wildcard option (serviceType: undefined) when there are no serviceType sub-extensions', () => {
      const params = { url: SchedulingParametersURI, extension: [] };
      const { result } = setup([makeSchedule('s1', [params])]);
      expect(result.current.serviceTypes).toHaveLength(1);
      expect(result.current.serviceTypes[0].serviceType).toBeUndefined();
    });

    test('each option has a unique string id', () => {
      const { result } = setup([makeSchedule('s1', [makeSchedulingParams([checkup, followup])])]);
      const ids = result.current.serviceTypes.map((st) => st.id);
      expect(ids.every((id) => typeof id === 'string')).toBe(true);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe('selectedSchedulingParameters', () => {
    test('is undefined initially', () => {
      const { result } = setup([makeSchedule('s1', [makeSchedulingParams([checkup])])]);
      expect(result.current.selectedSchedulingParameters).toBeUndefined();
    });

    test('updates when setSelectedSchedulingParameters is called', () => {
      const { result } = setup([makeSchedule('s1', [makeSchedulingParams([checkup])])]);
      const params = result.current.availableSchedulingParameters[0];

      act(() => {
        result.current.setSelectedSchedulingParameters(params);
      });

      expect(result.current.selectedSchedulingParameters).toBe(params);
    });

    test('can be reset to undefined', () => {
      const { result } = setup([makeSchedule('s1', [makeSchedulingParams([checkup])])]);
      const params = result.current.availableSchedulingParameters[0];

      act(() => {
        result.current.setSelectedSchedulingParameters(params);
      });
      act(() => {
        result.current.setSelectedSchedulingParameters(undefined);
      });

      expect(result.current.selectedSchedulingParameters).toBeUndefined();
    });
  });
});
