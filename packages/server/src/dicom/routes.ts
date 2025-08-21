// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Request, Response } from 'express';
import { Router } from 'express';
import { getLogger } from '../logger';
import { authenticateRequest } from '../oauth/middleware';
import { handleSearchSeries, handleSearchStudies } from './qido-rs';
import { handleStoreInstances } from './stow-rs';
import { handleRetrieveInstanceFrame, handleRetrieveSeriesMetadata } from './wado-rs';

export const dicomRouter = Router().use(authenticateRequest);

// DICOMweb WADO
// https://www.dicomstandard.org/using/dicomweb/restful-structure

dicomRouter.post('/studies', handleStoreInstances);
dicomRouter.get('/studies', handleSearchStudies);
dicomRouter.get('/studies/:studyUid', notImplementedStub);
dicomRouter.get('/studies/:studyUid/rendered', notImplementedStub);
dicomRouter.post('/studies/:studyUid', handleStoreInstances);
dicomRouter.get('/studies/:studyUid/metadata', notImplementedStub);
dicomRouter.get('/studies/:studyUid/series', handleSearchSeries);
dicomRouter.get('/studies/:studyUid/series/:series', notImplementedStub);
dicomRouter.get('/studies/:studyUid/series/:seriesUid/rendered', notImplementedStub);
dicomRouter.get('/studies/:studyUid/series/:seriesUid/metadata', handleRetrieveSeriesMetadata);
dicomRouter.get('/studies/:studyUid/series/:seriesUid/instances', notImplementedStub);
dicomRouter.get('/studies/:studyUid/series/:seriesUid/instances/:instance', notImplementedStub);
dicomRouter.get('/studies/:studyUid/series/:seriesUid/instances/:instance/rendered', notImplementedStub);
dicomRouter.get('/studies/:studyUid/series/:seriesUid/instances/:instance/metadata', notImplementedStub);
dicomRouter.get('/studies/:study/series/:series/instances/:instanceUid/frames/:frame', handleRetrieveInstanceFrame);
dicomRouter.get('/:bulkdataUriReference', notImplementedStub);

async function notImplementedStub(req: Request, res: Response): Promise<void> {
  getLogger().info('Received request for unimplemented DICOM endpoint', {
    method: req.method,
    path: req.path,
    query: req.query,
  });
  res.sendStatus(200);
}
