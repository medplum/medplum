import { Button, Group, Stack, TextInput } from '@mantine/core';
import { applyDefaultValuesToResource, tryGetProfile } from '@medplum/core';
import { OperationOutcome, Reference, Resource } from '@medplum/fhirtypes';
import { useMedplum, useResource } from '@medplum/react-hooks';
import { FormEvent, useEffect, useState } from 'react';
import { BackboneElementInput } from '../BackboneElementInput/BackboneElementInput';
import { FormSection } from '../FormSection/FormSection';

export interface ResourceFormProps {
  readonly defaultValue: Partial<Resource> | Reference;
  readonly outcome?: OperationOutcome;
  readonly onSubmit: (resource: Resource) => void;
  readonly onDelete?: (resource: Resource) => void;
  readonly schemaName?: string;
  /** (optional) URL of the resource profile used to display the form. Takes priority over schemaName. */
  readonly profileUrl?: string;
}

export function ResourceForm(props: ResourceFormProps): JSX.Element {
  const { outcome } = props;
  const medplum = useMedplum();
  const defaultValue = useResource(props.defaultValue);
  const [schemaLoaded, setSchemaLoaded] = useState<string>();
  const [value, setValue] = useState<Resource>();

  useEffect(() => {
    if (defaultValue) {
      if (props.profileUrl) {
        const profileUrl: string = props.profileUrl;
        medplum
          .requestProfileSchema(props.profileUrl, { expandProfile: true })
          .then(() => {
            const profile = tryGetProfile(profileUrl);
            if (profile) {
              setSchemaLoaded(profile.name);
              const modifiedDefaultValue = applyDefaultValuesToResource(defaultValue, profile);
              setValue(modifiedDefaultValue);
            } else {
              console.error(`Schema not found for ${profileUrl}`);
            }
          })
          .catch((reason) => {
            console.error('Error in requestProfileSchema', reason);
          });
      } else {
        const schemaName = props.schemaName ?? defaultValue?.resourceType;
        medplum
          .requestSchema(schemaName)
          .then(() => {
            setValue(defaultValue);
            setSchemaLoaded(schemaName);
          })
          .catch(console.log);
      }
    }
  }, [medplum, defaultValue, props.schemaName, props.profileUrl]);

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
      <Stack mb="xl">
        <FormSection title="Resource Type" htmlFor="resourceType" outcome={outcome}>
          <TextInput name="resourceType" defaultValue={value.resourceType} disabled={true} />
        </FormSection>
        <FormSection title="ID" htmlFor="id" outcome={outcome}>
          <TextInput name="id" defaultValue={value.id} disabled={true} />
        </FormSection>
      </Stack>
      <BackboneElementInput
        path={value.resourceType}
        typeName={schemaLoaded}
        defaultValue={value}
        outcome={outcome}
        onChange={setValue}
        profileUrl={props.profileUrl}
      />
      <Group justify="flex-end" mt="xl">
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
