// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType } from '@medplum/core';
import { Option } from 'commander';
import { Stats } from 'node:fs';
import { Writable } from 'node:stream';
import * as tar from 'tar';
import { getCodeContentType, MedplumCommand, safeTarExtractor } from './utils';

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
      }) as unknown as tar.Unpack;
      return writable;
    });

    const extractor = safeTarExtractor('/tmp/');
    expect(() => {
      for (let i = 0; i < 101; i++) {
        extractor.write(`file-${i}.txt`);
      }
      extractor.end();
    }).toThrow('Tar extractor reached max number of files');
  });

  test('safeTarExtractor throws an error when size > MAX_SIZE', async () => {
    (tar as jest.Mocked<typeof tar>).extract.mockImplementationOnce((options) => {
      const writable = new Writable({
        write(chunk, _, callback) {
          options.filter?.(chunk.toString(), { size: 1024 * 1024 } as Stats);
          callback();
        },
      }) as unknown as tar.Unpack;
      return writable;
    });

    expect(() => {
      const extractor = safeTarExtractor('/tmp/');
      for (let i = 0; i < 11; i++) {
        extractor.write(`file-${i}.txt`);
      }
      extractor.end();
    }).toThrow('Tar extractor reached max size');
  });

  test('getCodeContentType', () => {
    expect(getCodeContentType('foo.cjs')).toStrictEqual(ContentType.JAVASCRIPT);
    expect(getCodeContentType('foo.js')).toStrictEqual(ContentType.JAVASCRIPT);
    expect(getCodeContentType('foo.mjs')).toStrictEqual(ContentType.JAVASCRIPT);

    expect(getCodeContentType('foo.cts')).toStrictEqual(ContentType.TYPESCRIPT);
    expect(getCodeContentType('foo.mts')).toStrictEqual(ContentType.TYPESCRIPT);
    expect(getCodeContentType('foo.ts')).toStrictEqual(ContentType.TYPESCRIPT);

    expect(getCodeContentType('foo.txt')).toStrictEqual(ContentType.TEXT);
    expect(getCodeContentType('foo')).toStrictEqual(ContentType.TEXT);
  });

  describe('MedplumCommand', () => {
    const originalConsoleInfo = console.info;

    beforeAll(() => {
      console.info = jest.fn();
    });

    afterAll(() => {
      console.info = originalConsoleInfo;
    });

    test('Default options - reset on each call', async () => {
      // Swapping this `MedplumCommand` with `Command` from `commander.js` causes this test to fail
      // That's because by default each execution is expected to be done with a new command tree (all command objects must be rebuilt for each execution)
      // This is fine in the real world where each lifetime of the process only runs one command
      // But in tests it causes a lot of failures due to sticky options from previous commands overriding defaults for subsequent executions
      const command = new MedplumCommand('test')
        .addOption(
          new Option('--output <format>', 'An optional output format, defaults to table')
            .choices(['table', 'json'])
            .default('table')
        )
        .action(async (opts) => {
          console.info(opts);
        });

      await command.parseAsync(['test', '--output', 'json'], { from: 'user' });
      expect(console.info).toHaveBeenLastCalledWith({ output: 'json' });
      await command.parseAsync(['test'], { from: 'user' });
      expect(console.info).toHaveBeenLastCalledWith({ output: 'table' });

      // Test booleans separately (due to old code only checking `if (option.defaultValue)`)
      const boolDefaultCommand = new MedplumCommand('test')
        .addOption(new Option('--should-output', 'Whether the command should output, defaults to false').default(false))
        .action(async (opts) => {
          console.info(opts);
        });

      await boolDefaultCommand.parseAsync(['test', '--should-output'], { from: 'user' });
      expect(console.info).toHaveBeenLastCalledWith({ shouldOutput: true });
      await boolDefaultCommand.parseAsync(['test'], { from: 'user' });
      expect(console.info).toHaveBeenLastCalledWith({ shouldOutput: false });
    });
  });
});
