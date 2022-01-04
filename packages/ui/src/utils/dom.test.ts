import { killEvent } from './dom';

describe('DOM utils', () => {
  test('killEvent', () => {
    const e = {
      preventDefault: jest.fn(),
      stopPropagation: jest.fn(),
    };

    killEvent(e as unknown as Event);
    expect(e.preventDefault).toBeCalled();
    expect(e.stopPropagation).toBeCalled();
  });
});
