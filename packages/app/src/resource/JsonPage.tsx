import { Button, Group, JsonInput } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { normalizeErrorString, stringify } from '@medplum/core';
import { OperationOutcome, ResourceType } from '@medplum/fhirtypes';
import { Document, Form, OperationOutcomeAlert, useMedplum, useResource } from '@medplum/react';
import { useCallback, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { cleanResource } from './utils';

export function JsonPage(): JSX.Element | null {
  const medplum = useMedplum();
  const { resourceType, id } = useParams() as { resourceType: ResourceType; id: string };
  const resource = useResource({ reference: resourceType + '/' + id });
  const navigate = useNavigate();
  const [outcome, setOutcome] = useState<OperationOutcome | undefined>();

  const handleSubmit = useCallback(
    (formData: Record<string, string>): void => {
      medplum
        .updateResource(cleanResource(JSON.parse(formData.resource)))
        .then(() => {
          setOutcome(undefined);
          navigate(`/${resourceType}/${id}/details`);
          showNotification({ color: 'green', message: 'Success' });
        })
        .catch((err) => {
          showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
        });
    },
    [medplum, resourceType, id, navigate]
  );

  if (!resource) {
    return null;
  }

  return (
    <Document>
      {outcome && <OperationOutcomeAlert outcome={outcome} />}
      <Form onSubmit={handleSubmit}>
        <JsonInput
          name="resource"
          data-testid="resource-json"
          autosize
          minRows={24}
          defaultValue={stringify(resource, true)}
          formatOnBlur
          deserialize={JSON.parse}
        />
        <Group justify="flex-end" mt="xl" wrap="nowrap">
          <Button type="submit">OK</Button>
        </Group>
      </Form>
    </Document>
  );
}
