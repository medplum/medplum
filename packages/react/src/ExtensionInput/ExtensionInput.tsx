import { JsonInput } from '@mantine/core';
import { InternalSchemaElement, stringify } from '@medplum/core';
import { Extension } from '@medplum/fhirtypes';

export interface ExtensionInputNewProps {
  property: InternalSchemaElement;
  name: string;
  defaultValue?: Extension;
  onChange?: (value: Extension) => void;
}

export function ExtensionInputNew(props: ExtensionInputNewProps): JSX.Element {
  return <div>ITS AN Extension {props.name}</div>;
}

export interface ExtensionInputProps {
  name: string;
  defaultValue?: Extension;
  onChange?: (value: Extension) => void;
}

export function ExtensionInput(props: ExtensionInputProps): JSX.Element {
  return (
    <JsonInput
      id={props.name}
      name={props.name}
      data-testid="extension-input"
      defaultValue={stringify(props.defaultValue)}
      deserialize={JSON.parse}
      onChange={(newValue) => {
        if (props.onChange) {
          props.onChange(JSON.parse(newValue));
        }
      }}
    />
  );
}
