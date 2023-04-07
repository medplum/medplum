import { JsonInput } from '@mantine/core';
import { stringify } from '@medplum/core';
import { Extension } from '@medplum/fhirtypes';
import React from 'react';

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
