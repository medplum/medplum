// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough, type Readable } from 'node:stream';
import type { Mock } from 'vitest';
import { main } from '.';
import { writeMultipartRelatedBody } from './dicomweb';
import { createMedplumClient } from './util/client';

vi.mock('./util/client');

describe('CLI DICOMweb', () => {
  let testDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    testDir = mkdtempSync(join(tmpdir(), 'medplum-dicomweb-'));
    console.log = vi.fn();
    console.error = vi.fn();
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  test('stow posts multipart DICOM data', async () => {
    const fileName = join(testDir, 'instance.dcm');
    writeFileSync(fileName, Buffer.from('dicom bytes'));

    const post = vi.fn(async (_url: string, body: Readable, _contentType: string) => {
      const chunks: Buffer[] = [];
      for await (const chunk of body) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      return Buffer.concat(chunks).toString();
    });
    (createMedplumClient as unknown as Mock).mockResolvedValue({ post });

    await main(['node', 'index.js', 'dicomweb', 'stow', fileName]);

    expect(post).toHaveBeenCalledOnce();
    const [url, _body, contentType] = post.mock.calls[0];
    expect(url).toBe('/dicomweb/studies');
    expect(contentType).toMatch(/^multipart\/related; type=application\/dicom; boundary=medplum-\d+$/);

    const boundary = contentType.split('boundary=')[1];
    const sentBody = await post.mock.results[0].value;
    expect(sentBody).toBe(
      [
        `--${boundary}`,
        'Content-Type: application/dicom',
        '',
        'dicom bytes',
        `--${boundary}--`,
        '',
      ].join('\r\n')
    );
    expect(console.log).toHaveBeenCalledWith('STOW-RS response received', sentBody);
  });

  test('writeMultipartRelatedBody destroys stream on file read error', async () => {
    const stream = new PassThrough();
    stream.on('error', () => undefined);

    await expect(writeMultipartRelatedBody(stream, [join(testDir, 'missing.dcm')], 'boundary')).rejects.toThrow(
      /ENOENT/
    );
    expect(stream.destroyed).toBe(true);
  });
});
