import { Table } from '@mantine/core';
import { capitalize, evalFhirPathTyped, getSearchParameterDetails, toTypedValue } from '@medplum/core';
import { Resource, SearchParameter } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { useEffect, useState } from 'react';
import { createPatch } from 'rfc6902';
import { ResourcePropertyDisplay } from '../ResourcePropertyDisplay/ResourcePropertyDisplay';
import classes from './ResourceDiffTable.module.css';

export interface ResourceDiffTableProps {
  original: Resource;
  revised: Resource;
}

export function ResourceDiffTable(props: ResourceDiffTableProps): JSX.Element | null {
  const medplum = useMedplum();
  const [schemaLoaded, setSchemaLoaded] = useState(false);

  useEffect(() => {
    medplum
      .requestSchema(props.original.resourceType)
      .then(() => setSchemaLoaded(true))
      .catch(console.log);
  }, [medplum, props.original.resourceType]);

  if (!schemaLoaded) {
    return null;
  }

  const patch = createPatch(props.original, props.revised);
  const typedOriginal = [toTypedValue(props.original)];
  const typedRevised = [toTypedValue(props.revised)];

  return (
    <Table className={classes.root}>
      <Table.Thead>
        <Table.Tr>
          <Table.Th />
          <Table.Th>Before</Table.Th>
          <Table.Th>After</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {patch.map((op) => {
          if (op.path.startsWith('/meta')) {
            return null;
          }

          const path = op.path;
          const fhirPath = jsonPathToFhirPath(path);
          const details = getSearchParameterDetails(props.original.resourceType, {
            resourceType: 'SearchParameter',
            base: [props.original.resourceType],
            code: props.original.resourceType + '.' + fhirPath,
            expression: props.original.resourceType + '.' + fhirPath,
          } as SearchParameter);
          const property = details?.elementDefinitions?.[0];
          const isArray = !!property?.isArray;
          const originalValue = op.op === 'add' ? undefined : evalFhirPathTyped(fhirPath, typedOriginal)?.[0];
          const revisedValue = op.op === 'remove' ? undefined : evalFhirPathTyped(fhirPath, typedRevised)?.[0];

          return (
            <Table.Tr key={`op-${op.op}-${op.path}`}>
              <Table.Td>
                {capitalize(op.op)} {fhirPath}
              </Table.Td>
              <Table.Td className={classes.removed}>
                {originalValue && (
                  <ResourcePropertyDisplay
                    property={property}
                    propertyType={originalValue.type}
                    value={fixArray(originalValue.value, isArray)}
                    ignoreMissingValues={true}
                  />
                )}
              </Table.Td>
              <Table.Td className={classes.added}>
                {revisedValue && (
                  <ResourcePropertyDisplay
                    property={property}
                    propertyType={revisedValue.type}
                    value={fixArray(revisedValue.value, isArray)}
                    ignoreMissingValues={true}
                  />
                )}
              </Table.Td>
            </Table.Tr>
          );
        })}
      </Table.Tbody>
    </Table>
  );
}

function jsonPathToFhirPath(path: string): string {
  const parts = path.split('/').filter(Boolean);
  let result = '';
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part === '-') {
      result += '.last()';
    } else if (/^\d+$/.test(part)) {
      result += `[${part}]`;
    } else {
      if (i > 0) {
        result += '.';
      }
      result += part;
    }
  }
  return result;
}

function fixArray(inputValue: any, isArray: boolean): any {
  if (Array.isArray(inputValue) && !isArray) {
    return inputValue[0];
  }
  if (!Array.isArray(inputValue) && isArray) {
    return [inputValue];
  }
  return inputValue;
}
