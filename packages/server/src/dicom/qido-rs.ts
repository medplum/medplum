// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { isString, Operator } from '@medplum/core';
import type { DicomSeries, DicomStudy } from '@medplum/fhirtypes';
import dcmjs from 'dcmjs';
import type { Request, Response } from 'express';
import { getAuthenticatedContext } from '../context';
import { medplumSeriesToDcmjsSeries, medplumStudyToDcmjsStudy } from './utils';

// eslint-disable-next-line import/no-named-as-default-member
const { data } = dcmjs;
const { DicomMetaDictionary } = data;

/**
 * Handles a DICOMweb QIDO-RS "Query based on ID for DICOM Objects" request for the /studies endpoint.
 *
 * Request: GET {s}/studies?...
 *
 * See: https://dicom.nema.org/medical/dicom/current/output/html/part18.html#sect_10.6
 *
 * @param req - The HTTP request object, expected to contain query parameters for filtering DICOM studies.
 * @param res - The HTTP response object, used to send back the QIDO-RS response with matching DICOM studies.
 */
export async function handleSearchStudies(req: Request, res: Response): Promise<void> {
  const { repo } = getAuthenticatedContext();
  const studies = await repo.searchResources<DicomStudy>({ resourceType: 'DicomStudy' });
  res
    .status(200)
    .json(studies.map((study) => DicomMetaDictionary.denaturalizeDataset(medplumStudyToDcmjsStudy(study))));
}

/**
 * Handles a DICOMweb QIDO-RS "Query based on ID for DICOM Objects" request for the /studies/{studyUid}/series endpoint.
 *
 * Request: GET {s}/studies/{studyUid}/series?...
 *
 * See: https://dicom.nema.org/medical/dicom/current/output/html/part18.html#sect_10.6
 *
 * @param req - The HTTP request object, expected to contain the study UID as a path parameter.
 * @param res - The HTTP response object, used to send back the QIDO-RS response with matching DICOM series.
 */
export async function handleSearchSeries(req: Request, res: Response): Promise<void> {
  const { studyUid } = req.params;
  if (!isString(studyUid)) {
    res.status(400).json({ error: 'Invalid study UID' });
    return;
  }

  const { repo } = getAuthenticatedContext();
  const study = await repo.searchOne<DicomStudy>({
    resourceType: 'DicomStudy',
    filters: [{ code: 'study-instance-uid', operator: Operator.EXACT, value: studyUid }],
  });

  if (!study) {
    res.status(404).json({ error: 'Study not found' });
    return;
  }

  const seriesList = await repo.searchResources<DicomSeries>({
    resourceType: 'DicomSeries',
    filters: [{ code: 'study', operator: Operator.EQUALS, value: `DicomStudy/${study.id}` }],
  });

  res
    .status(200)
    .json(
      seriesList.map((series) => DicomMetaDictionary.denaturalizeDataset(medplumSeriesToDcmjsSeries(study, series)))
    );
}
