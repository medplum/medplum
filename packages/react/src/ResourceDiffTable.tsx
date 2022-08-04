import { getPropertyDisplayName, IndexedStructureDefinition, stringify, toTypedValue } from '@medplum/core';
import { Resource } from '@medplum/fhirtypes';
import React, { useEffect, useState } from 'react';
import { useMedplum } from './MedplumProvider';
import { getValueAndType, ResourcePropertyDisplay } from './ResourcePropertyDisplay';
import './ResourceDiff.css';
import './ResourceDiffTable.css';

export interface ResourceDiffTableProps {
  original: Resource;
  revised: Resource;
}

export function ResourceDiffTable(props: ResourceDiffTableProps): JSX.Element | null {
  const medplum = useMedplum();
  const [schema, setSchema] = useState<IndexedStructureDefinition | undefined>();

  useEffect(() => {
    medplum.requestSchema(props.original.resourceType).then(setSchema).catch(console.log);
  }, [medplum, props.original.resourceType]);

  if (!schema) {
    return null;
  }

  const typeSchema = schema.types[props.original.resourceType];
  if (!typeSchema) {
    return null;
  }

  return (
    <table className="medplum-diff-table">
      <colgroup>
        <col style={{ width: '30%' }} />
        <col style={{ width: '35%' }} />
        <col style={{ width: '35%' }} />
      </colgroup>
      <thead>
        <tr>
          <th>Property</th>
          <th>Before</th>
          <th>After</th>
        </tr>
      </thead>
      <tbody>
        {Object.entries(typeSchema.properties).map((entry) => {
          const key = entry[0];
          if (key === 'id' || key === 'meta') {
            return null;
          }

          const property = entry[1];
          const [originalPropertyValue, originalPropertyType] = getValueAndType(toTypedValue(props.original), key);
          const [revisedPropertyValue, revisedPropertyType] = getValueAndType(toTypedValue(props.revised), key);
          if (isEmpty(originalPropertyValue) && isEmpty(revisedPropertyValue)) {
            return null;
          }

          if (stringify(originalPropertyValue) === stringify(revisedPropertyValue)) {
            return null;
          }

          return (
            <tr key={key}>
              <td>{getPropertyDisplayName(key)}</td>
              <td className="medplum-diff-removed">
                <ResourcePropertyDisplay
                  property={property}
                  propertyType={originalPropertyType}
                  value={originalPropertyValue}
                  ignoreMissingValues={true}
                />
              </td>
              <td className="medplum-diff-added">
                <ResourcePropertyDisplay
                  property={property}
                  propertyType={revisedPropertyType}
                  value={revisedPropertyValue}
                  ignoreMissingValues={true}
                />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function isEmpty(value: unknown): boolean {
  return (
    !value ||
    (Array.isArray(value) && value.length === 0) ||
    (typeof value === 'object' && Object.keys(value).length === 0)
  );
}
