// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { vi } from 'vitest';
import { EventTarget, TypedEventTarget } from './eventtarget';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('EventTarget', () => {
  test('No listeners', () => {
    const target = new EventTarget();
    expect(() => target.dispatchEvent({ type: 'test' })).not.toThrow();
  });

  test('Add event listener', () => {
    const myCallback = vi.fn();
    const target = new EventTarget();
    target.addEventListener('test', myCallback);
    target.dispatchEvent({ type: 'test' });
    expect(myCallback).toHaveBeenCalled();
  });

  test('Add multiple event listeners', () => {
    const myCallback1 = vi.fn();
    const myCallback2 = vi.fn();
    const target = new EventTarget();
    target.addEventListener('test', myCallback1);
    target.addEventListener('test', myCallback2);
    target.dispatchEvent({ type: 'test' });
    expect(myCallback1).toHaveBeenCalled();
    expect(myCallback2).toHaveBeenCalled();
  });

  test('Remove event listener', () => {
    const myCallback = vi.fn();
    const target = new EventTarget();
    target.addEventListener('test', myCallback);
    target.removeEventListener('test', myCallback);
    target.dispatchEvent({ type: 'test' });
    expect(myCallback).not.toHaveBeenCalled();
  });

  test('Remove event listener not found', () => {
    const myCallback = vi.fn();
    const target = new EventTarget();
    target.removeEventListener('test', vi.fn());
    target.addEventListener('test', myCallback);
    target.removeEventListener('test', vi.fn());
    expect(() => target.dispatchEvent({ type: 'test' })).not.toThrow();
    expect(myCallback).toHaveBeenCalled();
  });

  test('Remove all event listeners', () => {
    const target = new EventTarget();

    const myCallback1 = vi.fn();
    const myCallback2 = vi.fn();
    const myCallback3 = vi.fn();

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

  test('Listener count', () => {
    const target = new EventTarget();
    target.addEventListener('test1', vi.fn());

    expect(target.listenerCount('test1')).toStrictEqual(1);
    expect(target.listenerCount('test2')).toStrictEqual(0);

    target.addEventListener('test1', vi.fn());
    expect(target.listenerCount('test1')).toStrictEqual(2);

    target.removeAllListeners();
    expect(target.listenerCount('test1')).toStrictEqual(0);
    expect(target.listenerCount('test2')).toStrictEqual(0);
  });

  test('When an event listener throws an error', () => {
    // The default error handler logs to console.error
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const error = new Error('Oh no');
    const listener1 = vi.fn().mockThrow(error);
    const listener2 = vi.fn();

    const target = new EventTarget();
    target.addEventListener('test', listener1);
    target.addEventListener('test', listener2);

    expect(() => target.dispatchEvent({ type: 'test' })).not.toThrow();

    expect(listener1).toHaveBeenCalled();
    expect(listener2).toHaveBeenCalled();

    // Test the default error handler
    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledWith('Unhandled error in "test" event listener', error);
  });

  test('With an eventListenerErrorHandler', () => {
    // The default error handler logs to console.error
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const error = new Error('Oh no');
    const listener1 = vi.fn().mockThrow(error);
    const listener2 = vi.fn();

    const target = new EventTarget();
    target.addEventListener('test', listener1);
    target.addEventListener('test', listener2);

    const eventListenerErrorHandler = vi.fn();
    target.setEventListenerErrorHandler(eventListenerErrorHandler);

    const event = { type: 'test', extraData: 123 };
    expect(() => target.dispatchEvent(event)).not.toThrow();

    expect(listener1).toHaveBeenCalled();
    expect(listener2).toHaveBeenCalled();

    expect(eventListenerErrorHandler).toHaveBeenCalledTimes(1);
    expect(eventListenerErrorHandler).toHaveBeenCalledWith(error, event);

    expect(consoleError).not.toHaveBeenCalled();
  });

  test('opting in to synchronous event listener errors', () => {
    // This usage is *strongly discouraged*, but is provided as a backwards
    // compatibility shim for any users who were relying on this style of
    // exception bubbling.

    const error = new Error('Oh no');
    const myCallback1 = vi.fn().mockThrow(error);
    const myCallback2 = vi.fn();
    const target = new EventTarget();
    target.setEventListenerErrorHandler((err) => {
      throw err;
    });
    target.addEventListener('test', myCallback1);
    target.addEventListener('test', myCallback2);

    const event = { type: 'test' };

    expect(() => {
      target.dispatchEvent(event);
    }).toThrow(error);
    expect(myCallback1).toHaveBeenCalled();
    expect(myCallback2).not.toHaveBeenCalled();
  });
});

describe('TypedEventTarget', () => {
  test('Constructor', () => {
    expect(() => new TypedEventTarget()).not.toThrow();
  });

  test('Add event listener', () => {
    const myCallback = vi.fn();
    const target = new TypedEventTarget<{ test: { type: 'test' } }>();
    target.addEventListener('test', myCallback);
    target.dispatchEvent({ type: 'test' });
    expect(myCallback).toHaveBeenCalled();
  });

  test('Add multiple event listeners', () => {
    const myCallback1 = vi.fn();
    const myCallback2 = vi.fn();
    const target = new TypedEventTarget<{ test: { type: 'test' } }>();
    target.addEventListener('test', myCallback1);
    target.addEventListener('test', myCallback2);
    target.dispatchEvent({ type: 'test' });
    expect(myCallback1).toHaveBeenCalled();
    expect(myCallback2).toHaveBeenCalled();
  });

  test('Remove event listener', () => {
    const myCallback = vi.fn();
    const target = new TypedEventTarget<{ test: { type: 'test' } }>();
    target.addEventListener('test', myCallback);
    target.removeEventListener('test', myCallback);
    target.dispatchEvent({ type: 'test' });
    expect(myCallback).not.toHaveBeenCalled();
  });

  test('Remove event listener not found', () => {
    const myCallback = vi.fn();
    const target = new TypedEventTarget<{ test: { type: 'test' } }>();
    target.removeEventListener('test', vi.fn());
    target.addEventListener('test', myCallback);
    target.removeEventListener('test', vi.fn());
    expect(() => target.dispatchEvent({ type: 'test' })).not.toThrow();
    expect(myCallback).toHaveBeenCalled();
  });

  test('Remove all event listeners', () => {
    const target = new TypedEventTarget<{ test1: { type: 'test1' }; test2: { type: 'test2' } }>();

    const myCallback1 = vi.fn();
    const myCallback2 = vi.fn();
    const myCallback3 = vi.fn();

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

  test('Listener count', () => {
    const target = new TypedEventTarget<{ test1: { type: 'test1' }; test2: { type: 'test2' } }>();
    target.addEventListener('test1', vi.fn());

    expect(target.listenerCount('test1')).toStrictEqual(1);
    expect(target.listenerCount('test2')).toStrictEqual(0);

    target.addEventListener('test1', vi.fn());
    expect(target.listenerCount('test1')).toStrictEqual(2);

    target.removeAllListeners();
    expect(target.listenerCount('test1')).toStrictEqual(0);
    expect(target.listenerCount('test2')).toStrictEqual(0);
  });

  test('Setting an event listener error handler', () => {
    const error = new Error('Oh no');
    const myCallback1 = vi.fn().mockThrow(error);
    const myCallback2 = vi.fn();
    const eventListenerErrorHandler = vi.fn();
    const target = new TypedEventTarget<{ test: { type: 'test' } }>();
    target.setEventListenerErrorHandler(eventListenerErrorHandler);
    target.addEventListener('test', myCallback1);
    target.addEventListener('test', myCallback2);

    const event = { type: 'test' } as const;
    target.dispatchEvent(event);

    expect(myCallback1).toHaveBeenCalled();
    expect(myCallback2).toHaveBeenCalled();
    expect(eventListenerErrorHandler).toHaveBeenCalledTimes(1);
    expect(eventListenerErrorHandler).toHaveBeenCalledWith(error, event);
  });
});
