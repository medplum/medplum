import { PropertyType } from '../types';
import { LiteralAtom } from './atoms';
import { evalFhirPath } from './parse';

describe('Atoms', () => {
  test('LiteralAtom', () => {
    const a = { type: PropertyType.string, value: 'a' };
    expect(new LiteralAtom(a).eval()).toEqual([a]);
  });

  test('ConcatAtom', () => {
    expect(evalFhirPath('{} & {}', [])).toEqual([]);
    expect(evalFhirPath('x & y', [])).toEqual([]);
  });

  test('UnionAtom', () => {
    expect(evalFhirPath('{} | {}', [])).toEqual([]);
    expect(evalFhirPath('x | y', [])).toEqual([]);
  });
});
