// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { act, renderHook } from '@testing-library/react';
import { useDebouncedValue } from './useDebouncedValue';

describe('useDebouncedValue', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('returns initial value immediately', () => {
    const { result } = renderHook(() => useDebouncedValue('initial', 200));
    expect(result.current[0]).toBe('initial');
  });

  test('debounces value updates by waitMs', () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 200), {
      initialProps: { value: 'a' },
    });

    rerender({ value: 'b' });
    expect(result.current[0]).toBe('a');

    act(() => {
      jest.advanceTimersByTime(200);
    });
    expect(result.current[0]).toBe('b');
  });

  test('only applies the last value when updated rapidly', () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 200), {
      initialProps: { value: 'a' },
    });

    rerender({ value: 'b' });
    rerender({ value: 'c' });
    rerender({ value: 'd' });

    act(() => {
      jest.advanceTimersByTime(200);
    });
    expect(result.current[0]).toBe('d');
  });

  test('cancel prevents the pending update', () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 200), {
      initialProps: { value: 'a' },
    });

    rerender({ value: 'b' });
    act(() => {
      result.current[1](); // cancel
    });

    act(() => {
      jest.advanceTimersByTime(200);
    });
    expect(result.current[0]).toBe('a');
  });

  test('leading: true fires the first update immediately', () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 200, { leading: true }), {
      initialProps: { value: 'a' },
    });

    rerender({ value: 'b' });
    expect(result.current[0]).toBe('b');
  });

  test('leading: true suppresses subsequent rapid updates until cooldown elapses', () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 200, { leading: true }), {
      initialProps: { value: 'a' },
    });

    rerender({ value: 'b' });
    expect(result.current[0]).toBe('b'); // leading edge fires immediately

    rerender({ value: 'c' });
    expect(result.current[0]).toBe('b'); // still in cooldown — 'c' is queued

    act(() => {
      jest.advanceTimersByTime(200);
    });
    expect(result.current[0]).toBe('c'); // queued value applied after cooldown
  });

  test('leading: true resets cooldown after waitMs', () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 200, { leading: true }), {
      initialProps: { value: 'a' },
    });

    // First burst — leading edge fires 'b' immediately
    rerender({ value: 'b' });
    expect(result.current[0]).toBe('b');

    // Let the full cooldown elapse with no further updates
    act(() => {
      jest.advanceTimersByTime(200);
    });
    // Cooldown should now be reset; the debounced value stays 'b' (no pending update)
    expect(result.current[0]).toBe('b');

    // Second burst — should also fire on the leading edge, immediately
    rerender({ value: 'c' });
    expect(result.current[0]).toBe('c');
  });
});
