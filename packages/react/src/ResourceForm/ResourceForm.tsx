import { Button, Group, Stack, TextInput } from '@mantine/core';
import { deepClone } from '@medplum/core';
import { OperationOutcome, Reference, Resource } from '@medplum/fhirtypes';
import { useMedplum, useResource } from '@medplum/react-hooks';
import React, { useEffect, useState } from 'react';
import { BackboneElementInput } from '../BackboneElementInput/BackboneElementInput';
import { FormSection } from '../FormSection/FormSection';

export interface ResourceFormProps {
  defaultValue: Resource | Reference;
  outcome?: OperationOutcome;
  onSubmit: (resource: Resource) => void;
  onDelete?: (resource: Resource) => void;
}

export function ResourceForm(props: ResourceFormProps): JSX.Element {
  const medplum = useMedplum();
  const defaultValue = useResource(props.defaultValue);
  const [schemaLoaded, setSchemaLoaded] = useState(false);
  const [value, setValue] = useState<Resource | undefined>();

  useEffect(() => {
    if (defaultValue) {
      setValue(deepClone(defaultValue));
      medplum
        .requestSchema(defaultValue.resourceType)
        .then(() => setSchemaLoaded(true))
        .catch(console.log);
    }
  }, [medplum, defaultValue]);

  if (!schemaLoaded || !value) {
    return <div>Loading...</div>;
  }

  return (
    <form
      noValidate
      autoComplete="off"
      onSubmit={(e: React.FormEvent) => {
        e.preventDefault();
        if (props.onSubmit) {
          props.onSubmit(value);
        }
      }}
    >
      <Stack mb="xl">
        <FormSection title="Resource Type" htmlFor="resourceType" outcome={props.outcome}>
          <TextInput name="resourceType" defaultValue={value.resourceType} disabled={true} />
        </FormSection>
        <FormSection title="ID" htmlFor="id" outcome={props.outcome}>
          <TextInput name="id" defaultValue={value.id} disabled={true} />
        </FormSection>
      </Stack>
      <BackboneElementInput
        typeName={value.resourceType}
        defaultValue={value}
        outcome={props.outcome}
        onChange={setValue}
      />
      <Group position="right" mt="xl">
        <Button type="submit">OK</Button>
        {props.onDelete && (
          <Button
            variant="outline"
            color="red"
            type="button"
            onClick={() => {
              (props.onDelete as (resource: Resource) => void)(value);
            }}
          >
            Delete
          </Button>
        )}
      </Group>
    </form>
  );
}
