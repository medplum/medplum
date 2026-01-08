// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { partition } from './utils';

interface SpecialThing {
  type: 'special';
}

function isSpecialThing(obj: any): obj is SpecialThing {
  if (!obj) {
    return false;
  }

  return obj.type === 'special';
}

describe('partition', () => {
  test('correctly partitions based on predicate', () => {
    const notSpecialThings = [undefined, null, Object.create(null), { name: 'not-special' }];

    const specialThings = [
      { name: 'special1', type: 'special' },
      { name: 'special2', type: 'special' },
    ];
    const allThings: any[] = [...notSpecialThings, ...specialThings];

    const results = partition(allThings, isSpecialThing);
    const specialOutput: SpecialThing[] = results[0];
    const anyOutput: any[] = results[1];

    expect(specialOutput.length).toStrictEqual(specialThings.length);
    expect(specialOutput).toStrictEqual(expect.arrayContaining(specialThings));

    expect(anyOutput.length).toStrictEqual(notSpecialThings.length);
    expect(anyOutput).toStrictEqual(expect.arrayContaining(notSpecialThings));
  });
});
