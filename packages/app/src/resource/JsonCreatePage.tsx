// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Group, JsonInput } from '@mantine/core';
import { stringify } from '@medplum/core';
import { OperationOutcome } from '@medplum/fhirtypes';
import { Document, Form, OperationOutcomeAlert } from '@medplum/react';
import { JSX, useCallback, useState } from 'react';
import { useParams } from 'react-router';
import { useCreateResource } from './useCreateResource';

export function JsonCreatePage(): JSX.Element {
  const { resourceType } = useParams();
  const [outcome, setOutcome] = useState<OperationOutcome | undefined>();
  const { defaultValue, handleSubmit } = useCreateResource(resourceType, setOutcome);

  const handleFormSubmit = useCallback(
    (formData: Record<string, string>) => {
      handleSubmit(JSON.parse(formData['new-resource']));
    },
    [handleSubmit]
  );

  return (
    <Document>
      {outcome && <OperationOutcomeAlert outcome={outcome} />}
      <Form onSubmit={handleFormSubmit}>
        <JsonInput
          name="new-resource"
          data-testid="create-resource-json"
          autosize
          minRows={24}
          defaultValue={stringify(defaultValue, true)}
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
