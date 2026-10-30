// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { LogThrottle } from './logthrottle';

describe('LogThrottle', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test('Logs each key once per window with the suppressed count', () => {
    vi.useFakeTimers();
    const throttle = new LogThrottle(1000);
    const log = vi.fn();

    throttle.maybeLog('a', log);
    throttle.maybeLog('a', log);
    throttle.maybeLog('a', log);
    throttle.maybeLog('b', log);
    expect(log.mock.calls).toStrictEqual([[0], [0]]);

    vi.advanceTimersByTime(1000);
    throttle.maybeLog('a', log);
    throttle.maybeLog('a', log);
    expect(log.mock.calls).toStrictEqual([[0], [0], [2]]);
  });
});
