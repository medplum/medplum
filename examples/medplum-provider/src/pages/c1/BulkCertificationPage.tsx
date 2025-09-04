// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Stack, Text, Title } from '@mantine/core';
import { Questionnaire } from '@medplum/fhirtypes';
import { Document, Loading, MedplumLink, useSearchResources } from '@medplum/react';
import { useNavigate, useParams } from 'react-router';
import { C1_CERTIFICATION_QUESTIONNAIRE_IDENTIFIER } from '../../constants';

export function BulkCertificationPage(): React.JSX.Element {
  const navigate = useNavigate();
  const { resourceType } = useParams() as {
    resourceType: string;
    id: string;
  };
  const queryParams = Object.fromEntries(new URLSearchParams(location.search).entries()) as Record<string, string>;
  const ids = (queryParams.ids || '').split(',').filter((e) => !!e);
  const [questionnaires] = useSearchResources('Questionnaire', `subject-type=${resourceType}`);

  function getQuestionnaireLink(questionnaire: Questionnaire): string {
    switch (questionnaire.identifier?.[0]?.value) {
      case C1_CERTIFICATION_QUESTIONNAIRE_IDENTIFIER:
        return `/c1/${questionnaire.id}?subject=` + ids.map((id) => `${resourceType}/${id}`).join(',');
      default:
        return `/forms/${questionnaire.id}?subject=` + ids.map((id) => `${resourceType}/${id}`).join(',');
    }
  }

  if (!questionnaires) {
    return <Loading />;
  }

  if (questionnaires.length === 0) {
    return (
      <Document>
        <Title order={1} mb="md">
          No certifications for {resourceType}
        </Title>
        <Button onClick={() => navigate(-1)} variant="outline">
          Back
        </Button>
      </Document>
    );
  }

  return (
    <Document>
      <Title order={1} mb="md">
        Certifications for {resourceType}
      </Title>
      <Stack gap="sm">
        {questionnaires.map((questionnaire) => (
          <Stack key={questionnaire.id} gap="xs">
            <MedplumLink to={getQuestionnaireLink(questionnaire)}>
              <Title order={6}>{questionnaire.title}</Title>
            </MedplumLink>
            <Text c="dimmed">{questionnaire.description}</Text>
          </Stack>
        ))}
      </Stack>
    </Document>
  );
}
