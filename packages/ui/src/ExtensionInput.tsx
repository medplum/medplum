import { stringify } from '@medplum/core';
import { Extension } from '@medplum/fhirtypes';
import React from 'react';

export interface ExtensionInputProps {
  name: string;
  defaultValue?: Extension;
  onChange?: (value: Extension) => void;
}

export function ExtensionInput(props: ExtensionInputProps) {
  return (
    <textarea
      data-testid="extension-input"
      name={props.name}
      defaultValue={stringify(props.defaultValue)}
      onChange={(e: React.ChangeEvent) => {
        if (props.onChange) {
          props.onChange(JSON.parse((e.target as HTMLTextAreaElement).value));
        }
      }}
    />
  );
}
