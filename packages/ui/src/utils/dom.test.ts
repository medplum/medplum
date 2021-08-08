import { getRange, getRangeBounds, indexOfNode, killEvent } from './dom';

describe('DOM utils', () => {

  test('killEvent', () => {
    const e = {
      preventDefault: jest.fn(),
      stopPropagation: jest.fn()
    };

    killEvent(e as any);
    expect(e.preventDefault).toBeCalled();
    expect(e.stopPropagation).toBeCalled();
  });

  test('getRange', () => {
    window.getSelection = (() => undefined) as any;
    expect(getRange()).toBeUndefined();

    window.getSelection = (() => ({ rangeCount: 0 })) as any;
    expect(getRange()).toBeUndefined();

    window.getSelection = (() => ({ rangeCount: 1, getRangeAt: () => 'xyz' })) as any;
    expect(getRange()).toEqual('xyz');
  });

  test('getRangeBounds', () => {
    window.getSelection = (() => undefined) as any;
    expect(getRangeBounds()).toBeUndefined();

    window.getSelection = (() => ({ rangeCount: 0 })) as any;
    expect(getRangeBounds()).toBeUndefined();

    window.getSelection = (() => ({
      rangeCount: 1,
      getRangeAt: () => ({
        getClientRects: () => ['xyz']
      })
    })) as any;
    expect(getRangeBounds()).toEqual('xyz');
  });

  test('indexOfNode', () => {
    expect(indexOfNode(['a', 'b', 'c'] as any, 'a' as any)).toEqual(0);
    expect(indexOfNode(['a', 'b', 'c'] as any, 'b' as any)).toEqual(1);
    expect(indexOfNode(['a', 'b', 'c'] as any, 'd' as any)).toEqual(-1);
  });

});
