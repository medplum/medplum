import { Extension, stringify } from '@medplum/core';
import React from 'react';

export interface ExtensionInputProps {
  name: string;
  defaultValue?: Extension;
}

export function ExtensionInput(props: ExtensionInputProps) {
  return (
    <textarea
      data-testid="extension-input"
      name={props.name}
      defaultValue={stringify(props.defaultValue)}
    />
  );
}
