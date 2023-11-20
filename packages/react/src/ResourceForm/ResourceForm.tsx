import { Button, Group, Stack, TextInput } from '@mantine/core';
import { deepClone } from '@medplum/core';
import { OperationOutcome, Reference, Resource } from '@medplum/fhirtypes';
import { useMedplum, useResource } from '@medplum/react-hooks';
import { FormEvent, useEffect, useState } from 'react';
import { BackboneElementInput } from '../BackboneElementInput/BackboneElementInput';
import { FormSection } from '../FormSection/FormSection';
import { ResourceFormContext, ResourceFormContextType } from './ResourceForm.utils';

export interface ResourceFormProps {
  defaultValue: Resource | Reference;
  outcome?: OperationOutcome;
  onSubmit: (resource: Resource) => void;
  onDelete?: (resource: Resource) => void;
  schemaName?: string;
}

export function ResourceForm(props: ResourceFormProps): JSX.Element {
  const { outcome } = props;
  const medplum = useMedplum();
  const defaultValue = useResource(props.defaultValue);
  const [schemaLoaded, setSchemaLoaded] = useState<string>();
  const [value, setValue] = useState<Resource | undefined>();

  useEffect(() => {
    if (defaultValue) {
      setValue(deepClone(defaultValue));
      const schemaName = props.schemaName ?? defaultValue?.resourceType;
      console.debug(`requesting schema for ${schemaName}`);
      medplum
        .requestSchema(schemaName)
        .then(() => setSchemaLoaded(schemaName))
        .catch(console.log);
    }
  }, [medplum, defaultValue, props.schemaName]);

  const contextValue: ResourceFormContextType = {
    includeExtensions: true,
  };

  if (!schemaLoaded || !value) {
    return <div>Loading...</div>;
  }

  return (
    <form
      noValidate
      autoComplete="off"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        if (props.onSubmit) {
          props.onSubmit(value);
        }
      }}
    >
      <ResourceFormContext.Provider value={contextValue}>
        <Stack mb="xl">
          <FormSection title="Resource Type" htmlFor="resourceType" outcome={outcome}>
            <TextInput name="resourceType" defaultValue={value.resourceType} disabled={true} />
          </FormSection>
          <FormSection title="ID" htmlFor="id" outcome={outcome}>
            <TextInput name="id" defaultValue={value.id} disabled={true} />
          </FormSection>
        </Stack>
        <BackboneElementInput
          typeName={schemaLoaded}
          defaultValue={value}
          outcome={outcome}
          onChange={setValue}
          type={undefined}
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
      </ResourceFormContext.Provider>
    </form>
  );
}
