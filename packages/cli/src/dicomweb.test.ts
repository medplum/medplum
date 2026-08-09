// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import { PassThrough } from 'node:stream';
import type { Mock } from 'vitest';
import { main } from '.';
import { resolveDicomFiles, writeMultipartRelatedBody } from './dicomweb';
import { createMedplumClient } from './util/client';

vi.mock('./util/client');

/**
 * Writes a file with a valid DICOM Part 10 preamble so that content sniffing detects it.
 * @param filePath - The destination file path.
 * @param contents - The file contents to write after the preamble.
 */
function writeDicomFile(filePath: string, contents: string): void {
  writeFileSync(filePath, Buffer.concat([Buffer.alloc(128), Buffer.from('DICM'), Buffer.from(contents)]));
}

/**
 * Mocks the Medplum client, collecting the request body of every `medplum.post` call as a string.
 * @returns The mock `post` function.
 */
function mockPost(): Mock {
  const post = vi.fn(async (_url: string, body: Readable, _contentType: string) => {
    const chunks: Buffer[] = [];
    for await (const chunk of body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks).toString();
  });
  (createMedplumClient as unknown as Mock).mockResolvedValue({ post });
  return post;
}

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

    const post = mockPost();
    await main(['node', 'index.js', 'dicomweb', 'stow', fileName]);

    expect(post).toHaveBeenCalledOnce();
    const [url, _body, contentType] = post.mock.calls[0];
    expect(url).toBe('/dicomweb/studies');
    expect(contentType).toMatch(/^multipart\/related; type=application\/dicom; boundary=medplum-\d+$/);

    const boundary = contentType.split('boundary=')[1];
    const sentBody = await post.mock.results[0].value;
    expect(sentBody).toBe(
      [`--${boundary}`, 'Content-Type: application/dicom', '', 'dicom bytes', `--${boundary}--`, ''].join('\r\n')
    );
    expect(console.log).toHaveBeenCalledWith('STOW-RS response received', sentBody);
  });

  test('stow sends all DICOM files in a directory', async () => {
    const seriesDir = join(testDir, 'series1');
    mkdirSync(seriesDir);
    writeDicomFile(join(testDir, 'a.dcm'), 'first');
    writeDicomFile(join(seriesDir, 'IM000002'), 'second'); // No extension, detected by preamble
    writeFileSync(join(testDir, 'README.txt'), 'not dicom');
    writeFileSync(join(testDir, 'DICOMDIR'), Buffer.concat([Buffer.alloc(128), Buffer.from('DICM')]));

    const post = mockPost();
    await main(['node', 'index.js', 'dicomweb', 'stow', testDir]);

    expect(post).toHaveBeenCalledOnce();
    const sentBody = await post.mock.results[0].value;
    expect(sentBody).toContain('first');
    expect(sentBody).toContain('second');
    expect(sentBody).not.toContain('not dicom');
    expect(console.log).toHaveBeenCalledWith('Sending 2 DICOM file(s)');
    expect(console.log).toHaveBeenCalledWith(`Skipped 2 non-DICOM file(s) in "${testDir}"`);
  });

  test('stow expands glob patterns', async () => {
    writeDicomFile(join(testDir, 'a.dcm'), 'first');
    writeDicomFile(join(testDir, 'b.dcm'), 'second');
    writeDicomFile(join(testDir, 'c.other'), 'third');

    const post = mockPost();
    await main(['node', 'index.js', 'dicomweb', 'stow', `${testDir}/*.dcm`]);

    expect(post).toHaveBeenCalledOnce();
    const sentBody = await post.mock.results[0].value;
    expect(sentBody).toContain('first');
    expect(sentBody).toContain('second');
    expect(sentBody).not.toContain('third');
  });

  test('stow accepts multiple arguments and de-duplicates', async () => {
    const fileName = join(testDir, 'a.dcm');
    writeDicomFile(fileName, 'first');
    writeDicomFile(join(testDir, 'b.dcm'), 'second');

    const post = mockPost();
    await main(['node', 'index.js', 'dicomweb', 'stow', fileName, testDir]);

    expect(post).toHaveBeenCalledOnce();
    expect(console.log).toHaveBeenCalledWith('Sending 2 DICOM file(s)');
  });

  test('stow splits files into batches', async () => {
    for (let i = 0; i < 5; i++) {
      writeDicomFile(join(testDir, `${i}.dcm`), `instance${i}`);
    }

    const post = mockPost();
    await main(['node', 'index.js', 'dicomweb', 'stow', '--batch-size', '2', testDir]);

    expect(post).toHaveBeenCalledTimes(3);
    const bodies = await Promise.all(post.mock.results.map((r) => r.value));
    expect(bodies.map((body: string) => body.match(/instance\d/g)?.length)).toStrictEqual([2, 2, 1]);
  });

  test('resolveDicomFiles matches nested directories and mismatched extension case', async () => {
    const nestedDir = join(testDir, 'series1', 'sub');
    mkdirSync(nestedDir, { recursive: true });
    const topFile = join(testDir, 'a.DCM');
    const nestedFile = join(nestedDir, 'b.DCM');
    writeDicomFile(topFile, 'first');
    writeDicomFile(nestedFile, 'second');

    // `**` matches zero or more directories, so the top level file is included too
    await expect(resolveDicomFiles([`${testDir}/**/*.dcm`])).resolves.toStrictEqual([topFile, nestedFile]);
  });

  test('resolveDicomFiles detects DICOM without a preamble', async () => {
    // Part 10 with no preamble, starting directly with a (0002,0000) File Meta Information tag
    const noPreamble = join(testDir, 'no-preamble');
    writeFileSync(noPreamble, Buffer.from([0x02, 0x00, 0x00, 0x00, 0x55, 0x4c]));

    // Raw dataset with no File Meta Information at all, recognized only by its extension
    const rawDataset = join(testDir, 'raw.dcm');
    writeFileSync(rawDataset, Buffer.from([0x08, 0x00, 0x00, 0x00, 0x55, 0x4c]));

    // Same leading bytes as the raw dataset, but no DICOM extension to vouch for it
    writeFileSync(join(testDir, 'notes.txt'), Buffer.from([0x08, 0x00, 0x00, 0x00, 0x55, 0x4c]));

    await expect(resolveDicomFiles([testDir])).resolves.toStrictEqual([noPreamble, rawDataset]);
  });

  test('resolveDicomFiles throws on missing file', async () => {
    await expect(resolveDicomFiles([join(testDir, 'missing.dcm')])).rejects.toThrow(/File not found/);
  });

  test('resolveDicomFiles returns empty array when nothing matches', async () => {
    await expect(resolveDicomFiles([`${testDir}/*.dcm`])).resolves.toStrictEqual([]);
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
