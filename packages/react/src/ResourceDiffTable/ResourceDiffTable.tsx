import { Table } from '@mantine/core';
import {
  InternalSchemaElement,
  TypedValue,
  arrayify,
  capitalize,
  evalFhirPathTyped,
  getSearchParameterDetails,
  toTypedValue,
} from '@medplum/core';
import { Resource, SearchParameter } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { Operation, createPatch } from 'rfc6902';
import { ResourcePropertyDisplay } from '../ResourcePropertyDisplay/ResourcePropertyDisplay';
import classes from './ResourceDiffTable.module.css';

export interface ResourceDiffTableProps {
  readonly original: Resource;
  readonly revised: Resource;
}

export function ResourceDiffTable(props: ResourceDiffTableProps): JSX.Element | null {
  const medplum = useMedplum();
  const { original, revised } = props;
  const [schemaLoaded, setSchemaLoaded] = useState(false);

  useEffect(() => {
    medplum
      .requestSchema(props.original.resourceType)
      .then(() => setSchemaLoaded(true))
      .catch(console.log);
  }, [medplum, props.original.resourceType]);

  const diffTable = useMemo(() => {
    if (!schemaLoaded) {
      return null;
    }

    const typedOriginal = [toTypedValue(original)];
    const typedRevised = [toTypedValue(revised)];
    const result = [];

    // First, we filter and consolidate the patch operations
    // We can do this because we do not use the "value" field in the patch operations
    // Remove patch operations on meta elements such as "meta.lastUpdated" and "meta.versionId"
    // Consolidate patch operations on arrays
    const patch = mergePatchOperations(createPatch(original, revised));

    // Next, convert the patch operations to a diff table
    for (const op of patch) {
      const path = op.path;
      const fhirPath = jsonPathToFhirPath(path);
      const property = tryGetElementDefinition(original.resourceType, fhirPath);
      const originalValue = op.op === 'add' ? undefined : evalFhirPathTyped(fhirPath, typedOriginal);
      const revisedValue = op.op === 'remove' ? undefined : evalFhirPathTyped(fhirPath, typedRevised);
      result.push({
        key: `op-${op.op}-${op.path}`,
        name: `${capitalize(op.op)} ${fhirPath}`,
        path: property?.path ?? original.resourceType + '.' + fhirPath,
        property: property,
        originalValue: touchUpValue(property, originalValue),
        revisedValue: touchUpValue(property, revisedValue),
      });
    }

    return result;
  }, [schemaLoaded, original, revised]);

  if (!diffTable) {
    return null;
  }

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
        {diffTable.map((row) => (
          <Table.Tr key={row.key}>
            <Table.Td>{row.name}</Table.Td>
            <Table.Td className={classes.removed}>
              {row.originalValue && (
                <ResourcePropertyDisplay
                  path={row.path}
                  property={row.property}
                  propertyType={row.originalValue.type}
                  value={row.originalValue.value}
                  ignoreMissingValues={true}
                />
              )}
            </Table.Td>
            <Table.Td className={classes.added}>
              {row.revisedValue && (
                <ResourcePropertyDisplay
                  path={row.path}
                  property={row.property}
                  propertyType={row.revisedValue.type}
                  value={row.revisedValue.value}
                  ignoreMissingValues={true}
                />
              )}
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

function mergePatchOperations(patch: Operation[]): Operation[] {
  const result: Operation[] = [];
  for (const patchOperation of patch) {
    const { op, path } = patchOperation;
    if (
      path.startsWith('/meta/author') ||
      path.startsWith('/meta/compartment') ||
      path.startsWith('/meta/lastUpdated') ||
      path.startsWith('/meta/versionId')
    ) {
      continue;
    }
    const count = patch.filter((el) => el.op === op && el.path === path).length;
    const resultOperation = { op, path } as Operation;
    if (count > 1 && (op === 'add' || op === 'remove') && /\/[0-9-]+$/.test(path)) {
      // Remove everything after the last slash
      resultOperation.op = 'replace';
      resultOperation.path = path.replace(/\/[^/]+$/, '');
    }
    if (!result.some((el) => el.op === resultOperation.op && el.path === resultOperation.path)) {
      // Only add the operation if it doesn't already exist
      result.push(resultOperation);
    }
  }
  return result;
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

  // For attachments, remove the .url suffix
  // Note that not all ".url" properties are attachments, but it is the common case.
  // If the property is not an attachment, the diff will simply render the parent element,
  // which is still fine.
  if (result.endsWith('.url')) {
    result = result.replace(/\.url$/, '');
  }

  return result;
}

function tryGetElementDefinition(resourceType: string, fhirPath: string): InternalSchemaElement | undefined {
  const details = getSearchParameterDetails(resourceType, {
    resourceType: 'SearchParameter',
    base: [resourceType],
    code: resourceType + '.' + fhirPath,
    expression: resourceType + '.' + fhirPath,
  } as SearchParameter);
  return details?.elementDefinitions?.[0];
}

function touchUpValue(
  property: InternalSchemaElement | undefined,
  input: TypedValue[] | TypedValue | undefined
): TypedValue | undefined {
  if (!input) {
    return input;
  }
  return {
    type: Array.isArray(input) ? input[0].type : input.type,
    value: fixArray(input, !!property?.isArray),
  };
}

function fixArray(input: TypedValue[] | TypedValue, isArray: boolean): any {
  const inputValue = (arrayify(input) as TypedValue[]).flatMap((v) => v.value);
  return isArray ? inputValue : inputValue[0];
}
