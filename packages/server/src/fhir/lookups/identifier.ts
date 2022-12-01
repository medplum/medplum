import { Filter, Operator as FhirOperator, stringify } from '@medplum/core';
import { Identifier, Resource, SearchParameter } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { PoolClient } from 'pg';
import { Column, Condition, Conjunction, Disjunction, Expression, Negation, Operator, SelectQuery } from '../sql';
import { LookupTable } from './lookuptable';
import { compareArrays } from './util';

const IDENTIFIER_TABLE_NAME = 'Identifier';

/**
 * The IdentifierTable class is used to index and search "identifier" properties.
 * The common case for identifiers is a "system" and "value" key/value pair.
 * Each identifier is represented as a separate row in the "Identifier" table.
 */
export class IdentifierTable extends LookupTable<Identifier> {
  /**
   * Returns the table name.
   * @returns The table name.
   */
  getTableName(): string {
    return IDENTIFIER_TABLE_NAME;
  }

  /**
   * Returns the column name for the given search parameter.
   */
  getColumnName(): string {
    return 'value';
  }

  /**
   * Returns true if the search parameter is an "identifier" parameter.
   * @param searchParam The search parameter.
   * @returns True if the search parameter is an "identifier" parameter.
   */
  isIndexed(searchParam: SearchParameter): boolean {
    return searchParam.code === 'identifier' && searchParam.type === 'token';
  }

  /**
   * Indexes a resource identifier values.
   * Attempts to reuse existing identifiers if they are correct.
   * @param client The database client.
   * @param resource The resource to index.
   * @returns Promise on completion.
   */
  async indexResource(client: PoolClient, resource: Resource): Promise<void> {
    const identifiers = this.#getIdentifiers(resource);
    const resourceId = resource.id as string;
    const existing = await this.getExistingValues(resourceId);

    if (!compareArrays(identifiers, existing)) {
      if (existing.length > 0) {
        await this.deleteValuesForResource(resource);
      }

      const values = [];

      for (let i = 0; i < identifiers.length; i++) {
        const identifier = identifiers[i];
        values.push({
          id: randomUUID(),
          resourceId,
          index: i,
          content: stringify(identifier),
          system: identifier.system?.trim(),
          value: identifier.value?.trim(),
        });
      }

      await this.insertValuesForResource(client, values);
    }
  }

  /**
   * Adds "where" conditions to the select query builder.
   * @param selectQuery The select query builder.
   * @param predicate The conjunction where conditions should be added.
   * @param filter The search filter details.
   */
  addWhere(selectQuery: SelectQuery, predicate: Conjunction, filter: Filter): void {
    const tableName = this.getTableName();
    const joinName = selectQuery.getNextJoinAlias();
    const subQuery = new SelectQuery(tableName)
      .raw(`DISTINCT ON ("${tableName}"."resourceId") *`)
      .orderBy('resourceId');
    const disjunction = new Disjunction([]);
    for (const option of filter.value.split(',')) {
      disjunction.expressions.push(this.#buildWhereCondition(filter.operator, option));
    }
    if (filter.operator === FhirOperator.NOT_EQUALS) {
      subQuery.whereExpr(new Negation(disjunction));
    } else {
      subQuery.whereExpr(disjunction);
    }
    selectQuery.join(joinName, 'id', 'resourceId', subQuery);
    predicate.expressions.push(new Condition(new Column(joinName, 'id'), Operator.NOT_EQUALS, null));
  }

  #getIdentifiers(resource: Resource): Identifier[] {
    const identifier = (resource as any).identifier;
    if (identifier) {
      return Array.isArray(identifier) ? identifier : [identifier];
    }
    return [];
  }

  #buildWhereCondition(operator: FhirOperator, query: string): Expression {
    const parts = query.split('|');
    if (parts.length === 2) {
      return new Conjunction([
        new Condition(new Column(IDENTIFIER_TABLE_NAME, 'system'), Operator.EQUALS, parts[0]),
        this.#buildValueCondition(operator, parts[1]),
      ]);
    } else {
      return this.#buildValueCondition(operator, query);
    }
  }

  #buildValueCondition(operator: FhirOperator, value: string): Condition {
    const column = new Column(IDENTIFIER_TABLE_NAME, 'value');
    if (operator === FhirOperator.CONTAINS) {
      return new Condition(column, Operator.LIKE, value.trim() + '%');
    } else {
      return new Condition(column, Operator.EQUALS, value.trim());
    }
  }
}
