// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { userMenuMiddlewares } from './userMenuMiddlewares';

type SizeApply = (state: {
  availableHeight: number;
  elements: { floating: { style: { maxHeight?: string } } };
}) => void;

function getSizeApply(): SizeApply {
  const size = userMenuMiddlewares.size;
  if (!size || typeof size === 'boolean' || typeof size.apply !== 'function') {
    throw new Error('userMenuMiddlewares.size.apply is required');
  }
  return size.apply as SizeApply;
}

describe('userMenuMiddlewares', () => {
  test('caps menu height to the available space beside the button', () => {
    const floating = { style: {} as { maxHeight?: string } };
    getSizeApply()({ availableHeight: 432.7, elements: { floating } });
    expect(floating.style.maxHeight).toBe('432px');
  });

  test('clears a stale maxHeight when available height is not usable', () => {
    const floating = { style: { maxHeight: '999px' } };
    getSizeApply()({ availableHeight: 0, elements: { floating } });
    expect(floating.style.maxHeight).toBe('');
  });
});
