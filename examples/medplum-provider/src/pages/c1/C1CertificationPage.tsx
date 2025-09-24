// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { IconCheck, IconX } from '@tabler/icons-react';
import { Box, Paper, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { ContentType, getDisplayString, normalizeErrorString } from '@medplum/core';
import { Media, Questionnaire, QuestionnaireResponse } from '@medplum/fhirtypes';
import { Document, Loading, QuestionnaireForm, useMedplum, useResource } from '@medplum/react';
import { JSX, useState } from 'react';
import { useLocation, useParams } from 'react-router';
import { C1_CERTIFICATION_BOT_IDENTIFIER, MEDPLUM_BOTS } from '../../constants';

export function C1CertificationPage(): JSX.Element {
  const { id } = useParams() as { id: string };
  const location = useLocation();
  const queryParams = Object.fromEntries(new URLSearchParams(location.search).entries()) as Record<string, string>;
  const subjectParam = queryParams.subject;
  const [subjectList] = useState<string[] | undefined>(subjectParam?.split(','));
  const questionnaire = useResource<Questionnaire>({ reference: `Questionnaire/${id}` });
  const medplum = useMedplum();

  async function handleSubmit(questionnaireResponse: QuestionnaireResponse): Promise<void> {
    if (!questionnaire) {
      return;
    }

    if (subjectList && subjectList.length > 0) {
      const patientIds = subjectList.map((subject) => subject.split('/')[1]).join(',');
      questionnaireResponse.item = questionnaireResponse.item || [];
      questionnaireResponse.item.push({
        linkId: 'patient-ids',
        answer: [{ valueString: patientIds }],
      });
    }

    const { id: notificationId, title: notificationTitle } = questionnaire;
    notifications.show({
      id: notificationId,
      title: notificationTitle,
      loading: true,
      message: 'Generating QRDA files...',
      autoClose: false,
      withCloseButton: false,
    });

    try {
      const zipMedia: Media = await medplum.executeBot(
        {
          system: MEDPLUM_BOTS,
          value: C1_CERTIFICATION_BOT_IDENTIFIER,
        },
        questionnaireResponse,
        ContentType.FHIR_JSON
      );

      if (zipMedia.content?.url) {
        saveFile(zipMedia.content.url, zipMedia.content?.title || `CMS68v14_${new Date().toISOString()}.qrda.zip`);
      }

      notifications.update({
        id: notificationId,
        title: notificationTitle,
        color: 'green',
        message: 'Done',
        icon: <IconCheck size="1rem" />,
        loading: false,
        autoClose: true,
        withCloseButton: true,
      });
    } catch (error) {
      notifications.update({
        id: notificationId,
        title: notificationTitle,
        color: 'red',
        message: normalizeErrorString(error),
        icon: <IconX size="1rem" />,
        loading: false,
        autoClose: false,
        withCloseButton: true,
      });
    }
  }

  if (!questionnaire) {
    return <Loading />;
  }

  return (
    <>
      <Paper shadow="xs" radius={0}>
        <Box px="xl" py="md">
          <Text>
            {questionnaire?.title || getDisplayString(questionnaire)}
            {subjectList && <>&nbsp;(for {subjectList.length} resources)</>}
          </Text>
        </Box>
      </Paper>
      <Document>
        <QuestionnaireForm questionnaire={questionnaire} onSubmit={handleSubmit} />
      </Document>
    </>
  );
}

/**
 * Tricks the browser into downloading a file.
 *
 * This function creates a temporary anchor (<a>) element and simulates a click
 * to trigger a file download in the browser.
 *
 * See: https://stackoverflow.com/a/19328891
 *
 * @param url - The URL of the file to save.
 * @param fileName - The name of the file to save.
 */
function saveFile(url: string, fileName: string): void {
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
