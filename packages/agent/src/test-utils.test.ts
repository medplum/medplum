// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { sleep } from '@medplum/core';
import { waitFor } from './test-utils';

/**
 * Blocks the event loop for `ms`, standing in for a GC pause or a synchronous flush.
 * @param ms - How long to block for.
 */
function stall(ms: number): void {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    // Spin: the point is that nothing else, including waitFor's poll, gets to run.
  }
}

describe('waitFor', () => {
  test('Returns once the predicate holds', async () => {
    let satisfied = false;
    setTimeout(() => (satisfied = true), 50);
    await expect(waitFor(() => satisfied, 1000, 'condition')).resolves.toBeUndefined();
  });

  test('Throws with the label when the predicate never holds', async () => {
    await expect(waitFor(() => false, 50, 'condition')).rejects.toThrow('waitFor: condition not satisfied after 50ms');
  });

  test('Throws without a label when none is given', async () => {
    await expect(waitFor(() => false, 50)).rejects.toThrow('waitFor timed out after 50ms');
  });

  test('Propagates an error thrown by the predicate', async () => {
    await expect(
      waitFor(() => {
        throw new Error('observed failure');
      }, 1000)
    ).rejects.toThrow('observed failure');
  });

  test('A stall past the deadline does not fail an already-satisfied condition', async () => {
    let satisfied = false;
    setImmediate(() => {
      stall(150);
      satisfied = true;
    });
    await expect(waitFor(() => satisfied, 100, 'condition')).resolves.toBeUndefined();
  });

  test('Stalled time is not charged against the budget', async () => {
    let satisfied = false;
    setImmediate(() => {
      stall(150);
      // Satisfied only after a further turn of the event loop, so the budget must survive
      // the stall for this to be seen at all.
      sleep(20)
        .then(() => (satisfied = true))
        .catch(() => undefined);
    });
    await expect(waitFor(() => satisfied, 100, 'condition')).resolves.toBeUndefined();
  });
});
