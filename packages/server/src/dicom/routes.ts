// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createReference, Operator } from '@medplum/core';
import type { Binary, DicomInstance, DicomSeries, DicomStudy } from '@medplum/fhirtypes';
import type { DcmjsDicomDict } from 'dcmjs';
import dcmjs from 'dcmjs';
import DicomwebMultipartParser from 'dicomweb-multipart-parser';
import type { Request, Response } from 'express';
import { Router } from 'express';
import { readFileSync } from 'node:fs';
import { PassThrough } from 'stream';
import { getAuthenticatedContext } from '../context';
import { uploadBinaryData } from '../fhir/binary';
import { getLogger } from '../logger';
import { authenticateRequest } from '../oauth/middleware';
import { dicomDateToFhirDate, dicomPersonNameToString, dicomTimeToFhirTime } from './utils';

// eslint-disable-next-line import/no-named-as-default-member
const { async, data, utilities } = dcmjs;
const { AsyncDicomReader } = async;
const { DicomMetaDictionary } = data;
const { DicomMetadataListener } = utilities;

const studiesList = JSON.parse(readFileSync('./src/dicom/testdata/studies.json', 'utf-8'));
const seriesList = JSON.parse(readFileSync('./src/dicom/testdata/series.json', 'utf-8'));
const seriesMetadata = JSON.parse(readFileSync('./src/dicom/testdata/seriesMetadata.json', 'utf-8'));
const studyBulkData = readFileSync('./src/dicom/testdata/studyBulkData.bin');
const framePixelData = readFileSync('./src/dicom/testdata/framePixelData.bin');

export const dicomRouter = Router().use(authenticateRequest);

// DICOMweb WADO
// https://www.dicomstandard.org/dicomweb

dicomRouter.get('/studies', (_req: Request, res: Response) => {
  // handler: fastify.getQIDOStudies,
  res.status(200).json(studiesList);
});

dicomRouter.post('/studies', (req: Request, res: Response) => {
  const contentType = req.headers['content-type'];
  if (!contentType?.includes('multipart/related')) {
    res.status(415).json({ error: 'Expected multipart/related' });
    return;
  }

  const ctx = getAuthenticatedContext();
  const repo = ctx.repo;
  const promises: Promise<DicomInstance>[] = [];

  async function parseDicomMetadata(stream: PassThrough): Promise<Record<string, unknown>> {
    const listener = new DicomMetadataListener({
      untilOffset: 100 * 1024, // Read only the first 100 KB for metadata extraction
    });
    listener.startObject({});
    const reader = new AsyncDicomReader({});
    await reader.stream.fromAsyncStream(stream);
    const result = await reader.readFile({ listener });
    const naturalized = DicomMetaDictionary.naturalizeDataset(result.dict as DcmjsDicomDict) as Record<string, unknown>;
    return naturalized;
  }

  async function processInstance([binary, naturalized]: [Binary, Record<string, unknown>]): Promise<DicomInstance> {
    const studyResult = await repo.conditionalCreate<DicomStudy>(
      {
        resourceType: 'DicomStudy',
        meta: { author: { reference: 'system' } },
        studyInstanceUid: naturalized.StudyInstanceUID as string,
        studyId: naturalized.StudyID as string,
        studyDate: dicomDateToFhirDate(naturalized.StudyDate),
        studyTime: dicomTimeToFhirTime(naturalized.StudyTime),
        accessionNumber: naturalized.AccessionNumber as string,
        instanceAvailability: naturalized.InstanceAvailability as string,
        modalitiesInStudy: naturalized.ModalitiesInStudy as string[],
        referringPhysiciansName: naturalized.ReferringPhysiciansName as string,
        timezoneOffsetFromUtc: naturalized.TimezoneOffsetFromUTC as string,
        patientName: dicomPersonNameToString(naturalized.PatientName),
        patientId: naturalized.PatientID as string,
        patientBirthDate: dicomDateToFhirDate(naturalized.PatientBirthDate),
        patientSex: naturalized.PatientSex as string,
        numberOfStudyRelatedSeries: naturalized.NumberOfStudyRelatedSeries?.toString(),
        numberOfStudyRelatedInstances: naturalized.NumberOfStudyRelatedInstances?.toString(),
      },
      {
        resourceType: 'DicomStudy',
        filters: [
          { code: 'study-instance-uid', operator: Operator.EXACT, value: naturalized.StudyInstanceUID as string },
        ],
      }
    );

    const seriesResult = await repo.conditionalCreate<DicomSeries>(
      {
        resourceType: 'DicomSeries',
        meta: { author: { reference: 'system' } },
        study: createReference(studyResult.resource),
        seriesInstanceUid: naturalized.SeriesInstanceUID as string,
        seriesNumber: naturalized.SeriesNumber?.toString(),
        modality: naturalized.Modality as string,
        seriesDescription: naturalized.SeriesDescription as string,
        timezoneOffsetFromUtc: naturalized.TimezoneOffsetFromUTC as string,
        numberOfSeriesRelatedInstances: naturalized.NumberOfSeriesRelatedInstances?.toString(),
        performedProcedureStepStartDate: naturalized.PerformedProcedureStepStartDate as string,
        performedProcedureStepStartTime: naturalized.PerformedProcedureStepStartTime as string,
      },
      {
        resourceType: 'DicomSeries',
        filters: [
          { code: 'series-instance-uid', operator: Operator.EXACT, value: naturalized.SeriesInstanceUID as string },
        ],
      }
    );

    return repo.createResource<DicomInstance>({
      resourceType: 'DicomInstance',
      study: createReference(studyResult.resource),
      series: createReference(seriesResult.resource),
      rawData: createReference(binary),
      sopClassUid: naturalized.SOPClassUID as string,
      sopInstanceUid: naturalized.SOPInstanceUID as string,
      instanceAvailability: naturalized.InstanceAvailability as string,
      timezoneOffsetFromUtc: naturalized.TimezoneOffsetFromUTC as string,
      instanceNumber: naturalized.InstanceNumber as string,
      rows: naturalized.Rows as number,
      columns: naturalized.Columns as number,
      bitsAllocated: naturalized.BitsAllocated as number,
      numberOfFrames: naturalized.NumberOfFrames?.toString(),
    });
  }

  function sendStowResponse(instances: DicomInstance[]): void {
    res.status(200).json(
      DicomMetaDictionary.denaturalizeDataset({
        ReferencedSOPSequence: instances.map((instance) => ({
          ReferencedSOPClassUID: instance.sopClassUid,
          ReferencedSOPInstanceUID: instance.sopInstanceUid,
          RetrieveURL: `/instances/${instance.id}/raw`,
        })),
      })
    );
  }

  function handleError(err: unknown): void {
    getLogger().error('Error processing DICOM upload', { err });
    res.writeHead(400);
    res.end('Error processing DICOM upload');
  }

  let dicomwebMultipartParser;
  try {
    dicomwebMultipartParser = new DicomwebMultipartParser({
      headers: { 'content-type': contentType },
      ignorePartsWithoutDicomPreamble: false,
    });
  } catch (err) {
    handleError(err);
    return;
  }

  dicomwebMultipartParser.on('part', (part) => {
    const uploadStream = new PassThrough();
    const parseStream = new PassThrough();

    const uploadPromise = uploadBinaryData(repo, uploadStream, {
      contentType: 'application/dicom',
      filename: 'instance.dcm',
    });

    const parsePromise = parseDicomMetadata(parseStream);

    part.on('data', (chunk: Buffer) => {
      uploadStream.write(chunk);
      parseStream.write(chunk);
      // `dicomweb-multipart-parser` does not currently support pausing the stream when the internal buffer is full,
      // so we may need to implement our own backpressure handling if we encounter memory issues with large files.
    });

    part.on('end', () => {
      uploadStream.end();
      parseStream.end();
    });

    part.on('error', (err) => {
      uploadStream.destroy(err);
      parseStream.destroy(err);
    });

    promises.push(Promise.all([uploadPromise, parsePromise]).then(processInstance));
  });

  dicomwebMultipartParser.on('error', handleError);

  dicomwebMultipartParser.on('finish', () => {
    Promise.all(promises).then(sendStowResponse).catch(handleError);
  });

  req.pipe(dicomwebMultipartParser);
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
