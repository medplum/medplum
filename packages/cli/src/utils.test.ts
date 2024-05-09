import { ContentType } from '@medplum/core';
import { Stats } from 'node:fs';
import { Writable } from 'node:stream';
import tar, { Unpack } from 'tar';
import { getCodeContentType, safeTarExtractor } from './utils';

jest.mock('tar', () => ({
  extract: jest.fn(),
}));

describe('CLI utils', () => {
  test('safeTarExtractor throws an error when fileCount > MAX_FILES', async () => {
    (tar as jest.Mocked<typeof tar>).extract.mockImplementationOnce((options) => {
      const writable = new Writable({
        write(chunk, _, callback) {
          options.filter?.(chunk.toString(), { size: 1 } as Stats);
          callback();
        },
      }) as unknown as Unpack;
      return writable;
    });

    try {
      const extractor = safeTarExtractor('/tmp/');
      for (let i = 0; i < 101; i++) {
        extractor.write(`file-${i}.txt`);
      }
      extractor.end();
      throw new Error('Expected error');
    } catch (err) {
      expect((err as Error).message).toEqual('Tar extractor reached max number of files');
    }
  });

  test('safeTarExtractor throws an error when size > MAX_SIZE', async () => {
    (tar as jest.Mocked<typeof tar>).extract.mockImplementationOnce((options) => {
      const writable = new Writable({
        write(chunk, _, callback) {
          options.filter?.(chunk.toString(), { size: 1024 * 1024 } as Stats);
          callback();
        },
      }) as unknown as Unpack;
      return writable;
    });

    try {
      const extractor = safeTarExtractor('/tmp/');
      for (let i = 0; i < 11; i++) {
        extractor.write(`file-${i}.txt`);
      }
      extractor.end();
      throw new Error('Expected error');
    } catch (err) {
      expect((err as Error).message).toEqual('Tar extractor reached max size');
    }
  });

  test('getCodeContentType', () => {
    expect(getCodeContentType('foo.cjs')).toEqual(ContentType.JAVASCRIPT);
    expect(getCodeContentType('foo.js')).toEqual(ContentType.JAVASCRIPT);
    expect(getCodeContentType('foo.mjs')).toEqual(ContentType.JAVASCRIPT);

    expect(getCodeContentType('foo.cts')).toEqual(ContentType.TYPESCRIPT);
    expect(getCodeContentType('foo.mts')).toEqual(ContentType.TYPESCRIPT);
    expect(getCodeContentType('foo.ts')).toEqual(ContentType.TYPESCRIPT);

    expect(getCodeContentType('foo.txt')).toEqual(ContentType.TEXT);
    expect(getCodeContentType('foo')).toEqual(ContentType.TEXT);
  });
});
