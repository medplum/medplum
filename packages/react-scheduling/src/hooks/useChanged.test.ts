// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { renderHook } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { useChanged } from './useChanged';

describe('useChanged', () => {
  test('Lets a caller adjust state once per change, and not on mount', () => {
    let adjustments = 0;
    const { rerender } = renderHook(
      ({ value }) => {
        const changed = useChanged(value);
        if (changed) {
          adjustments++;
        }
      },
      { initialProps: { value: 'a' } }
    );
    expect(adjustments).toBe(0);

    rerender({ value: 'a' });
    rerender({ value: 'b' });
    rerender({ value: 'b' });
    rerender({ value: 'c' });

    expect(adjustments).toBe(2);
  });
});
