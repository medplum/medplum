import { showNotification } from '@mantine/notifications';
import { normalizeErrorString } from '@medplum/core';
import { Resource, ResourceType } from '@medplum/fhirtypes';
import { Document, PlanDefinitionBuilder, QuestionnaireBuilder, useMedplum } from '@medplum/react';
import { useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { cleanResource } from './utils';

export function BuilderPage(): JSX.Element | null {
  const medplum = useMedplum();
  const { resourceType, id } = useParams() as { resourceType: ResourceType; id: string };
  const reference = { reference: resourceType + '/' + id };

  const handleSubmit = useCallback(
    (newResource: Resource): void => {
      medplum
        .updateResource(cleanResource(newResource))
        .then(() => {
          showNotification({ color: 'green', message: 'Success' });
        })
        .catch((err) => {
          showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
        });
    },
    [medplum]
  );

  switch (resourceType) {
    case 'PlanDefinition':
      return (
        <Document>
          <PlanDefinitionBuilder value={reference} onSubmit={handleSubmit} />
        </Document>
      );
    case 'Questionnaire':
      return (
        <Document>
          <QuestionnaireBuilder questionnaire={reference} onSubmit={handleSubmit} />
        </Document>
      );
    default:
      return null;
  }
}
