import { stringify } from '@medplum/core';
import { Extension } from '@medplum/fhirtypes';
import React from 'react';
import { TextArea } from './TextArea';

export interface ExtensionInputProps {
  name: string;
  defaultValue?: Extension;
  onChange?: (value: Extension) => void;
}

export function ExtensionInput(props: ExtensionInputProps): JSX.Element {
  return (
    <TextArea
      testid="extension-input"
      name={props.name}
      defaultValue={stringify(props.defaultValue)}
      onChange={(newValue: string) => {
        if (props.onChange) {
          props.onChange(JSON.parse(newValue));
        }
      }}
    />
  );
}
