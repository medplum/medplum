// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Request, Response } from 'express';
import { Router } from 'express';
import { readFileSync } from 'node:fs';

const studiesList = JSON.parse(readFileSync('./src/dicom/testdata/studies.json', 'utf-8'));
const seriesList = JSON.parse(readFileSync('./src/dicom/testdata/series.json', 'utf-8'));
const seriesMetadata = JSON.parse(readFileSync('./src/dicom/testdata/seriesMetadata.json', 'utf-8'));
const studyBulkData = readFileSync('./src/dicom/testdata/studyBulkData.bin');
const framePixelData = readFileSync('./src/dicom/testdata/framePixelData.bin');

// export const dicomRouter = Router().use(authenticateRequest);
export const dicomRouter = Router();

// DICOMweb WADO
// https://www.dicomstandard.org/dicomweb

dicomRouter.get('/studies', (_req: Request, res: Response) => {
  // handler: fastify.getQIDOStudies,
  res.status(200).json(studiesList);
});

dicomRouter.post('/studies', (_req: Request, res: Response) => {
  // STOW-RS
  res.sendStatus(200);
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
