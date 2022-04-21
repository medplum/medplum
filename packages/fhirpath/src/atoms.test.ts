import { LiteralAtom } from './atoms';
import { evalFhirPath } from './parse';

describe('Atoms', () => {
  test('LiteralAtom (string)', () => {
    expect(new LiteralAtom('a').eval()).toEqual('a');
  });

  test('LiteralAtom (int)', () => {
    expect(new LiteralAtom('42').eval()).toEqual(42);
  });

  test('ConcatAtom', () => {
    expect(evalFhirPath('{} & {}', null)).toEqual([]);
    expect(evalFhirPath('x & y', null)).toEqual([]);
  });

  test('UnionAtom', () => {
    expect(evalFhirPath('{} | {}', null)).toEqual([]);
    expect(evalFhirPath('x | y', null)).toEqual([]);
  });
});
