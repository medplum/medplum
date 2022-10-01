import { NativeSelect } from '@mantine/core';
import { Reference, ValueSet } from '@medplum/fhirtypes';
import { useResource } from '@medplum/react';
import React from 'react';
import './QuickStatus.css';

export interface QuickStatusProps {
  valueSet: Reference<ValueSet> | ValueSet;
  defaultValue?: string;
  onChange: (newStatus: string) => void;
}

export function QuickStatus(props: QuickStatusProps): JSX.Element | null {
  const valueSet = useResource(props.valueSet);
  if (!valueSet) {
    return null;
  }

  return (
    <div className="medplum-quick-status">
      <NativeSelect
        defaultValue={props.defaultValue}
        onChange={(e) => props.onChange(e.currentTarget.value)}
        data={valueSet.compose?.include?.[0]?.concept?.map((concept) => concept.code) as string[]}
      />
    </div>
  );
}
