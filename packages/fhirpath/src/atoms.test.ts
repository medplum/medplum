import { evalFhirPath } from '.';
import { LiteralAtom } from './atoms';

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
