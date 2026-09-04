// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { render, renderHook } from '@testing-library/react';
import type { JSX } from 'react';
import { useEffect } from 'react';
import { useStabilizedCallback } from './useStabilizedCallback';

describe('useStabilizedCallback', () => {
  test('returns the same function across rerenders', () => {
    const { result, rerender } = renderHook(({ callback }) => useStabilizedCallback(callback), {
      initialProps: { callback: (): void => undefined },
    });

    const first = result.current;
    rerender({ callback: (): void => undefined });
    rerender({ callback: (): void => undefined });
    expect(result.current).toBe(first);
  });

  test('invokes the most recent callback', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { result, rerender } = renderHook(({ callback }) => useStabilizedCallback(callback), {
      initialProps: { callback: first },
    });

    result.current();
    expect(first).toHaveBeenCalledTimes(1);

    rerender({ callback: second });
    result.current();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  test('forwards arguments and return value', () => {
    const { result } = renderHook(() => useStabilizedCallback((a: number, b: string) => `${a}-${b}`));
    expect(result.current(1, 'two')).toBe('1-two');
  });

  test('is callable when the callback is undefined', () => {
    const { result } = renderHook(() => useStabilizedCallback<[], string>(undefined));
    // The wrapper is always defined, so it can never be used as a "was a handler provided?" signal.
    expect(typeof result.current).toBe('function');
    expect(result.current()).toBeUndefined();
  });

  test('handles a callback that becomes defined and then undefined', () => {
    const callback = vi.fn();
    const { result, rerender } = renderHook(
      ({ callback }: { callback: (() => void) | undefined }) => useStabilizedCallback(callback),
      { initialProps: { callback: undefined as (() => void) | undefined } }
    );

    result.current();
    expect(callback).not.toHaveBeenCalled();

    rerender({ callback });
    result.current();
    expect(callback).toHaveBeenCalledTimes(1);

    rerender({ callback: undefined });
    result.current();
    expect(callback).toHaveBeenCalledTimes(1);
  });

  test('is current when invoked from a descendant effect in the same commit', () => {
    // Child effects flush before parent effects, so updating the ref in a useEffect would leave
    // the child calling the previous render's callback.
    function Child({ fire }: { fire: () => void }): JSX.Element {
      useEffect(() => {
        fire();
      });
      return <div />;
    }

    function Parent({ onEvent }: { onEvent: () => void }): JSX.Element {
      return <Child fire={useStabilizedCallback(onEvent)} />;
    }

    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(<Parent onEvent={first} />);
    expect(first).toHaveBeenCalledTimes(1);

    rerender(<Parent onEvent={second} />);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });
});
