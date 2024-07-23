import { ActionIcon, Alert, Button, Group, Menu, Stack, TextInput, useMantineTheme } from '@mantine/core';
import {
  AccessPolicyInteraction,
  applyDefaultValuesToResource,
  canWriteResourceType,
  isPopulated,
  satisfiedAccessPolicy,
  tryGetProfile,
} from '@medplum/core';
import { OperationOutcome, Reference, Resource } from '@medplum/fhirtypes';
import { useMedplum, useResource } from '@medplum/react-hooks';
import { IconAlertCircle, IconChevronDown, IconEdit, IconTrash } from '@tabler/icons-react';
import cx from 'clsx';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { BackboneElementInput } from '../BackboneElementInput/BackboneElementInput';
import { FormSection } from '../FormSection/FormSection';
import classes from './ResourceForm.module.css';

export interface ResourceFormProps {
  readonly defaultValue: Partial<Resource> | Reference;
  readonly outcome?: OperationOutcome;
  readonly onSubmit: (resource: Resource) => void;
  readonly onPatch?: (resource: Resource) => void;
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
  const accessPolicy = medplum.getAccessPolicy();
  const theme = useMantineTheme();

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

  const accessPolicyResource = useMemo(() => {
    return defaultValue && satisfiedAccessPolicy(defaultValue, AccessPolicyInteraction.READ, accessPolicy);
  }, [accessPolicy, defaultValue]);

  const canWrite = useMemo<boolean>(() => {
    if (medplum.isSuperAdmin()) {
      return true;
    }

    if (!accessPolicy) {
      return true;
    }

    if (!isPopulated(value?.resourceType)) {
      return true;
    }

    return canWriteResourceType(accessPolicy, value?.resourceType);
  }, [medplum, accessPolicy, value?.resourceType]);

  if (!schemaLoaded || !value) {
    return <div>Loading...</div>;
  }

  if (!canWrite) {
    return (
      <Alert color="red" title="Permission denied" icon={<IconAlertCircle />}>
        Your access level prevents you from editing and creating {value.resourceType} resources.
      </Alert>
    );
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
        valuePath={value.resourceType}
        typeName={schemaLoaded}
        defaultValue={value}
        outcome={outcome}
        onChange={setValue}
        profileUrl={props.profileUrl}
        accessPolicyResource={accessPolicyResource}
      />
      <Group justify="flex-end" mt="xl" wrap="nowrap" gap={0}>
        <Button type="submit" className={cx((props.onPatch || props.onDelete) && classes.splitButton)}>
          {defaultValue?.id ? 'Update' : 'Create'}
        </Button>
        {(props.onPatch || props.onDelete) && (
          <Menu transitionProps={{ transition: 'pop' }} position="bottom-end" withinPortal>
            <Menu.Target>
              <ActionIcon
                variant="filled"
                color={theme.primaryColor}
                size={36}
                className={classes.menuControl}
                aria-label="More actions"
              >
                <IconChevronDown size={14} stroke={1.5} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              {props.onPatch && (
                <Menu.Item
                  leftSection={<IconEdit size={14} stroke={1.5} />}
                  onClick={() => {
                    (props.onPatch as (resource: Resource) => void)(value);
                  }}
                >
                  Patch
                </Menu.Item>
              )}
              {props.onDelete && (
                <Menu.Item
                  color="red"
                  leftSection={<IconTrash size={14} stroke={1.5} color="red" />}
                  onClick={() => {
                    (props.onDelete as (resource: Resource) => void)(value);
                  }}
                >
                  Delete
                </Menu.Item>
              )}
            </Menu.Dropdown>
          </Menu>
        )}
      </Group>
    </form>
  );
}
