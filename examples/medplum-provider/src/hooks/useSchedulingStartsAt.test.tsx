// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { renderHook, act } from '@testing-library/react';
import { describe, expect, test, beforeEach, afterEach, vi } from 'vitest';
import { useSchedulingStartsAt } from './useSchedulingStartsAt';

describe('useSchedulingStartsAt', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('returns a date minimumNoticeMinutes in the future', () => {
    const now = new Date('2024-01-15T10:00:00Z');
    vi.setSystemTime(now);

    const { result } = renderHook(() => useSchedulingStartsAt({ minimumNoticeMinutes: 30 }));

    const expectedTime = now.getTime() + 30 * 60 * 1000;
    expect(result.current.getTime()).toBe(expectedTime);
  });

  test('the result is stable for up to one minute', () => {
    const { result } = renderHook(() => useSchedulingStartsAt({ minimumNoticeMinutes: 30 }));
    const initialDate = result.current;

    // Advance time by less than one minute
    act(() => {
      vi.advanceTimersByTime(58 * 1000);
    });

    expect(result.current).toBe(initialDate);
  });

  test('updates the date after one minute', () => {
    const now = new Date('2024-01-15T10:00:00Z');
    vi.setSystemTime(now);

    const { result } = renderHook(() => useSchedulingStartsAt({ minimumNoticeMinutes: 15 }));

    const initialTime = result.current.getTime();

    // Advance time by one minute
    act(() => {
      vi.advanceTimersByTime(60 * 1000);
    });

    // The new value should be 1 minute later than the initial value
    expect(result.current.getTime()).toBe(initialTime + 60 * 1000);
  });

  test('works with different minimumNoticeMinutes values', () => {
    const now = new Date('2024-01-15T10:00:00Z');
    vi.setSystemTime(now);

    const { result: result5 } = renderHook(() => useSchedulingStartsAt({ minimumNoticeMinutes: 5 }));
    const { result: result60 } = renderHook(() => useSchedulingStartsAt({ minimumNoticeMinutes: 60 }));

    expect(result5.current.getTime()).toBe(now.getTime() + 5 * 60 * 1000);
    expect(result60.current.getTime()).toBe(now.getTime() + 60 * 60 * 1000);
  });

  test('updates multiple times as time passes', () => {
    const now = new Date('2024-01-15T10:00:00Z');
    vi.setSystemTime(now);

    const { result } = renderHook(() => useSchedulingStartsAt({ minimumNoticeMinutes: 10 }));

    const initialTime = result.current.getTime();

    // Advance time by 3 minutes
    act(() => {
      vi.advanceTimersByTime(60 * 1000);
    });
    expect(result.current.getTime()).toBe(initialTime + 60 * 1000);

    act(() => {
      vi.advanceTimersByTime(60 * 1000);
    });
    expect(result.current.getTime()).toBe(initialTime + 2 * 60 * 1000);

    act(() => {
      vi.advanceTimersByTime(60 * 1000);
    });
    expect(result.current.getTime()).toBe(initialTime + 3 * 60 * 1000);
  });

  test('cleans up interval on unmount', () => {
    const clearIntervalSpy = vi.spyOn(global, 'clearInterval');

    const { unmount } = renderHook(() => useSchedulingStartsAt({ minimumNoticeMinutes: 30 }));

    unmount();

    expect(clearIntervalSpy).toHaveBeenCalled();
    clearIntervalSpy.mockRestore();
  });

  test('handles zero minimumNoticeMinutes', () => {
    const now = new Date('2024-01-15T10:00:00Z');
    vi.setSystemTime(now);

    const { result } = renderHook(() => useSchedulingStartsAt({ minimumNoticeMinutes: 0 }));

    expect(result.current.getTime()).toBe(now.getTime());
  });
});
