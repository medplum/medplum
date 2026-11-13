// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from 'vitest';
import { CONTRACTS, validateContract } from './contracts';

test('six type-level contracts distinguish reads and mutations', () => {
  expect(Object.keys(CONTRACTS)).toHaveLength(6);
  for (const [name, { definition }] of Object.entries(CONTRACTS)) {
    expect(definition).toMatchObject({ system: false, type: true, instance: false, affectsState: name !== 'status' });
    expect(definition.parameter?.some((p) => p.use === 'out')).toBe(true);
  }
});
test.each([
  ['connect', undefined],
  ['settings', { resourceType: 'Parameters', parameter: [{ name: 'eventDetailLevel', valueBoolean: true }] }],
  [
    'settings',
    { resourceType: 'Parameters', parameter: [{ name: 'eventDetailLevel', valueString: 'full-with-invite' }] },
  ],
  [
    'settings',
    {
      resourceType: 'Parameters',
      parameter: [
        { name: 'eventDetailLevel', valueString: 'full' },
        { name: 'eventDetailLevel', valueString: 'busy-only' },
      ],
    },
  ],
  [
    'status',
    {
      resourceType: 'Parameters',
      parameter: [{ name: 'practitioner', valueReference: { reference: 'Practitioner/other' } }],
    },
  ],
  ['disconnect', { resourceType: 'Parameters', parameter: [{ name: 'forgetRevoked', valueString: 'true' }] }],
])('rejects invalid %s inputs', (name, input) => {
  expect(() => validateContract(name, 'in', input)).toThrow();
});
test('validates output parts and cardinalities rather than returning unchecked Parameters', () => {
  expect(() =>
    validateContract('status', 'out', {
      resourceType: 'Parameters',
      parameter: [{ name: 'connected', valueString: 'true' }],
    })
  ).toThrow();
  expect(() =>
    validateContract('sync', 'out', { resourceType: 'Parameters', parameter: [{ name: 'queued', valueBoolean: true }] })
  ).toThrow();
  expect(() =>
    validateContract('status', 'out', {
      resourceType: 'Parameters',
      parameter: [
        { name: 'connected', valueBoolean: true },
        { name: 'conflict', part: [{ name: 'key', valueString: 'x' }] },
      ],
    })
  ).toThrow();
});
