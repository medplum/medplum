import { PassThrough } from 'stream';

/**
 * This is a Jest mock for the Google Cloud Storage client library.
 * It mocks the chain of calls from `new Storage()` down to the individual
 * file methods like `save`, `createWriteStream`, etc.
 */
export const Storage = jest.fn().mockImplementation(() => ({
  bucket: jest.fn().mockImplementation(() => ({
    file: jest.fn().mockImplementation(() => ({
      /**
       * Mocks the `save` method used for writing strings/buffers.
       * Since the implementation `await`s this call, we mock it
       * to return a resolved promise.
       */
      save: jest.fn().mockResolvedValue(undefined),

      /**
       * Mocks the `copy` method used in the `copyFile` implementation.
       * It returns a resolved promise to simulate a successful copy operation.
       */
      copy: jest.fn().mockResolvedValue(undefined),

      /**
       * Mocks the `createWriteStream` method used for writing streams.
       * It returns a `PassThrough` stream, which is a simple readable
       * and writable stream that's useful for testing stream piping.
       */
      createWriteStream: jest.fn().mockReturnValue(new PassThrough()),

      /**
       * Mocks the `createReadStream` method.
       * It returns a stream that immediately pushes a sample string and ends.
       */
      createReadStream: jest.fn().mockImplementation(() => {
        const stream = new PassThrough();
        stream.end('Hello, world!');
        return stream;
      }),

      /**
       * Mocks `getSignedUrl` to return a predictable, fake URL.
       * The actual GCS library returns an array where the first element is the URL.
       */
      getSignedUrl: jest.fn().mockResolvedValue(['https://example.com/signed-url']),
    })),
  })),
}));
