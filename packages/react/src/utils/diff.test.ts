import { diff } from './diff';

describe('Diff', () => {
  test('diff insert', () => {
    const before = ['a', 'b'];
    const after = ['a', 'c', 'b'];
    const result = diff(before, after);
    expect(result.length).toEqual(1);
    expect(result[0].type).toEqual('insert');
    expect(result[0].original).toMatchObject({
      position: 1,
      lines: [],
    });
    expect(result[0].revised).toMatchObject({
      position: 1,
      lines: ['c'],
    });
  });

  test('diff append', () => {
    const before = ['a', 'b'];
    const after = ['a', 'b', 'c'];
    const result = diff(before, after);
    expect(result.length).toEqual(1);
    expect(result[0].type).toEqual('insert');
    expect(result[0].original).toMatchObject({
      position: 2,
      lines: [],
    });
    expect(result[0].revised).toMatchObject({
      position: 2,
      lines: ['c'],
    });
  });

  test('diff delete', () => {
    const before = ['a', 'b', 'c'];
    const after = ['a', 'b'];
    const result = diff(before, after);
    expect(result.length).toEqual(1);
    expect(result[0].type).toEqual('delete');
    expect(result[0].original).toMatchObject({
      position: 2,
      lines: ['c'],
    });
    expect(result[0].revised).toMatchObject({
      position: 2,
      lines: [],
    });
  });

  test('diff change', () => {
    const before = ['a', 'b', 'c'];
    const after = ['a', 'b', 'd'];
    const result = diff(before, after);
    expect(result.length).toEqual(1);
    expect(result[0].type).toEqual('change');
    expect(result[0].original).toMatchObject({
      position: 2,
      lines: ['c'],
    });
    expect(result[0].revised).toMatchObject({
      position: 2,
      lines: ['d'],
    });
  });
});
