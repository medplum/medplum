// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { SearchParameterDetails, TypedValue } from '@medplum/core';
import {
  convertToSearchableDates,
  convertToSearchableNumbers,
  convertToSearchableQuantities,
  convertToSearchableReferences,
  convertToSearchableStrings,
  convertToSearchableTokens,
  convertToSearchableUris,
  evalFhirPathTyped,
  flatMapFilter,
  SearchParameterType,
  stringify,
  toPeriod,
  toTypedValue,
} from '@medplum/core';
import type { Resource, SearchParameter } from '@medplum/fhirtypes';
import { getConfig } from '../../config/loader';
import type { ArrayColumnPaddingConfig } from '../../config/types';
import { systemResourceProjectId } from '../../constants';
import { getLogger } from '../../logger';
import { recordHistogramValue } from '../../otel/otel';
import type { HumanNameResource } from '../lookups/humanname';
import { getHumanNameSortValue } from '../lookups/humanname';
import { getStandardAndDerivedSearchParameters } from '../lookups/util';
import type { ColumnSearchParameterImplementation } from '../searchparameter';
import { getSearchParameterImplementation } from '../searchparameter';
import { periodToRangeString, truncateTextColumn } from '../sql';
import { buildTokenColumns } from '../token-column';

export type ColumnValue = boolean | number | string | undefined | null;

export function compareColumnValues(a: ColumnValue, b: ColumnValue): number {
  if ((a ?? null) === (b ?? null)) {
    return 0;
  }
  if (a === null || a === undefined) {
    return 1;
  }
  if (b === null || b === undefined) {
    return -1;
  }
  if (typeof a === 'number' && typeof b === 'number') {
    return a - b;
  }
  if (typeof a === 'boolean' && typeof b === 'boolean') {
    return Number(a) - Number(b);
  }
  return String(a).localeCompare(String(b));
}

export function buildResourceRow(resource: Resource, version: number): Record<string, any> {
  const meta = resource.meta ?? {};
  const row: Record<string, any> = {
    id: resource.id,
    lastUpdated: meta.lastUpdated,
    deleted: false,
    projectId: meta.project ?? systemResourceProjectId,
    content: stringify(resource),
    __version: version,
  };

  const searchParams = getStandardAndDerivedSearchParameters(resource.resourceType);
  if (searchParams.length > 0) {
    const startTime = process.hrtime.bigint();
    try {
      for (const searchParam of searchParams) {
        buildColumn(resource, row, searchParam);
      }
    } catch (err) {
      getLogger().error('Error building row for resource', {
        resource: `${resource.resourceType}/${resource.id}`,
        err,
      });
      throw err;
    }
    recordHistogramValue(
      'medplum.server.indexingDurationMs',
      Number(process.hrtime.bigint() - startTime) / 1e6,
      {
        options: { unit: 'ms' },
      }
    );
  }

  return row;
}

export function buildColumn(resource: Resource, columns: Record<string, any>, searchParam: SearchParameter): void {
  if (
    searchParam.code === '_id' ||
    searchParam.code === '_lastUpdated' ||
    searchParam.code === '_compartment:identifier' ||
    searchParam.code === '_deleted' ||
    searchParam.type === 'composite'
  ) {
    return;
  }

  if (searchParam.code === '_compartment') {
    columns['compartments'] = resource.meta?.compartment?.map((ref) => ref.reference?.split('/')[1]) ?? [];
    return;
  }

  const impl = getSearchParameterImplementation(resource.resourceType, searchParam);
  if (impl.searchStrategy === 'lookup-table') {
    if (impl.sortColumnName) {
      columns[impl.sortColumnName] = truncateTextColumn(
        getHumanNameSortValue((resource as HumanNameResource).name, searchParam)
      );
    }
    return;
  }

  const typedValues = evalFhirPathTyped(impl.parsedExpression, [toTypedValue(resource)]);
  if (searchParam.id === 'MeasureReport-period') {
    columns['period_range'] = buildPeriodColumn(typedValues[0]?.value);
  }

  if (impl.searchStrategy === 'token-column') {
    buildTokenColumns(searchParam, impl, columns, resource, {
      paddingConfig: getArrayPaddingConfig(searchParam, resource.resourceType),
    });
    return;
  }

  impl satisfies ColumnSearchParameterImplementation;
  const columnValues = buildColumnValues(searchParam, impl, typedValues);
  if (impl.array) {
    columnValues.sort(compareColumnValues);
    columns[impl.columnName] = columnValues.length > 0 ? columnValues : undefined;
  } else {
    columns[impl.columnName] = columnValues[0];
  }
}

function buildColumnValues(
  searchParam: SearchParameter,
  details: SearchParameterDetails,
  typedValues: TypedValue[]
): ColumnValue[] {
  if (details.type === SearchParameterType.BOOLEAN) {
    const value = typedValues[0]?.value;
    if (value === undefined || value === null) {
      return [null];
    }
    return [value === true || value === 'true'];
  }

  if (details.type === SearchParameterType.DATE) {
    return flatMapFilter(convertToSearchableDates(typedValues), (period) => (period.start ?? period.end)?.substring(0, 10));
  }

  if (details.type === SearchParameterType.DATETIME) {
    return flatMapFilter(convertToSearchableDates(typedValues), (period) => period.start ?? period.end);
  }

  if (searchParam.type === 'number') {
    return flatMapFilter(convertToSearchableNumbers(typedValues), ([low, high]) => low ?? high);
  }

  if (searchParam.type === 'quantity') {
    return flatMapFilter(convertToSearchableQuantities(typedValues), (quantity) => quantity.value);
  }

  if (searchParam.type === 'reference') {
    return flatMapFilter(convertToSearchableReferences(typedValues), truncateTextColumn);
  }

  if (searchParam.type === 'token') {
    return flatMapFilter(convertToSearchableTokens(typedValues), (token) => truncateTextColumn(token.value));
  }

  if (searchParam.type === 'string') {
    return flatMapFilter(convertToSearchableStrings(typedValues), truncateTextColumn);
  }

  if (searchParam.type === 'uri') {
    return flatMapFilter(convertToSearchableUris(typedValues), truncateTextColumn);
  }

  if (searchParam.type === 'special' || searchParam.type === 'composite') {
    return [];
  }

  throw new Error('Unrecognized search parameter type: ' + searchParam.type);
}

function buildPeriodColumn(value: any): string | undefined {
  const period = toPeriod(value);
  return period ? periodToRangeString(period) : undefined;
}

function getArrayPaddingConfig(
  searchParam: SearchParameter,
  resourceType: string
): ArrayColumnPaddingConfig | undefined {
  const paddingConfigEntry = getConfig().arrayColumnPadding?.[searchParam.code];
  if (paddingConfigEntry) {
    if (Array.isArray(paddingConfigEntry)) {
      for (const entry of paddingConfigEntry) {
        if (entry.resourceType === undefined || entry.resourceType.includes(resourceType)) {
          return entry.config;
        }
      }
      return undefined;
    }

    if (paddingConfigEntry.resourceType === undefined || paddingConfigEntry.resourceType.includes(resourceType)) {
      return paddingConfigEntry.config;
    }
  }
  return undefined;
}
