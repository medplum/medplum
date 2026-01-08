// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Anchor } from '@mantine/core';
import type { ResourceType } from '@medplum/fhirtypes';
import { Document, QuestionnaireForm } from '@medplum/react';
import { IconAlertCircle } from '@tabler/icons-react';
import type { JSX } from 'react';

export interface QuestionnairePreviewProps {
  readonly resourceType: ResourceType;
  readonly id: string;
}

export function QuestionnairePreview(props: QuestionnairePreviewProps): JSX.Element {
  const { resourceType, id } = props;

  return (
    <Document>
      <Alert icon={<IconAlertCircle size={16} />} mb="xl">
        This is just a preview! Access your form here:
        <br />
        <Anchor href={`/forms/${id}`}>{`/forms/${id}`}</Anchor>
      </Alert>
      <QuestionnaireForm
        questionnaire={{ reference: resourceType + '/' + id }}
        onSubmit={() => alert('You submitted the preview')}
      />
    </Document>
  );
}
