import { act, renderHook } from '@testing-library/react';
import useCallbackState from './useCallbackState';

describe('useCallbackState', () => {
  test('updating state without a callback', () => {
    const { result } = renderHook(useCallbackState, { initialProps: { initialState: 5 } });
    expect(result.current[0] === 5);

    act(() => result.current[1](42));
    expect(result.current[0] === 42);
  });

  test('updating state with a callback', () => {
    const { result } = renderHook(useCallbackState, { initialProps: { initialState: 5 } });
    expect(result.current[0] === 5);

    const callback = jest.fn();

    // set state without callback works as expected
    act(() => result.current[1](42, callback));
    expect(result.current[0] === 42);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenLastCalledWith(42);

    act(() => result.current[1](101, callback));
    expect(result.current[0] === 101);
    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenLastCalledWith(101);

    // set state without a callback again; callback should not be called again
    act(() => result.current[1](999));
    expect(result.current[0] === 999);
    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback).not.toHaveBeenCalledWith(999);
  });
});
