import { stringify } from '@medplum/core';
import { Resource } from '@medplum/fhirtypes';
import { Button, Form, TextArea } from '@medplum/react';
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
      <TextArea
        testid="resource-json"
        name="resource"
        monospace={true}
        style={{ height: 400 }}
        defaultValue={stringify(props.resource, true)}
      />
      <Button type="submit">OK</Button>
    </Form>
  );
}
