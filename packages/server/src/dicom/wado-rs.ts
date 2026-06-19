// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType, isString, Operator } from '@medplum/core';
import type { Binary, DicomInstance, DicomSeries, DicomStudy } from '@medplum/fhirtypes';
import type { Request, Response } from 'express';
import { getAuthenticatedContext } from '../context';
import type { Repository } from '../fhir/repo';
import { getLogger } from '../logger';
import { getBinaryStorage } from '../storage/loader';

/**
 * Handles a DICOMweb WADO-RS "Retrieve series metadata" request.
 *
 * Request: GET {s}/studies/{study}/series/{series}/metadata
 *
 * See: https://dicom.nema.org/medical/dicom/current/output/html/part18.html#sect_10.4
 *
 * @param req - The HTTP request object, expected to contain the study UID and series UID as path parameters.
 * @param res - The HTTP response object, used to send back the WADO-RS response with the series metadata in DICOM JSON format.
 */
export async function handleRetrieveSeriesMetadata(req: Request, res: Response): Promise<void> {
  const { studyUid, seriesUid } = req.params;
  const result = await resolveStudySeries(studyUid, seriesUid, res);
  if (!result) {
    return;
  }
  const { repo, series } = result;
  const instances = await repo.searchResources<DicomInstance>({
    resourceType: 'DicomInstance',
    filters: [{ code: 'series', operator: Operator.EQUALS, value: `DicomSeries/${series.id}` }],
  });
  res
    .status(200)
    .type(ContentType.DICOM_JSON)
    .json(instances.map((instance) => JSON.parse(instance.metadata)));
}

/**
 * Handles a DICOM web WADO-RS "Retrieve frames in an instance" request.
 *
 * Request: GET	{s}/studies/{study}/series/{series}/instances/{instance}/frames/{frames}
 *
 * See: http://dicom.nema.org/medical/dicom/current/output/html/part18.html#sect_10.4
 *
 * @param req - The HTTP request object, expected to contain the instance UID and frame number as path parameters.
 * @param res - The HTTP response object, used to send back the WADO-RS response with the requested frame data in multipart/related format.
 */
export async function handleRetrieveInstanceFrame(req: Request, res: Response): Promise<void> {
  const { studyUid, seriesUid, instanceUid, frame } = req.params;
  if (!isString(instanceUid)) {
    res.status(400).json({ error: 'Invalid instance UID' });
    return;
  }

  if (!isString(frame)) {
    res.status(400).json({ error: 'Invalid frame number' });
    return;
  }

  const frameNumber = Number.parseInt(frame, 10);
  if (Number.isNaN(frameNumber) || frameNumber < 1) {
    res.status(400).json({ error: 'Invalid frame number' });
    return;
  }

  const result = await resolveStudySeries(studyUid, seriesUid, res);
  if (!result) {
    return;
  }
  const { repo, series } = result;

  const instance = await repo.searchOne<DicomInstance>({
    resourceType: 'DicomInstance',
    filters: [
      { code: 'series', operator: Operator.EQUALS, value: `DicomSeries/${series.id}` },
      { code: 'sop-instance-uid', operator: Operator.EXACT, value: instanceUid },
    ],
  });

  if (!instance) {
    res.status(404).json({ error: 'Instance not found' });
    return;
  }

  if (!instance.pixelData) {
    res.status(404).json({ error: 'Pixel data not found for instance' });
    return;
  }

  if (frameNumber > instance.pixelData.length) {
    res.status(416).json({ error: 'Requested frame number exceeds total frames available' });
    return;
  }

  try {
    const pixelDataBinary = await repo.readReference<Binary>(instance.pixelData[frameNumber - 1]);
    const stream = await getBinaryStorage().readBinary(pixelDataBinary);
    const boundary = `medplum-${Date.now()}`;
    const contentType = pixelDataBinary.contentType || 'application/octet-stream';
    const responseContentType = `multipart/related; type=${contentType}; boundary=${boundary}`;
    const header = Buffer.from(`--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`);
    const closing = Buffer.from(`\r\n--${boundary}--\r\n`);
    const chunks: Buffer[] = [header];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    chunks.push(closing);
    const output = Buffer.concat(chunks);
    res.status(200).contentType(responseContentType).send(output);
  } catch (err) {
    getLogger().error('Error reading pixel data for instance', { instanceId: instance.id, err });
    res.status(500).json({ error: 'Error reading pixel data' });
  }
}

interface StudySeriesResult {
  readonly repo: Repository;
  readonly series: DicomSeries;
}

async function resolveStudySeries(
  studyUid: unknown,
  seriesUid: unknown,
  res: Response
): Promise<StudySeriesResult | undefined> {
  if (!isString(studyUid)) {
    res.status(400).json({ error: 'Invalid study UID' });
    return undefined;
  }

  if (!isString(seriesUid)) {
    res.status(400).json({ error: 'Invalid series UID' });
    return undefined;
  }

  const { repo } = getAuthenticatedContext();
  const study = await repo.searchOne<DicomStudy>({
    resourceType: 'DicomStudy',
    filters: [{ code: 'study-instance-uid', operator: Operator.EXACT, value: studyUid }],
  });

  if (!study) {
    res.status(404).json({ error: 'Study not found' });
    return undefined;
  }

  const series = await repo.searchOne<DicomSeries>({
    resourceType: 'DicomSeries',
    filters: [
      { code: 'study', operator: Operator.EQUALS, value: `DicomStudy/${study.id}` },
      { code: 'series-instance-uid', operator: Operator.EXACT, value: seriesUid },
    ],
  });

  if (!series) {
    res.status(404).json({ error: 'Series not found' });
    return undefined;
  }

  return { repo, series };
}
