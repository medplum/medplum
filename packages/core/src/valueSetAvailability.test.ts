// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ValueSet } from '@medplum/fhirtypes';
import { vi } from 'vitest';
import { MockMedplumClient } from './client-test-utils';
import { badRequest, notFound, OperationOutcomeError, serverError, tooManyRequests } from './outcomes';
import {
  checkValueSetAvailability,
  getValueSetAvailability,
  isValueSetUnavailable,
  subscribeToValueSetAvailability,
} from './valueSetAvailability';

const URL = 'http://example.com/ValueSet/missing';
const AVAILABLE_VS = { resourceType: 'ValueSet' } as ValueSet;

describe('valueSetAvailability', () => {
  test('unbound binding is always available and never probes', async () => {
    const medplum = new MockMedplumClient();
    const spy = vi.spyOn(medplum, 'valueSetExpand');
    expect(getValueSetAvailability(medplum, undefined)).toEqual({ status: 'available' });
    expect(isValueSetUnavailable(medplum, undefined)).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  test('unknown binding reports checking without a cached probe', () => {
    const medplum = new MockMedplumClient();
    expect(getValueSetAvailability(medplum, URL)).toEqual({ status: 'checking' });
  });

  test('probes once and reports available', async () => {
    const medplum = new MockMedplumClient();
    const spy = vi.spyOn(medplum, 'valueSetExpand').mockResolvedValue(AVAILABLE_VS);
    expect(await checkValueSetAvailability(medplum, URL)).toEqual({ status: 'available' });
    expect(isValueSetUnavailable(medplum, URL)).toBe(false);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  test('concurrent checks share a single probe', async () => {
    const medplum = new MockMedplumClient();
    const spy = vi.spyOn(medplum, 'valueSetExpand').mockResolvedValue(AVAILABLE_VS);
    const [a, b] = await Promise.all([
      checkValueSetAvailability(medplum, URL),
      checkValueSetAvailability(medplum, URL),
    ]);
    expect(a).toEqual({ status: 'available' });
    expect(b).toEqual({ status: 'available' });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  test('an available verdict is not re-probed', async () => {
    const medplum = new MockMedplumClient();
    const spy = vi.spyOn(medplum, 'valueSetExpand').mockResolvedValue(AVAILABLE_VS);
    await checkValueSetAvailability(medplum, URL);
    await checkValueSetAvailability(medplum, URL);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  test('a 400 marks the value set unavailable with the error message', async () => {
    const medplum = new MockMedplumClient();
    vi.spyOn(medplum, 'valueSetExpand').mockRejectedValue(new OperationOutcomeError(badRequest('ValueSet not found')));
    expect(await checkValueSetAvailability(medplum, URL)).toEqual({
      status: 'unavailable',
      message: 'ValueSet not found',
    });
    expect(isValueSetUnavailable(medplum, URL)).toBe(true);
  });

  test('a 404 marks the value set unavailable', async () => {
    const medplum = new MockMedplumClient();
    vi.spyOn(medplum, 'valueSetExpand').mockRejectedValue(new OperationOutcomeError(notFound));
    expect((await checkValueSetAvailability(medplum, URL)).status).toBe('unavailable');
  });

  test('a transient 429 leaves the verdict checking and re-probes on the next check', async () => {
    const medplum = new MockMedplumClient();
    const spy = vi.spyOn(medplum, 'valueSetExpand').mockResolvedValue(AVAILABLE_VS);
    spy.mockRejectedValueOnce(new OperationOutcomeError(tooManyRequests));
    expect((await checkValueSetAvailability(medplum, URL)).status).toBe('checking');
    expect((await checkValueSetAvailability(medplum, URL)).status).toBe('available');
    expect(spy).toHaveBeenCalledTimes(2);
  });

  test('a transient 5xx leaves the verdict checking', async () => {
    const medplum = new MockMedplumClient();
    vi.spyOn(medplum, 'valueSetExpand').mockRejectedValue(new OperationOutcomeError(serverError(new Error('boom'))));
    expect((await checkValueSetAvailability(medplum, URL)).status).toBe('checking');
  });

  test('notifies subscribed listeners when the verdict changes', async () => {
    const medplum = new MockMedplumClient();
    vi.spyOn(medplum, 'valueSetExpand').mockRejectedValue(new OperationOutcomeError(badRequest('missing')));
    const listener = vi.fn();
    subscribeToValueSetAvailability(medplum, URL, listener);
    await checkValueSetAvailability(medplum, URL); // awaits the same in-flight probe
    expect(listener).toHaveBeenCalledTimes(1);
    expect(getValueSetAvailability(medplum, URL)).toEqual({ status: 'unavailable', message: 'missing' });
  });

  test('stops notifying after unsubscribe', async () => {
    const medplum = new MockMedplumClient();
    vi.spyOn(medplum, 'valueSetExpand').mockRejectedValue(new OperationOutcomeError(badRequest('missing')));
    const listener = vi.fn();
    const unsubscribe = subscribeToValueSetAvailability(medplum, URL, listener);
    unsubscribe(); // remove the listener before the async probe resolves
    await checkValueSetAvailability(medplum, URL);
    expect(listener).not.toHaveBeenCalled();
  });

  test('subscribing to an unbound binding is a no-op', () => {
    const medplum = new MockMedplumClient();
    const spy = vi.spyOn(medplum, 'valueSetExpand');
    const listener = vi.fn();
    const unsubscribe = subscribeToValueSetAvailability(medplum, undefined, listener);
    unsubscribe();
    expect(spy).not.toHaveBeenCalled();
    expect(listener).not.toHaveBeenCalled();
  });

  test('an unavailable verdict recovers after the retry interval', async () => {
    vi.useFakeTimers();
    try {
      const medplum = new MockMedplumClient();
      const spy = vi.spyOn(medplum, 'valueSetExpand');
      spy.mockRejectedValue(new OperationOutcomeError(notFound));
      expect((await checkValueSetAvailability(medplum, URL)).status).toBe('unavailable');

      // Within the retry interval, the latched verdict is trusted and not re-probed
      expect((await checkValueSetAvailability(medplum, URL)).status).toBe('unavailable');
      expect(spy).toHaveBeenCalledTimes(1);

      // The value set is imported and the interval elapses, so the next check re-probes and recovers
      spy.mockResolvedValue(AVAILABLE_VS);
      vi.advanceTimersByTime(60_001);
      expect((await checkValueSetAvailability(medplum, URL)).status).toBe('available');
      expect(spy).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  test('availability is isolated per client', async () => {
    const clientA = new MockMedplumClient();
    const clientB = new MockMedplumClient();
    vi.spyOn(clientA, 'valueSetExpand').mockRejectedValue(new OperationOutcomeError(badRequest('missing')));
    vi.spyOn(clientB, 'valueSetExpand').mockResolvedValue(AVAILABLE_VS);
    expect((await checkValueSetAvailability(clientA, URL)).status).toBe('unavailable');
    expect((await checkValueSetAvailability(clientB, URL)).status).toBe('available');
  });
});
