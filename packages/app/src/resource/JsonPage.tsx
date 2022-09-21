import { Button, JsonInput } from '@mantine/core';
import { stringify } from '@medplum/core';
import { Resource } from '@medplum/fhirtypes';
import { Form } from '@medplum/react';
import React from 'react';

export interface JsonPageProps {
  resource: Resource;
  onSubmit: (resource: Resource) => void;
}

export function JsonPage(props: JsonPageProps): JSX.Element {
  return (
    <Form
      onSubmit={(formData: Record<string, string>) => {
        props.onSubmit(JSON.parse(formData.resource));
      }}
    >
      <JsonInput name="resource" style={{ height: 400 }} defaultValue={stringify(props.resource, true)} />
      <Button type="submit">OK</Button>
    </Form>
  );
}
