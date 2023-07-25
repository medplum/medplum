import { Writable } from 'stream';
import tar from 'tar';
import { getCodeContentType, safeTarExtractor } from './utils';

jest.mock('tar', () => ({
  x: jest.fn(),
}));

describe('CLI utils', () => {
  test('safeTarExtractor throws an error when fileCount > MAX_FILES', async () => {
    (tar as jest.Mocked<typeof tar>).x.mockImplementationOnce((options) => {
      const writable = new Writable({
        write(chunk, _, callback) {
          options.filter?.(chunk.toString(), { size: 1 } as tar.FileStat);
          callback();
        },
      });
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
    (tar as jest.Mocked<typeof tar>).x.mockImplementationOnce((options) => {
      const writable = new Writable({
        write(chunk, _, callback) {
          options.filter?.(chunk.toString(), { size: 1024 * 1024 } as tar.FileStat);
          callback();
        },
      });
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
    expect(getCodeContentType('foo.cjs')).toEqual('text/javascript');
    expect(getCodeContentType('foo.js')).toEqual('text/javascript');
    expect(getCodeContentType('foo.mjs')).toEqual('text/javascript');

    expect(getCodeContentType('foo.cts')).toEqual('text/typescript');
    expect(getCodeContentType('foo.mts')).toEqual('text/typescript');
    expect(getCodeContentType('foo.ts')).toEqual('text/typescript');

    expect(getCodeContentType('foo.txt')).toEqual('text/plain');
    expect(getCodeContentType('foo')).toEqual('text/plain');
  });
});
