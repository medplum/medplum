import { LiteralAtom } from './atoms';
import { evalFhirPath } from './parse';

describe('Atoms', () => {
  test('LiteralAtom', () => {
    expect(new LiteralAtom('a').eval()).toEqual('a');
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
