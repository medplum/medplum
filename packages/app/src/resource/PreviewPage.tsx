import { Alert, Anchor } from '@mantine/core';
import { ResourceType } from '@medplum/fhirtypes';
import { Document, QuestionnaireForm, useResource } from '@medplum/react';
import { IconAlertCircle } from '@tabler/icons-react';
import { useParams } from 'react-router-dom';

export function PreviewPage(): JSX.Element | null {
  const { resourceType, id } = useParams() as { resourceType: ResourceType; id: string };
  const resource = useResource({ reference: resourceType + '/' + id });

  if (!resource) {
    return null;
  }

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
