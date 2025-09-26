// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  BotEvent,
  ContentType,
  createReference,
  getQuestionnaireAnswers,
  isDateTimeString,
  MedplumClient,
} from '@medplum/core';
import { Media, QuestionnaireResponse } from '@medplum/fhirtypes';
import { generateQRDACategoryI } from '../utils/qrda-generator';
import JSZip from 'jszip';

/**
 * Generates QRDA Category I XML files for ONC C1 certification (315.c.1) - Record and Export capability.
 *
 * For each patient in the provided list, this bot creates a QRDA Cat I XML file covering the specified period.
 * Each file is named using the pattern: `<index>-<patient-name>.xml`
 *
 * Returns a ZIP archive containing all generated QRDA Cat I XML files.
 *
 * @param medplum - The Medplum client instance.
 * @param event - The bot event containing measure, period, and patient IDs.
 * @returns Media resource containing the ZIP file
 */
export async function handler(medplum: MedplumClient, event: BotEvent<QuestionnaireResponse>): Promise<Media> {
  const { input: questionnaireResponse } = event;

  const answers = getQuestionnaireAnswers(questionnaireResponse);
  const measure = answers['measure']?.valueCoding?.code;
  const periodStart = answers['measure-period-start']?.valueString;
  const periodEnd = answers['measure-period-end']?.valueString;
  const patientIds = answers['patient-ids']?.valueString?.split(',');

  if (measure !== 'cms68v14') {
    throw new Error(`Not supported measure: ${measure}`);
  }

  if (!periodStart || !periodEnd || !patientIds) {
    throw new Error('Missing required fields');
  }

  if (!isDateTimeString(periodStart) || !isDateTimeString(periodEnd)) {
    throw new Error('Period start and end must be date time strings');
  }

  const zip = new JSZip();
  const mediaResources: Media[] = [];

  for (let i = 0; i < patientIds.length; i++) {
    const patientId = patientIds[i];
    const patient = await medplum.readResource('Patient', patientId);

    // Create QuestionnaireResponse resource
    questionnaireResponse.subject = createReference(patient);
    await medplum.createResource(questionnaireResponse);

    const givenName = patient.name?.[0].given?.[0];
    const familyName = patient.name?.[0].family;
    const fileName = `${i}_${givenName}_${familyName}.xml`;
    const xml = await generateQRDACategoryI(medplum, {
      patientId,
      measurePeriodStart: periodStart,
      measurePeriodEnd: periodEnd,
    });

    if (!xml) {
      console.log(
        `Skipping Patient ${patientId} because it has no data to export for the period ${periodStart} to ${periodEnd}`
      );
      continue;
    }

    // Add document to ZIP
    zip.file(fileName, xml);

    // Create individual Media resources for each XML
    const binary = await medplum.createResource({
      resourceType: 'Binary',
      contentType: ContentType.CDA_XML,
      data: Buffer.from(xml, 'utf-8').toString('base64'),
    });
    const media: Media = {
      resourceType: 'Media',
      status: 'completed',
      content: {
        contentType: ContentType.CDA_XML,
        url: `Binary/${binary.id}`,
        title: fileName,
      },
      subject: createReference(patient),
    };
    mediaResources.push(await medplum.createResource(media));
  }

  // Generate ZIP file
  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
  const zipFileName = `CMS68v14_${new Date().toISOString()}.qrda.zip`;

  // Create Media resource for the ZIP file
  const zipBinary = await medplum.createResource({
    resourceType: 'Binary',
    contentType: 'application/zip',
    data: zipBuffer.toString('base64'),
  });
  const zipMedia: Media = {
    resourceType: 'Media',
    status: 'completed',
    content: {
      contentType: 'application/zip',
      url: `Binary/${zipBinary.id}`,
      title: zipFileName,
    },
  };

  const createdZipMedia = await medplum.createResource(zipMedia);
  return createdZipMedia;
}
