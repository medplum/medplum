// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Filter, SortRule, WithId } from '@medplum/core';
import {
  Operator as FhirOperator,
  invalidSearchOperator,
  OperationOutcomeError,
  splitSearchOnComma,
} from '@medplum/core';
import type { Resource, ResourceType, SearchParameter } from '@medplum/fhirtypes';
import type { Pool, PoolClient } from 'pg';
import { getLogger } from '../../logger';
import type { LookupTableSearchParameterImplementation } from '../searchparameter';
import type { Expression } from '../sql';
import {
  Column,
  Condition,
  Conjunction,
  Constant,
  DeleteQuery,
  Disjunction,
  escapeLikeString,
  InsertQuery,
  Negation,
  SelectQuery,
  SqlFunction,
} from '../sql';

const lookupTableBatchSize = 5_000;

export interface LookupTableRow {
  resourceId: string;
}

export type TableJoin = {
  tableName: string;
  joinCondition: Expression;
};

/**
 * The LookupTable interface is used for search parameters that are indexed in separate tables.
 * This is necessary for array properties with specific structure.
 * Common examples include:
 *   1) Identifiers - arbitrary key/value pairs on many different resource types
 *   2) Human Names - structured names on Patients, Practitioners, and other person resource types
 *   3) Contact Points - email addresses and phone numbers
 */
export abstract class LookupTable {
  /**
   * Returns the unique name of the lookup table.
   * @param resourceType - The resource type.
   * @returns The unique name of the lookup table.
   */
  protected abstract getTableName(resourceType: ResourceType): string;

  /**
   * Returns the column name for the given search parameter.
   * @param code - The search parameter code.
   */
  protected abstract getColumnName(code: string): string;

  /**
   * Determines if the search parameter is indexed by this index table.
   * @param searchParam - The search parameter.
   * @param resourceType - The resource type.
   * @returns True if the search parameter is indexed.
   */
  abstract isIndexed(searchParam: SearchParameter, resourceType: string): boolean;

  /**
   * Extracts the specific values to be indexed from a resource for this table.
   * @param result - The array that rows to be inserted should be added to.
   * @param resource - The resource to extract values from.
   */
  protected abstract extractValues(result: LookupTableRow[], resource: WithId<Resource>): void;

  /**
   * Indexes the resource in the lookup table.
   * @param client - The database client.
   * @param resource - The resource to index.
   * @param create - True if the resource should be created (vs updated).
   * @returns Promise on completion.
   */
  indexResource(client: PoolClient, resource: WithId<Resource>, create: boolean): Promise<void> {
    return this.batchIndexResources(client, [resource], create);
  }

  /**
   * Indexes the resource in the lookup table.
   * @param client - The database client.
   * @param resources - The resources to index.
   * @param create - True if the resource should be created (vs updated).
   */
  async batchIndexResources<T extends Resource>(
    client: PoolClient,
    resources: WithId<T>[],
    create: boolean
  ): Promise<void> {
    if (resources.length === 0) {
      return;
    }

    const resourceType = resources[0].resourceType;

    if (!create) {
      await this.batchDeleteValuesForResources(client, resources);
    }

    // Batch at the resource level to avoid tying up the event loop for too long
    // with synchronous work without any async breaks between DB calls.
    const resourceBatchSize = 200;
    for (let i = 0; i < resources.length; i += resourceBatchSize) {
      const newRows: LookupTableRow[] = [];
      for (let j = i; j < i + resourceBatchSize && j < resources.length; j++) {
        const resource = resources[j];
        if (resource.resourceType !== resourceType) {
          throw new Error(
            `batchIndexResources must be called with resources of the same type: ${resource.resourceType} vs ${resourceType}`
          );
        }
        try {
          this.extractValues(newRows, resource);
        } catch (err) {
          getLogger().error('Error extracting values for resource', {
            resource: `${resourceType}/${resource.id}`,
            err,
          });
          throw err;
        }
      }

      if (newRows.length > 0) {
        await this.batchInsertRows(client, resourceType, newRows);
      }
    }
  }

  protected readonly CONTAINS_SQL_OPERATOR: 'ILIKE' | 'LOWER_LIKE' = 'LOWER_LIKE';

  /**
   * Builds a "where" condition for the select query builder.
   * @param _selectQuery - The select query builder.
   * @param resourceType - The FHIR resource type.
   * @param table - The resource table.
   * @param _param - The search parameter.
   * @param filter - The search filter details.
   * @returns The select query where expression.
   */
  buildWhere(
    _selectQuery: SelectQuery,
    resourceType: ResourceType,
    table: string,
    _param: SearchParameter,
    filter: Filter
  ): Expression {
    if (filter.operator === FhirOperator.IN || filter.operator === FhirOperator.NOT_IN) {
      throw new OperationOutcomeError(invalidSearchOperator(filter.operator, filter.code));
    }

    const lookupTableName = this.getTableName(resourceType);
    const columnName = this.getColumnName(filter.code);

    const disjunction = new Disjunction([]);
    for (const option of splitSearchOnComma(filter.value)) {
      if (filter.operator === FhirOperator.EXACT) {
        disjunction.expressions.push(new Condition(new Column(lookupTableName, columnName), '=', option.trim()));
      } else if (filter.operator === FhirOperator.CONTAINS) {
        disjunction.expressions.push(
          new Condition(
            new Column(lookupTableName, columnName),
            this.CONTAINS_SQL_OPERATOR,
            `%${escapeLikeString(option)}%`
          )
        );
      } else {
        disjunction.expressions.push(
          new Condition(
            new Column(lookupTableName, columnName),
            'TSVECTOR_SIMPLE',
            option
              .trim()
              .split(/\s+/)
              .filter(Boolean)
              .map((token) => token + ':*')
              .join(' & ')
          )
        );
      }
    }

    const exists = new SqlFunction('EXISTS', [
      new SelectQuery(lookupTableName).whereExpr(
        new Conjunction([
          new Condition(new Column(table, 'id'), '=', new Column(lookupTableName, 'resourceId')),
          disjunction,
        ])
      ),
    ]);

    if (filter.operator === FhirOperator.NOT_EQUALS || filter.operator === FhirOperator.NOT) {
      return new Negation(exists);
    } else {
      return exists;
    }
  }

  /**
   * Adds "order by" clause to the select query builder.
   * @param selectQuery - The select query builder.
   * @param impl - The lookup table implementation.
   * @param resourceType - The FHIR resource type.
   * @param sortRule - The sort rule details.
   */
  addOrderBy(
    selectQuery: SelectQuery,
    impl: LookupTableSearchParameterImplementation,
    resourceType: ResourceType,
    sortRule: SortRule
  ): void {
    if (impl.sortColumnName) {
      selectQuery.orderBy(impl.sortColumnName, sortRule.descending);
      return;
    }

    const lookupTableName = this.getTableName(resourceType);
    const joinName = selectQuery.getNextJoinAlias();
    const columnName = this.getColumnName(sortRule.code);
    const whereExpression = new Condition(
      new Column(selectQuery.actualTableName, 'id'),
      '=',
      new Column(lookupTableName, 'resourceId')
    );
    const joinOnExpression = new Constant('true');

    selectQuery.join(
      'LEFT JOIN LATERAL',
      new SelectQuery(lookupTableName)
        .column('resourceId')
        .column(columnName)
        .whereExpr(whereExpression)
        .orderBy(columnName)
        .limit(1),
      joinName,
      joinOnExpression
    );
    selectQuery.orderBy(new Column(joinName, columnName), sortRule.descending);
  }

  /**
   * Inserts values into the lookup table for a resource.
   * @param client - The database client.
   * @param resourceType - The resource type.
   * @param values - The values to insert.
   */
  protected async batchInsertRows(
    client: Pool | PoolClient,
    resourceType: ResourceType,
    values: LookupTableRow[]
  ): Promise<void> {
    if (values.length === 0) {
      return;
    }
    const tableName = this.getTableName(resourceType);
    for (let i = 0; i < values.length; i += lookupTableBatchSize) {
      const batchedValues = values.slice(i, i + lookupTableBatchSize);
      const insert = new InsertQuery(tableName, batchedValues);
      await insert.execute(client);
    }
  }

  /**
   * Deletes the resource from the lookup table.
   * @param client - The database client.
   * @param resource - The resource to delete.
   */
  async deleteValuesForResource(client: Pool | PoolClient, resource: Resource): Promise<void> {
    const tableName = this.getTableName(resource.resourceType);
    const resourceId = resource.id;
    await new DeleteQuery(tableName).where('resourceId', '=', resourceId).execute(client);
  }

  async batchDeleteValuesForResources<T extends Resource>(client: Pool | PoolClient, resources: T[]): Promise<void> {
    const tableName = this.getTableName(resources[0].resourceType);
    const resourceIds = resources.map((r) => r.id);
    await new DeleteQuery(tableName).where('resourceId', 'IN', resourceIds).execute(client);
  }

  /**
   * Purges resources of the specified type that were last updated before the specified date.
   * This is only available to the system and super admin accounts.
   * @param client - The database client.
   * @param resourceType - The FHIR resource type.
   * @param before - The date before which resources should be purged.
   */
  async purgeValuesBefore(client: Pool | PoolClient, resourceType: ResourceType, before: string): Promise<void> {
    const lookupTableName = this.getTableName(resourceType);
    await LookupTable.purge(client, lookupTableName, {
      tableName: resourceType,
      joinCondition: new Conjunction([
        new Condition(new Column(resourceType, 'id'), '=', new Column(lookupTableName, 'resourceId')),
        new Condition(new Column(resourceType, 'lastUpdated'), '<', before),
      ]),
    });
  }

  protected static async purge(
    client: Pool | PoolClient,
    lookupTableName: string,
    ...joins: TableJoin[]
  ): Promise<void> {
    const deleteLookupRows = new DeleteQuery(lookupTableName);
    for (const join of joins) {
      deleteLookupRows.using(join.tableName).whereExpr(join.joinCondition);
    }
    await deleteLookupRows.execute(client);
  }
}
