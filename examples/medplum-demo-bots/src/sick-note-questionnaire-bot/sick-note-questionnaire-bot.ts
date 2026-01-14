// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { BotEvent, MedplumClient } from '@medplum/core';
import { createReference, getQuestionnaireAnswers } from '@medplum/core';
import type { DocumentReference, QuestionnaireResponse } from '@medplum/fhirtypes';

export async function handler(
  medplum: MedplumClient,
  event: BotEvent<QuestionnaireResponse>
): Promise<DocumentReference | null> {
  console.log('Processing sick note questionnaire response:', event.input?.id);
  console.log('Questionnaire response subject:', event.input?.subject);
  console.log('Questionnaire response author:', event.input?.author);

  // Get all of the answers from the questionnaire response
  const answers = getQuestionnaireAnswers(event.input);

  // Get signature data if available
  const signatureExtension = event.input.extension?.find(
    (ext) => ext.url === 'http://hl7.org/fhir/StructureDefinition/questionnaireresponse-signature'
  );
  const signatureData = signatureExtension?.valueSignature?.data;
  console.log('Signature data available:', !!signatureData);

  // Check if sick note is needed
  const sickNoteNeeded = answers['sick-note-needed']?.valueBoolean;
  if (!sickNoteNeeded) {
    console.log('No sick note needed, skipping PDF generation');
    return null;
  }

  // Get the required information
  const daysOfSickNote = answers['days-of-sick-note']?.valueInteger;
  const otherInformation = answers['other-information']?.valueString;

  if (!daysOfSickNote) {
    console.log('Missing number of days for sick note');
    return null;
  }

  // Get patient information
  const patientId = event.input.subject?.reference?.split('/')[1];
  if (!patientId) {
    console.log('No patient ID found in questionnaire response subject');
  }

  let patient;
  let patientName = 'Patient';

  if (patientId) {
    try {
      patient = await medplum.readResource('Patient', patientId);
      if (patient?.name?.[0]) {
        const givenNames = patient.name[0].given?.join(' ') || '';
        const familyName = patient.name[0].family || '';
        patientName = `${givenNames} ${familyName}`.trim() || 'Patient';
      }
    } catch (error) {
      console.log('Could not fetch patient info, using default name:', error);
      patient = null;
    }
  }

  // Get practitioner information (from the questionnaire response author or default)
  let practitionerName = 'Healthcare Provider';
  if (event.input.author?.reference) {
    try {
      const practitionerId = event.input.author.reference.split('/')[1];
      if (practitionerId) {
        const practitioner = await medplum.readResource('Practitioner', practitionerId);
        practitionerName = practitioner.name?.[0]
          ? `${practitioner.name[0].prefix?.join(' ')} ${practitioner.name[0].given?.join(' ')} ${practitioner.name[0].family}`
          : 'Healthcare Provider';
      } else {
        console.log('No practitioner ID found in author reference');
      }
    } catch (error) {
      console.log('Could not fetch practitioner info, using default name:', error);
    }
  }

  // Get current date
  const currentDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // Create the PDF content
  const pdfContent = [
    {
      text: `${currentDate}`,
      alignment: 'right' as const,
      margin: [0, 0, 0, 20],
    },
    {
      text: 'Example Healthcare\n98 Battery St',
      alignment: 'left' as const,
      margin: [0, 0, 0, 20],
    },
    {
      text: 'To Whom It May Concern,',
      margin: [0, 0, 0, 20],
    },
    {
      text: `Please excuse ${patientName} for ${daysOfSickNote} days.`,
      margin: [0, 0, 0, 20],
    },
    ...(otherInformation
      ? [
          {
            text: otherInformation,
            margin: [0, 0, 0, 20],
          },
        ]
      : []),
    {
      text: 'Sincerely,',
      margin: [0, 20, 0, 10],
    },
    {
      text: practitionerName,
      margin: [0, 0, 0, 20],
    },
    // Add signature image if available
    ...(signatureData
      ? [
          {
            image: `data:image/png;base64,${signatureData}`,
            width: 200,
            alignment: 'left' as const,
            margin: [0, 20, 0, 0],
          },
        ]
      : []),
  ];

  // Generate the PDF
  const binary = await medplum.createPdf({
    docDefinition: {
      content: pdfContent as any,
      styles: {
        header: {
          fontSize: 16,
          bold: true,
          margin: [0, 0, 0, 10],
        },
      },
    },
  });

  // Create a DocumentReference to reference the created PDF
  const documentReference = await medplum.createResource<DocumentReference>({
    resourceType: 'DocumentReference',
    status: 'current',
    subject: patient ? createReference(patient) : undefined,
    author: event.input.author ? [event.input.author] : undefined,
    content: [
      {
        attachment: {
          contentType: 'application/pdf',
          url: 'Binary/' + binary.id,
          title: `Sick Note - ${patientName} - ${currentDate}.pdf`,
        },
      },
    ],
    context: {
      related: [createReference(event.input)],
    },
  });

  console.log('Created sick note PDF:', documentReference.id);
  return documentReference;
}
