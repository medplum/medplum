// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { Hl7Message } from '@medplum/core';
import { describe, expect, test } from 'vitest';
import { createMockLogger } from './test-utils';
import type { VirtualChannelField } from './virtual-channel';
import { computeVirtualChannelKey, parseVirtualChannelKeySpec } from './virtual-channel';

/**
 * Parses a spec that the caller knows is valid, failing loudly (rather than
 * returning undefined) if it isn't — keeps the compute tests free of repeated
 * definedness checks without reaching for a non-null assertion.
 * @param spec - A known-valid virtualChannelKey spec.
 * @returns The parsed field paths.
 */
function parseValid(spec: string): VirtualChannelField[] {
  const parsed = parseVirtualChannelKeySpec(spec, createMockLogger());
  if (!parsed) {
    throw new Error(`expected spec '${spec}' to parse`);
  }
  return parsed;
}

// A realistic ADT message: MSH.4 (sending facility) = HOSP1, MSH.9 = ADT^A01,
// PID.3 carries a component/subcomponent for the deeper-path test.
const MESSAGE = Hl7Message.parse(
  [
    'MSH|^~\\&|SENDapp|HOSP1|RECVapp|RECVfac|20240101120000||ADT^A01|MSG001|P|2.5.1',
    'PID|1||123^^^MR^AA&SUB||DOE^JOHN',
  ].join('\r')
);

describe('parseVirtualChannelKeySpec', () => {
  test('empty / whitespace / undefined spec means no partitioning', () => {
    const log = createMockLogger();
    expect(parseVirtualChannelKeySpec('', log)).toEqual([]);
    expect(parseVirtualChannelKeySpec('   ', log)).toEqual([]);
    expect(parseVirtualChannelKeySpec(undefined, log)).toEqual([]);
    expect(log.warn).not.toHaveBeenCalled();
  });

  test('parses a single field path', () => {
    expect(parseVirtualChannelKeySpec('MSH.4', createMockLogger())).toEqual([
      { label: 'MSH.4', segment: 'MSH', field: 4, component: undefined, subcomponent: undefined },
    ]);
  });

  test('parses a multi-field spec with a component', () => {
    expect(parseVirtualChannelKeySpec('MSH.4-MSH.9.2', createMockLogger())).toEqual([
      { label: 'MSH.4', segment: 'MSH', field: 4, component: undefined, subcomponent: undefined },
      { label: 'MSH.9.2', segment: 'MSH', field: 9, component: 2, subcomponent: undefined },
    ]);
  });

  test('parses a subcomponent path and tolerates whitespace around tokens', () => {
    expect(parseVirtualChannelKeySpec(' PID.3.4.2 - MSH.4 ', createMockLogger())).toEqual([
      { label: 'PID.3.4.2', segment: 'PID', field: 3, component: 4, subcomponent: 2 },
      { label: 'MSH.4', segment: 'MSH', field: 4, component: undefined, subcomponent: undefined },
    ]);
  });

  test.each([
    ['MSH', 'no field'],
    ['MSH.0', 'zero field index'],
    ['MSH.-1', 'negative index'],
    ['MSH.x', 'non-numeric field'],
    ['MS.4', 'two-char segment'],
    ['MSHH.4', 'four-char segment'],
    ['msh.4', 'lowercase segment'],
    ['MSH.4.5.6.7', 'too many parts'],
    ['MSH.4-', 'trailing empty field'],
    ['MSH.4-BAD', 'one bad field among good ones'],
  ])('rejects invalid spec %s (%s) and warns, returning undefined', (spec) => {
    const log = createMockLogger();
    expect(parseVirtualChannelKeySpec(spec, log)).toBeUndefined();
    expect(log.warn).toHaveBeenCalledTimes(1);
  });
});

describe('computeVirtualChannelKey', () => {
  test('empty spec yields the single-queue key', () => {
    expect(computeVirtualChannelKey(MESSAGE, [])).toBe('');
  });

  test('computes label:value for a whole field', () => {
    expect(computeVirtualChannelKey(MESSAGE, parseValid('MSH.4'))).toBe('MSH.4:HOSP1');
  });

  test('computes label:value across fields, including a component', () => {
    expect(computeVirtualChannelKey(MESSAGE, parseValid('MSH.4-MSH.9.2'))).toBe('MSH.4:HOSP1-MSH.9.2:A01');
  });

  test('resolves a subcomponent path', () => {
    // PID.3 = 123^^^MR^AA&SUB; component 4 = MR (no subcomponents), so 4.2 is empty,
    // whereas component 5 = AA&SUB, subcomponent 2 = SUB.
    expect(computeVirtualChannelKey(MESSAGE, parseValid('PID.3.4.2'))).toBe('PID.3.4.2:');
    expect(computeVirtualChannelKey(MESSAGE, parseValid('PID.3.5.2'))).toBe('PID.3.5.2:SUB');
  });

  test('missing segment/field contributes an empty value (messages group together)', () => {
    expect(computeVirtualChannelKey(MESSAGE, parseValid('ZZZ.1-MSH.99'))).toBe('ZZZ.1:-MSH.99:');
  });

  test('two messages with the same keyed fields produce the same key', () => {
    const spec = parseValid('MSH.4');
    const other = Hl7Message.parse('MSH|^~\\&|APP2|HOSP1|R|F|20240102||ADT^A02|MSG777|P|2.5.1');
    expect(computeVirtualChannelKey(MESSAGE, spec)).toBe(computeVirtualChannelKey(other, spec));
  });
});
