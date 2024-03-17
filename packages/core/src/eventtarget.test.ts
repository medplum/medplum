import { EventTarget, TypedEventTarget } from './eventtarget';

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

  test('Remove all event listeners', () => {
    const target = new EventTarget();

    const myCallback1 = jest.fn();
    const myCallback2 = jest.fn();
    const myCallback3 = jest.fn();

    target.addEventListener('test1', myCallback1);
    target.addEventListener('test1', myCallback2);
    target.addEventListener('test2', myCallback3);

    target.removeAllListeners();

    expect(() => target.dispatchEvent({ type: 'test1' })).not.toThrow();
    expect(() => target.dispatchEvent({ type: 'test2' })).not.toThrow();

    expect(myCallback1).not.toHaveBeenCalled();
    expect(myCallback2).not.toHaveBeenCalled();
    expect(myCallback3).not.toHaveBeenCalled();
  });
});

describe('TypedEventTarget', () => {
  test('Constructor', () => {
    expect(() => new TypedEventTarget()).not.toThrow();
  });

  test('Add event listener', () => {
    const myCallback = jest.fn();
    const target = new TypedEventTarget<{ test: { type: 'test' } }>();
    target.addEventListener('test', myCallback);
    target.dispatchEvent({ type: 'test' });
    expect(myCallback).toHaveBeenCalled();
  });

  test('Add multiple event listeners', () => {
    const myCallback1 = jest.fn();
    const myCallback2 = jest.fn();
    const target = new TypedEventTarget<{ test: { type: 'test' } }>();
    target.addEventListener('test', myCallback1);
    target.addEventListener('test', myCallback2);
    target.dispatchEvent({ type: 'test' });
    expect(myCallback1).toHaveBeenCalled();
    expect(myCallback2).toHaveBeenCalled();
  });

  test('Remove event listener', () => {
    const myCallback = jest.fn();
    const target = new TypedEventTarget<{ test: { type: 'test' } }>();
    target.addEventListener('test', myCallback);
    target.removeEventListener('test', myCallback);
    target.dispatchEvent({ type: 'test' });
    expect(myCallback).not.toHaveBeenCalled();
  });

  test('Remove event listener not found', () => {
    const myCallback = jest.fn();
    const target = new TypedEventTarget<{ test: { type: 'test' } }>();
    target.removeEventListener('test', jest.fn());
    target.addEventListener('test', myCallback);
    target.removeEventListener('test', jest.fn());
    expect(() => target.dispatchEvent({ type: 'test' })).not.toThrow();
    expect(myCallback).toHaveBeenCalled();
  });

  test('Remove all event listeners', () => {
    const target = new TypedEventTarget<{ test1: { type: 'test1' }; test2: { type: 'test2' } }>();

    const myCallback1 = jest.fn();
    const myCallback2 = jest.fn();
    const myCallback3 = jest.fn();

    target.addEventListener('test1', myCallback1);
    target.addEventListener('test1', myCallback2);
    target.addEventListener('test2', myCallback3);

    target.removeAllListeners();

    expect(() => target.dispatchEvent({ type: 'test1' })).not.toThrow();
    expect(() => target.dispatchEvent({ type: 'test2' })).not.toThrow();

    expect(myCallback1).not.toHaveBeenCalled();
    expect(myCallback2).not.toHaveBeenCalled();
    expect(myCallback3).not.toHaveBeenCalled();
  });
});
