// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { once } from 'node:events';
import { createReadStream } from 'node:fs';
import { PassThrough } from 'node:stream';
import { createMedplumClient } from './util/client';
import { addSubcommand, MedplumCommand } from './utils';

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

async function writeMultipartRelatedBody(out: PassThrough, filePaths: string[], boundary: string): Promise<void> {
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
  .description('Send a DICOM instance via DICOMweb STOW-RS')
  .argument('<file>', 'DICOM file to send')
  .action(async (file, options) => {
    const medplum = await createMedplumClient(options);
    const boundary = `medplum-${Date.now()}`;
    const contentType = `multipart/related; type=application/dicom; boundary=${boundary}`;
    const stream = new PassThrough();
    const writePromise = writeMultipartRelatedBody(stream, [file], boundary);
    const requestPromise = medplum.post('/dicomweb/studies', stream, contentType);
    await writePromise;
    const text = await requestPromise;
    console.log('STOW-RS response received', text);
    return text;
  });

export const dicomweb = new MedplumCommand('dicomweb');
addSubcommand(dicomweb, stow);
