// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Table } from '@mantine/core';
import type { InternalSchemaElement, Operation, TypedValue } from '@medplum/core';
import {
  applyPatch,
  arrayify,
  capitalize,
  createPatch,
  deepClone,
  evalFhirPathTyped,
  getSearchParameterDetails,
  toTypedValue,
} from '@medplum/core';
import type { Resource, SearchParameter } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { ResourceDiffRow } from '../ResourceDiffRow/ResourceDiffRow';
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

    // Remove patch operations on meta elements such as "meta.lastUpdated" and "meta.versionId"
    const patch = createPatch(original, revised).filter((op) => !isIgnoredPath(op.path));

    // JSON patch operation paths are sequential -- each operation assumes the prior operations
    // were already applied. Apply the operations one at a time to an intermediate state, and
    // evaluate each path against the state just before the operation (for removed/replaced
    // values) and just after it (for added/replaced values), so paths produced by array
    // reorders, inserts, and removes always resolve to the true values.
    const state = deepClone(original);
    const consolidatedPaths = new Set<string>();

    for (const op of patch) {
      const consolidatedPath = getConsolidatedPath(op, patch);
      if (consolidatedPath) {
        // Multiple add/remove operations on the same array path are consolidated into a single
        // "replace" row showing the whole array before and after.
        if (!consolidatedPaths.has(consolidatedPath)) {
          consolidatedPaths.add(consolidatedPath);
          const fhirPath = jsonPathToFhirPath(consolidatedPath);
          const property = tryGetElementDefinition(original.resourceType, fhirPath);
          result.push({
            key: `op-replace-${consolidatedPath}`,
            name: `Replace ${fhirPath}`,
            path: property?.path ?? original.resourceType + '.' + fhirPath,
            property: property,
            originalValue: touchUpValue(property, evalFhirPathTyped(fhirPath, typedOriginal)),
            revisedValue: touchUpValue(property, evalFhirPathTyped(fhirPath, typedRevised)),
          });
        }
        applyPatch(state, [op]);
        continue;
      }

      const fhirPath = jsonPathToFhirPath(op.path);
      const property = tryGetElementDefinition(original.resourceType, fhirPath);
      const originalValue = op.op === 'add' ? undefined : evalFhirPathTyped(fhirPath, [toTypedValue(state)]);
      applyPatch(state, [op]);
      const revisedValue = op.op === 'remove' ? undefined : evalFhirPathTyped(fhirPath, [toTypedValue(state)]);
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
        {diffTable.map((row) => {
          const { key, ...rest } = row;
          return <ResourceDiffRow key={key} {...rest} />;
        })}
      </Table.Tbody>
    </Table>
  );
}

function isIgnoredPath(path: string): boolean {
  return (
    path.startsWith('/meta/author') ||
    path.startsWith('/meta/compartment') ||
    path.startsWith('/meta/lastUpdated') ||
    path.startsWith('/meta/versionId')
  );
}

function getConsolidatedPath(op: Operation, patch: Operation[]): string | undefined {
  if ((op.op === 'add' || op.op === 'remove') && /\/[0-9-]+$/.test(op.path)) {
    const count = patch.filter((el) => el.op === op.op && el.path === op.path).length;
    if (count > 1) {
      // Remove everything after the last slash
      return op.path.replace(/\/[^/]+$/, '');
    }
  }
  return undefined;
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
  try {
    const details = getSearchParameterDetails(resourceType, {
      resourceType: 'SearchParameter',
      base: [resourceType],
      code: resourceType + '.' + fhirPath,
      expression: resourceType + '.' + fhirPath,
    } as SearchParameter);
    return details?.elementDefinitions?.[0];
  } catch (err) {
    console.warn('Failed to get element definition', { resourceType, fhirPath, err });
    return undefined;
  }
}

function touchUpValue(
  property: InternalSchemaElement | undefined,
  input: TypedValue[] | TypedValue | undefined
): TypedValue | undefined {
  if (!input || (Array.isArray(input) && input.length === 0)) {
    // Empty array means the FHIRPath expression did not resolve to a value.
    // Operations are evaluated against sequentially patched states, so this should
    // not normally happen, but render an empty cell rather than crash if it does.
    return undefined;
  }
  return {
    type: Array.isArray(input) ? input[0].type : input.type,
    value: fixArray(input, !!property?.isArray),
  };
}

function fixArray(input: TypedValue[] | TypedValue, isArray: boolean): any {
  const inputValue = arrayify(input).flatMap((v) => v.value);
  return isArray ? inputValue : inputValue[0];
}
