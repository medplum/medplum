// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createReference, isString, Operator } from '@medplum/core';
import type { Binary, DicomInstance, DicomSeries, DicomStudy } from '@medplum/fhirtypes';
import type { DcmjsDicomDict } from 'dcmjs';
import dcmjs from 'dcmjs';
import DicomwebMultipartParser from 'dicomweb-multipart-parser';
import type { Request, Response } from 'express';
import { PassThrough } from 'stream';
import { getAuthenticatedContext } from '../context';
import { uploadBinaryData } from '../fhir/binary';
import { getLogger } from '../logger';
import { cleanDicomJsonDict, dcmjsSeriesToMedplumSeries, dcmjsStudyToMedplumStudy } from './utils';

// eslint-disable-next-line import/no-named-as-default-member
const { async, data, utilities } = dcmjs;
const { AsyncDicomReader } = async;
const { DicomMetaDictionary } = data;
const { DicomMetadataListener } = utilities;

/**
 * Handles a DICOMweb STOW-RS "Store Transaction" request.
 *
 * See: https://dicom.nema.org/medical/dicom/current/output/html/part18.html#sect_10.5
 *
 * @param req - The HTTP request object, expected to contain a multipart/related body with DICOM files.
 * @param res - The HTTP response object, used to send back the STOW-RS response with references to the stored instances.
 */
export async function handleStoreInstances(req: Request, res: Response): Promise<void> {
  const contentType = req.headers['content-type'];
  if (!contentType?.includes('multipart/related')) {
    res.status(415).json({ error: 'Expected multipart/related' });
    return;
  }

  const ctx = getAuthenticatedContext();
  const repo = ctx.repo;
  const promises: Promise<DicomInstance>[] = [];

  async function parseDicomMetadata(stream: PassThrough): Promise<DcmjsDicomDict> {
    const listener = new DicomMetadataListener({
      untilOffset: 100 * 1024, // Read only the first 100 KB for metadata extraction
    });
    listener.startObject({});
    const reader = new AsyncDicomReader({});
    await reader.stream.fromAsyncStream(stream);
    const result = await reader.readFile({ listener });
    return cleanDicomJsonDict({ ...result.meta, ...result.dict });
  }

  async function processInstance([binary, dict]: [Binary, DcmjsDicomDict]): Promise<DicomInstance> {
    const naturalized = DicomMetaDictionary.naturalizeDataset(dict) as Record<string, unknown>;

    const studyResult = await repo.conditionalCreate<DicomStudy>(dcmjsStudyToMedplumStudy(naturalized), {
      resourceType: 'DicomStudy',
      filters: [
        { code: 'study-instance-uid', operator: Operator.EXACT, value: naturalized.StudyInstanceUID as string },
      ],
    });

    const seriesResult = await repo.conditionalCreate<DicomSeries>(
      dcmjsSeriesToMedplumSeries(createReference(studyResult.resource), naturalized),
      {
        resourceType: 'DicomSeries',
        filters: [
          { code: 'series-instance-uid', operator: Operator.EXACT, value: naturalized.SeriesInstanceUID as string },
        ],
      }
    );

    let instanceNumber: string;
    if (isString(naturalized.InstanceNumber)) {
      instanceNumber = naturalized.InstanceNumber;
    } else if (typeof naturalized.InstanceNumber === 'number') {
      instanceNumber = naturalized.InstanceNumber.toString();
    } else {
      instanceNumber = '1'; // Default to "1" if InstanceNumber is missing or invalid, as it is a required field in DICOM
    }

    return repo.createResource<DicomInstance>({
      resourceType: 'DicomInstance',
      study: createReference(studyResult.resource),
      series: createReference(seriesResult.resource),
      raw: createReference(binary),
      metadata: JSON.stringify(dict),
      sopClassUid: naturalized.SOPClassUID as string,
      sopInstanceUid: naturalized.SOPInstanceUID as string,
      instanceAvailability: naturalized.InstanceAvailability as string,
      timezoneOffsetFromUtc: naturalized.TimezoneOffsetFromUTC as string,
      instanceNumber: instanceNumber,
      rows: naturalized.Rows as number,
      columns: naturalized.Columns as number,
      bitsAllocated: naturalized.BitsAllocated as number,
      numberOfFrames: naturalized.NumberOfFrames as number,
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
}
