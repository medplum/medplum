import { EventTarget } from './eventtarget';

describe('EventTarget', () => {
  test('No listeners', () => {
    const target = new EventTarget();
    expect(() => target.dispatchEvent({ type: 'test' })).not.toThrow();
  });

  test('Add event listener', () => {
    const myCallback = jest.fn();
    const target = new EventTarget();
    target.addEventListener('test', myCallback);
    target.dispatchEvent({ type: 'test' });
    expect(myCallback).toHaveBeenCalled();
  });

  test('Add multiple event listeners', () => {
    const myCallback1 = jest.fn();
    const myCallback2 = jest.fn();
    const target = new EventTarget();
    target.addEventListener('test', myCallback1);
    target.addEventListener('test', myCallback2);
    target.dispatchEvent({ type: 'test' });
    expect(myCallback1).toHaveBeenCalled();
    expect(myCallback2).toHaveBeenCalled();
  });

  test('Remove event listener', () => {
    const myCallback = jest.fn();
    const target = new EventTarget();
    target.addEventListener('test', myCallback);
    target.removeEventListener('test', myCallback);
    target.dispatchEvent({ type: 'test' });
    expect(myCallback).not.toHaveBeenCalled();
  });

  test('Remove event listener not found', () => {
    const myCallback = jest.fn();
    const target = new EventTarget();
    target.removeEventListener('test', jest.fn());
    target.addEventListener('test', myCallback);
    target.removeEventListener('test', jest.fn());
    expect(() => target.dispatchEvent({ type: 'test' })).not.toThrow();
    expect(myCallback).toHaveBeenCalled();
  });
});
