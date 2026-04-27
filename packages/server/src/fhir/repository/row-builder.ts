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
  resolveId,
  SearchParameterType,
  stringify,
  toPeriod,
  toTypedValue,
} from '@medplum/core';
import type { Meta, Resource, ResourceType, SearchParameter } from '@medplum/fhirtypes';
import { getConfig } from '../../config/loader';
import type { ArrayColumnPaddingConfig } from '../../config/types';
import { systemResourceProjectId } from '../../constants';
import { getLogger } from '../../logger';
import { recordHistogramValue } from '../../otel/otel';
import type { HumanNameResource } from '../lookups/humanname';
import { getHumanNameSortValue } from '../lookups/humanname';
import { getStandardAndDerivedSearchParameters } from '../lookups/util';
import { buildRangeColumns } from '../range-column';
import { getSearchParameterImplementation, SearchStrategies } from '../searchparameter';
import { periodToRangeString, truncateTextColumn } from '../sql';
import { buildTokenColumns } from '../token-column';

export type ColumnValue = boolean | number | string | undefined | null;

export function buildDeletedResourceRow(
  resourceType: ResourceType,
  id: string,
  projectId: string | undefined
): { id: string; lastUpdated: Date; deleted: boolean; projectId: string; content: string; __version: number } & Record<
  string,
  any
> {
  const lastUpdated = new Date();
  const content = '';
  const columns = {
    id,
    lastUpdated,
    deleted: true,
    projectId: projectId ?? systemResourceProjectId,
    content,
    __version: -1,
  };

  for (const searchParam of getStandardAndDerivedSearchParameters(resourceType)) {
    buildColumn({ resourceType } as Resource, columns, searchParam);
  }

  return columns;
}
export function buildResourceRow(resource: Resource, version: number): Record<string, any> {
  const resourceType = resource.resourceType;
  const meta = resource.meta as Meta;
  const content = stringify(resource);

  const row: Record<string, any> = {
    id: resource.id,
    lastUpdated: meta.lastUpdated,
    deleted: false,
    projectId: meta.project ?? systemResourceProjectId,
    content,
    __version: version,
  };

  const searchParams = getStandardAndDerivedSearchParameters(resourceType);
  if (searchParams.length > 0) {
    const startTime = process.hrtime.bigint();
    try {
      for (const searchParam of searchParams) {
        buildColumn(resource, row, searchParam);
      }
    } catch (err) {
      getLogger().error('Error building row for resource', {
        resource: `${resourceType}/${resource.id}`,
        err,
      });
      throw err;
    }
    recordHistogramValue(
      'medplum.server.indexingDurationMs',
      Number(process.hrtime.bigint() - startTime) / 1e6, // High resolution time, converted from ns to ms
      {
        options: { unit: 'ms' },
      }
    );
  }

  return row;
}

/**
 * Builds the columns to write for a given resource and search parameter.
 * If nothing to write, then no columns will be added.
 * Some search parameters can result in multiple columns (for example, Reference objects).
 * @param resource - The resource to write.
 * @param columns - The output columns to write.
 * @param searchParam - The search parameter definition.
 */
export function buildColumn(resource: Resource, columns: Record<string, any>, searchParam: SearchParameter): void {
  if (
    searchParam.code === '_id' ||
    searchParam.code === '_lastUpdated' ||
    searchParam.code === '_compartment:identifier' ||
    searchParam.code === '_deleted' ||
    searchParam.code === '_project' ||
    searchParam.type === 'composite'
  ) {
    return;
  }

  if (searchParam.code === '_compartment') {
    columns['compartments'] = resource.meta?.compartment?.map((ref) => resolveId(ref)) ?? [];
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

  if (impl.searchStrategy === 'token-column') {
    buildTokenColumns(searchParam, impl, columns, resource, {
      paddingConfig: getArrayPaddingConfig(searchParam, resource.resourceType),
    });
    return;
  }
  if (impl.searchStrategy === SearchStrategies.RANGE_COLUMN) {
    buildRangeColumns(searchParam, impl, columns, resource);

    // Handle special case for "MeasureReport-period"
    // This is a trial for using "tstzrange" columns for date/time ranges.
    // Eventually, this special case will go away, and this will become the default behavior for all "date" search parameters.
    if (searchParam.id === 'MeasureReport-period') {
      columns['period_range'] = buildPeriodColumn(typedValues[0]?.value);
    }
    // TODO: return here once migration is complete
  }

  // TODO: Re-enable after migration
  // impl satisfies ColumnSearchParameterImplementation;
  const columnValues = buildColumnValues(searchParam, impl, typedValues);
  if (impl.array) {
    columnValues.sort(compareColumnValues);
    columns[impl.columnName] = columnValues.length > 0 ? columnValues : undefined;
  } else {
    columns[impl.columnName] = columnValues[0];
  }
}

/**
 * Builds a single value for a given search parameter.
 * If the search parameter is an array, then this method will be called for each element.
 * If the search parameter is not an array, then this method will be called for the value.
 * @param searchParam - The search parameter definition.
 * @param details - The extra search parameter details.
 * @param typedValues - The FHIR resource value.
 * @returns The column value.
 */
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
    // "Date" column is a special case that only applies when the following conditions are true:
    // 1. The search parameter is a date type.
    // 2. The underlying FHIR ElementDefinition referred to by the search parameter has a type of "date".
    return flatMapFilter(convertToSearchableDates(typedValues), (p) => (p.start ?? p.end)?.substring(0, 10));
  }

  if (details.type === SearchParameterType.DATETIME) {
    // Future work: write the whole period to the DB after migrating all "date" search parameters to use a tstzrange.
    return flatMapFilter(convertToSearchableDates(typedValues), (p) => p.start ?? p.end);
  }

  if (searchParam.type === 'number') {
    // Future work: write the whole range to the DB after migrating all "number" search parameters to use a range.
    return flatMapFilter(convertToSearchableNumbers(typedValues), ([low, high]) => low ?? high);
  }

  if (searchParam.type === 'quantity') {
    // Future work: write the whole range to the DB after migrating all "quantity" search parameters to use a range.
    return flatMapFilter(convertToSearchableQuantities(typedValues), (q) => q.value);
  }

  if (searchParam.type === 'reference') {
    return flatMapFilter(convertToSearchableReferences(typedValues), truncateTextColumn);
  }

  if (searchParam.type === 'token') {
    return flatMapFilter(convertToSearchableTokens(typedValues), (t) => truncateTextColumn(t.value));
  }

  if (searchParam.type === 'string') {
    return flatMapFilter(convertToSearchableStrings(typedValues), truncateTextColumn);
  }

  if (searchParam.type === 'uri') {
    return flatMapFilter(convertToSearchableUris(typedValues), truncateTextColumn);
  }

  if (searchParam.type === 'special' || searchParam.type === 'composite') {
    // Special and composite search parameters are not supported in the database.
    return [];
  }

  throw new Error('Unrecognized search parameter type: ' + searchParam.type);
}

/**
 * Builds the column value for a "date" search parameter.
 * This is currently in trial mode. The intention is for this to replace all "date" and "date/time" search parameters.
 * @param value - The FHIRPath result value.
 * @returns The period column string value.
 */
function buildPeriodColumn(value: any): string | undefined {
  const period = toPeriod(value);
  if (period) {
    return periodToRangeString(period);
  }
  return undefined;
}

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
