// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import fastGlob from 'fast-glob';
import { once } from 'node:events';
import { createReadStream } from 'node:fs';
import { open, stat } from 'node:fs/promises';
import { basename, extname, resolve } from 'node:path';
import { PassThrough } from 'node:stream';
import { createMedplumClient } from './util/client';
import { addSubcommand, MedplumCommand } from './utils';

const DEFAULT_BATCH_SIZE = 25;

/** Extensions unambiguously used for DICOM, to recognize raw datasets that carry no File Meta Information. */
const DICOM_EXTENSIONS = new Set(['.dcm', '.dicom', '.ima']);

/** A DICOM Part 10 file starts with a 128 byte preamble followed by the "DICM" prefix. */
const DICOM_PREFIX = Buffer.from('DICM');
const DICOM_PREFIX_OFFSET = 128;
const DICOM_HEADER_LENGTH = DICOM_PREFIX_OFFSET + DICOM_PREFIX.length;

/** The File Meta Information group, which a Part 10 file without a preamble starts with. */
const FILE_META_GROUP = 0x0002;

/**
 * Returns true if the file appears to be a storable DICOM instance.
 *
 * Only used when expanding directories and glob patterns, where the user did not name the file
 * explicitly, so that stray files such as READMEs or JPEG previews do not get sent to the server.
 *
 * The two content checks mirror what the server's reader accepts, so that this does not reject
 * files the server would have stored. It accepts a third encoding - a raw dataset with no File
 * Meta Information - which has no distinguishing header to test for, hence the extension fallback.
 * @param filePath - The candidate file path.
 * @returns True if the file should be sent as a DICOM instance.
 */
async function isDicomFile(filePath: string): Promise<boolean> {
  // DICOMDIR is a media directory record rather than a storable instance
  if (basename(filePath).toUpperCase() === 'DICOMDIR') {
    return false;
  }

  const handle = await open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(DICOM_HEADER_LENGTH);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    if (bytesRead === buffer.length && buffer.subarray(DICOM_PREFIX_OFFSET).equals(DICOM_PREFIX)) {
      return true;
    }
    // File Meta Information is always encoded little-endian, so the leading group number is too
    if (bytesRead >= 2 && buffer.readUInt16LE(0) === FILE_META_GROUP) {
      return true;
    }
  } finally {
    await handle.close();
  }

  return DICOM_EXTENSIONS.has(extname(filePath).toLowerCase());
}

/**
 * Expands the command line file arguments into a sorted list of DICOM file paths.
 *
 * Each input can be a file, a directory (searched recursively), or a glob pattern. Note that
 * POSIX shells expand unquoted patterns such as `*.dcm` before the CLI runs, so patterns only
 * reach here when quoted by the user or when running on a shell that does not expand them.
 * @param inputs - The file, directory, and glob pattern arguments.
 * @returns The de-duplicated and sorted list of absolute DICOM file paths.
 */
export async function resolveDicomFiles(inputs: string[]): Promise<string[]> {
  const results = new Set<string>();
  for (const input of inputs) {
    const stats = await stat(input).catch(() => undefined);
    if (stats?.isFile()) {
      // Explicitly named files are always sent, even if they do not look like DICOM
      results.add(resolve(input));
      continue;
    }

    let matches: string[];
    if (stats?.isDirectory()) {
      matches = await fastGlob('**/*', { cwd: input, onlyFiles: true, absolute: true });
    } else if (fastGlob.isDynamicPattern(input)) {
      matches = await fastGlob(input, { onlyFiles: true, absolute: true });
    } else {
      throw new Error(`File not found: ${input}`);
    }

    let skipped = 0;
    for (const match of matches) {
      if (await isDicomFile(match)) {
        results.add(match);
      } else {
        skipped++;
      }
    }
    if (skipped > 0) {
      console.log(`Skipped ${skipped} non-DICOM file(s) in "${input}"`);
    }
  }
  return Array.from(results).sort((a, b) => a.localeCompare(b));
}

async function writeBuffer(stream: PassThrough, buffer: Buffer): Promise<void> {
  if (!stream.write(buffer)) {
    await once(stream, 'drain');
  }
}

async function pipeFileToStream(filePath: string, out: PassThrough): Promise<void> {
  const fileStream = createReadStream(filePath);
  try {
    for await (const chunk of fileStream) {
      if (!out.write(chunk as Buffer)) {
        await once(out, 'drain');
      }
    }
  } finally {
    fileStream.destroy();
  }
}

export async function writeMultipartRelatedBody(
  out: PassThrough,
  filePaths: string[],
  boundary: string
): Promise<void> {
  try {
    for (const filePath of filePaths) {
      await writeBuffer(out, Buffer.from(`--${boundary}\r\n`));
      await writeBuffer(out, Buffer.from('Content-Type: application/dicom\r\n'));
      await writeBuffer(out, Buffer.from('\r\n'));
      await pipeFileToStream(filePath, out);
      await writeBuffer(out, Buffer.from('\r\n'));
    }
    await writeBuffer(out, Buffer.from(`--${boundary}--\r\n`));
    out.end();
  } catch (err) {
    out.destroy(err as Error);
    throw err;
  }
}

const stow = new MedplumCommand('stow')
  .description('Send DICOM instances via DICOMweb STOW-RS')
  .argument('<files...>', 'DICOM files, directories, or quoted glob patterns to send')
  .option('--batch-size <count>', 'Maximum number of instances per STOW-RS request', String(DEFAULT_BATCH_SIZE))
  .action(async (files: string[], options) => {
    const batchSize = Number.parseInt(options.batchSize, 10);
    if (!Number.isInteger(batchSize) || batchSize < 1) {
      throw new Error(`Invalid batch size: ${options.batchSize}`);
    }

    const filePaths = await resolveDicomFiles(files);
    if (filePaths.length === 0) {
      throw new Error('No DICOM files found');
    }
    console.log(`Sending ${filePaths.length} DICOM file(s)`);

    const medplum = await createMedplumClient(options);
    for (let i = 0; i < filePaths.length; i += batchSize) {
      const batch = filePaths.slice(i, i + batchSize);
      const boundary = `medplum-${Date.now()}`;
      const contentType = `multipart/related; type=application/dicom; boundary=${boundary}`;
      const stream = new PassThrough();
      const writePromise = writeMultipartRelatedBody(stream, batch, boundary);
      const requestPromise = medplum.post('/dicomweb/studies', stream, contentType);
      await writePromise;
      const text = await requestPromise;
      console.log('STOW-RS response received', text);
    }
  });

export const dicomweb = new MedplumCommand('dicomweb');
addSubcommand(dicomweb, stow);
