import { ReadablePromise } from './readablepromise';

describe('ReadablePromise', () => {
  test('read resolve', async () => {
    const readable = new ReadablePromise(Promise.resolve('x'));
    expect(readable.isPending()).toBe(true);
    expect(() => readable.read()).toThrow();
    await readable;
    expect(readable.isPending()).toBe(false);
    expect(readable.read()).toBe('x');
  });

  test('read reject', async () => {
    expect.assertions(2);
    const promise = new ReadablePromise(Promise.reject(new Error('x')));
    try {
      await promise;
    } catch (err) {
      expect((err as Error).message).toBe('x');
    }
    expect(() => promise.read()).toThrow('x');
  });

  test('then', async () => {
    const onFulfilled = jest.fn();
    const readable = new ReadablePromise(Promise.resolve('x')).then(onFulfilled);
    await readable;
    expect(onFulfilled).toHaveBeenCalled();
  });

  test('catch', async () => {
    const onRejected = jest.fn();
    const promise = new ReadablePromise(Promise.reject(new Error('x'))).catch(onRejected);
    try {
      await promise;
    } catch (err) {
      expect((err as Error).message).toBe('x');
    }
    expect(onRejected).toHaveBeenCalled();
  });

  test('finally', async () => {
    const onFinally = jest.fn();
    const readable = new ReadablePromise(Promise.resolve('x')).finally(onFinally);
    await readable;
    expect(onFinally).toHaveBeenCalled();
  });
});
