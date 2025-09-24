// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Readable } from 'stream';
import { streamToBuffer } from './sftp';

describe('sftp', () => {
  test('Return a Buffer', async () => {
    const input = 'test data';
    const stream = Readable.from(input);
    const expectedBuffer = Buffer.from(input);

    const result = await streamToBuffer(stream);
    expect(result).toStrictEqual(expectedBuffer);
  });

  test('Empty Readable stream', async () => {
    const stream = Readable.from('');
    const expectedBuffer = Buffer.from('');

    const result = await streamToBuffer(stream);
    expect(result).toStrictEqual(expectedBuffer);
  });

  test('Error event and reject with an error', async () => {
    const errorMessage = 'test error';
    const stream = new Readable({
      read() {
        this.emit('error', new Error(errorMessage));
      },
    });

    await expect(streamToBuffer(stream)).rejects.toThrow(errorMessage);
  });
});
