import { createReference, ElementDefinition, Reference, Resource } from '@medplum/core';
import React, { useEffect, useRef, useState } from 'react';
import { Autocomplete } from './Autocomplete';

export interface ReferenceInputProps {
  property: ElementDefinition;
  name: string;
  value?: Reference;
}

export function ReferenceInput(props: ReferenceInputProps) {
  const [initialResourceType] = (props.value?.reference || '/').split('/');
  const [value, setValue] = useState<Reference | undefined>(props.value);
  const [resourceType, setResourceType] = useState<string | undefined>(initialResourceType);
  const [targetTypes, setTargetTypes] = useState<string[] | undefined>();

  const valueRef = useRef<Reference>();
  valueRef.current = value;

  useEffect(() => {
    const targetProfile = props.property.type?.[0]?.targetProfile;
    if (targetProfile) {
      const typeNames = targetProfile.map(p => p.split('/').pop() as string);
      setTargetTypes(typeNames);
      setResourceType(typeNames[0]);
    } else {
      setTargetTypes(undefined);
    }
  }, [props.property]);

  return (
    <table style={{ tableLayout: 'fixed' }}>
      <tbody>
        <tr>
          <td>
            <input name={props.name} type="hidden" value={JSON.stringify(value) || ''} readOnly={true} />
            {targetTypes ? (
              <select
                data-testid="reference-input-resource-type-select"
                defaultValue={resourceType}
                onChange={e => setResourceType(e.currentTarget.value)}
              >
                {targetTypes.map(targetType => (
                  <option key={targetType} value={targetType}>{targetType}</option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                data-testid="reference-input-resource-type-input"
                defaultValue={resourceType}
                onChange={e => setResourceType(e.currentTarget.value)}
              />
            )}
          </td>
          <td>
            {resourceType && (
              <Autocomplete
                resourceType={resourceType}
                name={props.name + '-id'}
                defaultValue={props.value ? [props.value] : undefined}
                onChange={(resources: Resource[]) => {
                  const resource = resources?.[0];
                  if (resource) {
                    setValue(createReference(resource));
                  }
                }}
              />
            )}
          </td>
        </tr>
      </tbody>
    </table>
  );
}
