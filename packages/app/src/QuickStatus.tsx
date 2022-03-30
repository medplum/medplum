import { Reference, ValueSet } from '@medplum/fhirtypes';
import { Select, useResource } from '@medplum/ui';
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
      <Select defaultValue={props.defaultValue} onChange={props.onChange}>
        {valueSet.compose?.include?.[0]?.concept?.map((concept) => (
          <option key={concept.code} value={concept.code}>
            {concept.code}
          </option>
        ))}
      </Select>
    </div>
  );
}
