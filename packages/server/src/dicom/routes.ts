// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import Busboy from '@fastify/busboy';
import type { Binary } from '@medplum/fhirtypes';
import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';
import { readFileSync } from 'node:fs';
import { PassThrough } from 'stream';
import { getAuthenticatedContext } from '../context';
import { uploadBinaryData } from '../fhir/binary';
import { authenticateRequest } from '../oauth/middleware';

const studiesList = JSON.parse(readFileSync('./src/dicom/testdata/studies.json', 'utf-8'));
const seriesList = JSON.parse(readFileSync('./src/dicom/testdata/series.json', 'utf-8'));
const seriesMetadata = JSON.parse(readFileSync('./src/dicom/testdata/seriesMetadata.json', 'utf-8'));
const studyBulkData = readFileSync('./src/dicom/testdata/studyBulkData.bin');
const framePixelData = readFileSync('./src/dicom/testdata/framePixelData.bin');

// interface UploadedPartResult {
//   fieldName: string;
//   filename?: string;
//   mimeType: string;
//   bucket: string;
//   key: string;
//   size?: number;
//   etag?: string;
// }

export const dicomRouter = Router().use(authenticateRequest);
// export const dicomRouter = Router();

// DICOMweb WADO
// https://www.dicomstandard.org/dicomweb

dicomRouter.get('/studies', (_req: Request, res: Response) => {
  // handler: fastify.getQIDOStudies,
  res.status(200).json(studiesList);
});

dicomRouter.post('/studies', (req: Request, res: Response, next: NextFunction) => {
  const contentType = req.headers['content-type'];
  if (!contentType?.includes('multipart/form-data')) {
    res.status(400).json({ error: 'Expected multipart/form-data' });
    return;
  }

  const busboy = new Busboy({
    headers: { 'content-type': contentType },
    limits: {
      files: 20,
      fileSize: 1024 * 1024 * 1024 * 50, // 50 GB example
      fields: 100,
    },
  });

  const ctx = getAuthenticatedContext();
  const repo = ctx.repo;
  const fields: Record<string, string[]> = {};
  const uploadPromises: Promise<Binary>[] = [];
  let parseFinished = false;
  let responseSent = false;

  function fail(err: unknown): void {
    if (responseSent) {
      return;
    }
    responseSent = true;
    next(err);
  }

  busboy.on('field', (fieldName, value) => {
    if (!fields[fieldName]) {
      fields[fieldName] = [];
    }
    fields[fieldName].push(value);
  });

  busboy.on(
    'file',
    (
      _fieldName: string,
      fileStream: NodeJS.ReadableStream,
      filename: string,
      _encoding: string,
      contentType: string
    ) => {
      console.log('Received file', { filename, contentType });
      const pass = new PassThrough();
      fileStream.pipe(pass);
      const promise = uploadBinaryData(repo, pass, { contentType, filename });
      fileStream.on('error', (err) => {
        console.error('File stream error', { filename, error: err });
        pass.destroy(err as Error);
      });
      uploadPromises.push(promise);
    }
  );

  busboy.on('error', (err) => {
    console.error('Busboy error', { error: err });
    fail(err);
  });

  busboy.on('finish', async () => {
    console.log('Finished parsing form data');
    parseFinished = true;

    try {
      const uploadedFiles = await Promise.all(uploadPromises);
      if (responseSent) {
        return;
      }
      responseSent = true;
      res.status(200).json({
        ok: true,
        fields,
        files: uploadedFiles,
      });
    } catch (err) {
      console.error('Error processing uploaded files', { error: err });
      fail(err);
    }
  });

  req.on('aborted', () => {
    // Client disconnected mid-upload.
    // In a more advanced version, track Upload instances and abort them here.
    if (!responseSent && !parseFinished) {
      fail(new Error('Request aborted by client'));
    }
  });

  req.pipe(busboy);
  // res.sendStatus(200);
});

dicomRouter.get('/studies/:study', (_req: Request, res: Response) => {
  res.sendStatus(200);
});

dicomRouter.post('/studies/:study', (_req: Request, res: Response) => {
  // STOW-RS - Optional endpoint for only supporting uploads for a study UID
  res.sendStatus(200);
});

dicomRouter.get(['/studies/:study/bulkdata', '/studies/:study/bulkdata/{*path}'], (_req: Request, res: Response) => {
  res
    .status(200)
    .contentType('application/octet-stream')
    .set('Content-Encoding', 'gzip')
    .set('Content-Length', studyBulkData.length.toString())
    .send(studyBulkData);
});

dicomRouter.get('/studies/:study/rendered', (_req: Request, res: Response) => {
  // Optional WADO-RS endpoint, not required for OHIF Viewer
  res.sendStatus(200);
});

dicomRouter.get('/studies/:study/series', (_req: Request, res: Response) => {
  // handler: fastify.getQIDOSeries,
  res.status(200).json(seriesList);
});

dicomRouter.get('/studies/:study/series/:series', (_req: Request, res: Response) => {
  res.sendStatus(200);
});

dicomRouter.get('/studies/:study/series/:series/rendered', (_req: Request, res: Response) => {
  // Optional WADO-RS endpoint, not required for OHIF Viewer
  res.sendStatus(200);
});

dicomRouter.get('/studies/:study/series/:series/metadata', (_req: Request, res: Response) => {
  // handler: fastify.getSeriesMetadata,
  res.status(200).json(seriesMetadata);
});

dicomRouter.get('/studies/:study/series/:series/instances', (_req: Request, res: Response) => {
  res.sendStatus(200);
});

dicomRouter.get('/studies/:study/series/:series/instances/:instance', (_req: Request, res: Response) => {
  res.sendStatus(200);
});

dicomRouter.get('/studies/:study/series/:series/instances/:instance/rendered', (_req: Request, res: Response) => {
  // Optional WADO-RS endpoint, not required for OHIF Viewer
  res.sendStatus(200);
});

dicomRouter.get('/studies/:study/series/:series/instances/:instance/metadata', (_req: Request, res: Response) => {
  res.sendStatus(200);
});

dicomRouter.get('/studies/:study/series/:series/instances/:instance/frames/:frame', (_req: Request, res: Response) => {
  // handler: fastify.retrieveInstanceFrames,
  res
    .status(200)
    .contentType('multipart/related')
    .set('Content-Length', framePixelData.length.toString())
    .send(framePixelData);
});

dicomRouter.get('/:bulkdataUriReference', (_req: Request, res: Response) => {
  res.sendStatus(200);
});
