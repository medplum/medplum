import { Button, Group, Stack, TextInput } from '@mantine/core';
import { capitalize, deepClone, IndexedStructureDefinition } from '@medplum/core';
import { ElementDefinition, ElementDefinitionType, OperationOutcome, Reference, Resource } from '@medplum/fhirtypes';
import React, { useEffect, useState } from 'react';
import { BackboneElementInput } from '../BackboneElementInput/BackboneElementInput';
import { FormSection } from '../FormSection/FormSection';
import { useMedplum } from '../MedplumProvider/MedplumProvider';
import { useResource } from '../useResource/useResource';

export interface ResourceFormProps {
  defaultValue: Resource | Reference;
  outcome?: OperationOutcome;
  onSubmit: (resource: Resource) => void;
  onDelete?: (resource: Resource) => void;
}

export function ResourceForm(props: ResourceFormProps): JSX.Element {
  const medplum = useMedplum();
  const defaultValue = useResource(props.defaultValue);
  const [schema, setSchema] = useState<IndexedStructureDefinition | undefined>();
  const [value, setValue] = useState<Resource | undefined>();

  useEffect(() => {
    if (defaultValue) {
      setValue(deepClone(defaultValue));
      medplum.requestSchema(defaultValue.resourceType).then(setSchema).catch(console.log);
    }
  }, [medplum, defaultValue]);

  if (!schema || !value) {
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

export function setPropertyValue(
  obj: any,
  key: string,
  propName: string,
  elementDefinition: ElementDefinition,
  value: any
): any {
  const types = elementDefinition.type as ElementDefinitionType[];
  if (types.length > 1) {
    for (const type of types) {
      const compoundKey = key.replace('[x]', capitalize(type.code as string));
      if (compoundKey in obj) {
        delete obj[compoundKey];
      }
    }
  }
  obj[propName] = value;
  return obj;
}
