import { Resource, ViewDefinition, ViewDefinitionSelect } from '@medplum/fhirtypes';
import { evalFhirPathTyped } from '../fhirpath/parse';
import { getTypedPropertyValue, toTypedValue } from '../fhirpath/utils';
import { TypedValue } from '../types';

/**
 * Represents a "selection structure" in the SQL-on-FHIR specification.
 *
 * In practice, this can be a ViewDefinition or ViewDefinitionSelect.
 *
 * TypeScript does not like checks for properties that are not part of the type, so we use this interface instead.
 */
export interface SelectionStructure {
  forEach?: string;
  forEachOrNull?: string;
  column?: ViewDefinitionSelect['column'];
  select?: SelectionStructure[];
  unionAll?: SelectionStructure[];
}

/**
 * SQL on FHIR output row.
 */
export type OutputRow = Record<string, any>;

/**
 * Evaluates a SQL-on-FHIR view on a set of FHIR resources.
 * @param view - The view definition.
 * @param resources - The array of FHIR resources.
 * @returns The output rows.
 */
export function evalSqlOnFhir(view: ViewDefinition, resources: Resource[]): OutputRow[] {
  const result = [];

  for (const resource of resources) {
    result.push(...processResource(view, resource));
  }

  return result;
}

/**
 * Processes a FHIR resource with a ViewDefinition to emit all rows.
 *
 * This step emits all rows produced by a ViewDefinition on an input Resource, by setting up a recursive call.
 *
 * See: https://build.fhir.org/ig/FHIR/sql-on-fhir-v2/implementer_guidance.html#process-a-resource-entry-point
 *
 * @param v - The view definition.
 * @param r - The FHIR resource.
 * @returns The output rows.
 */
function processResource(v: ViewDefinition, r: Resource): OutputRow[] {
  if (!v.resource) {
    throw new Error('Resource type is required');
  }

  if (v.resource !== r.resourceType) {
    return [];
  }

  const variables: Record<string, TypedValue> = {};
  if (v.constant) {
    for (const c of v.constant) {
      const typedConstant = { type: 'ViewDefinitionConstant', value: c };
      variables['%' + c.name] = getTypedPropertyValue(typedConstant, 'value') as TypedValue;
    }
  }

  const typedResource = toTypedValue(r);

  if (v.where) {
    for (const where of v.where) {
      const whereResult = evalFhirPathTyped(where.path, [typedResource], variables);
      if (whereResult.length !== 1) {
        return [];
      }
      if (whereResult[0].type !== 'boolean') {
        throw new Error('WHERE clause must evaluate to a boolean');
      }
      if (!whereResult[0].value) {
        return [];
      }
    }
  }

  return process(v, typedResource, variables);
}

/**
 * Processes a selection structure and node to emit all rows.
 *
 * This step emits all rows for a given Selection Structure and Node. We first generate sets of
 * "partial rows" (i.e., sets of incomplete column bindings from the various clauses of V) and combine them to emit complete rows.
 *
 * This function is deliberately structured to match the pseudocode in the SQL-on-FHIR specification.
 * See: https://build.fhir.org/ig/FHIR/sql-on-fhir-v2/implementer_guidance.html#processs-n-recursive-step
 *
 * @param s - The selection structure.
 * @param n - The node (element) from a FHIR resource.
 * @param variables - The variables.
 * @returns An array of output rows.
 */
function process(s: SelectionStructure, n: TypedValue, variables: Record<string, TypedValue>): OutputRow[] {
  const result: OutputRow[] = [];

  // 1. Define a list of Nodes foci as
  let foci: TypedValue[];
  if (s.forEach) {
    // If S.forEach is defined: fhirpath(S.forEach, N)
    foci = evalFhirPathTyped(s.forEach, [n], variables);
  } else if (s.forEachOrNull) {
    // Else if S.forEachOrNull is defined: fhirpath(S.forEachOrNull, N)
    foci = evalFhirPathTyped(s.forEachOrNull, [n], variables);
  } else {
    // Otherwise: [N] (a list with just the input node)
    foci = [n];
  }

  // 2. For each element f of foci
  for (const f of foci) {
    // Initialize an empty list parts (each element of parts will be a list of partial rows)
    const parts: OutputRow[][] = [];

    // Process Columns:
    for (const col of s.column ?? []) {
      // For each Column col of S.column, define val as fhirpath(col.path, f)
      const val = evalFhirPathTyped(col.path, [f], variables);

      // Define b as a row whose column named col.name takes the value
      let b: OutputRow;

      if (val.length === 0) {
        // If val was the empty set: null
        b = { [col.name]: null };
      } else if (col.collection) {
        // Else if col.collection is true: val
        b = { [col.name]: val.map((v) => v.value) };
      } else if (val.length === 1) {
        // Else if val has a single element e: e
        b = { [col.name]: val[0].value };
      } else {
        // Else: throw "Multiple values found but not expected for column"
        throw new Error('Multiple values found but not expected for column');
      }

      // Append [b] to parts
      // (Note: append a list so the final element of parts is now a list containing the single row b).)
      parts.push([b]);
    }

    // Process Selects:
    // For each selection structure sel of S.select
    for (const sel of s.select ?? []) {
      // Define rows as the collection of all rows emitted by Process(sel, f)
      const rows = process(sel, f, variables);

      // Append rows to parts
      // (Note: do not append the elements but the whole list, so the final element of parts is now the list rows)
      parts.push(rows);
    }

    // Process UnionAlls:
    // Initialize urows as an empty list of rows
    // For each selection structure u of S.unionAll
    if (s.unionAll) {
      const urows: OutputRow[] = [];
      for (const u of s.unionAll) {
        // For each row r in Process(u, f)
        for (const r of process(u, f, variables)) {
          // Append r to urows
          urows.push(r);
        }
      }

      // Append urows to parts
      // (Note: do not append the elements but the whole list, so the final element of parts is now the list urows
      parts.push(urows);
    }

    // For every list of partial rows prows in the Cartesian product of parts
    // (Note: the Cartesian product is always between a Selection Structure and its direct children, not deeper descendants.
    // Because the process is recursive, rows generated by, for example, a .select[0].select[0].select[0] will eventually bubble up
    // to the top level, but the bubbling happens one level at a time.)
    result.push(...cartesianProduct(parts));
  }

  // If foci is an empty list and S.forEachOrNull is defined
  if (foci.length === 0 && s.forEachOrNull) {
    // (Note: when this condition is met, no rows have been emitted so far)
    // Initialize a blank row r
    const r: OutputRow = {};

    // For each Column c in ValidateColumns(V, [])
    for (const c of s.column ?? []) {
      // Bind the column c.name to null in the row r
      r[c.name] = null;
    }

    // Emit the row r
    result.push(r);
  }

  return result;
}

/**
 * Returns the Cartesian product of the given arrays.
 *
 * For example, if there are two sets of partial rows:
 *
 *   [{"a": 1},{"a": 2}] with bindings for the variable a
 *   [{"b": 3},{"b": 4}] with bindings for the variable b
 *
 * Then the Cartesian product of these sets consists of four complete rows:
 *
 *   [
 *     {"a": 1, "b": 3},
 *     {"a": 1, "b": 4},
 *     {"a": 2, "b": 3},
 *     {"a": 2, "b": 4}
 *   ]
 *
 * @param parts - The arrays to combine.
 * @returns The Cartesian product of the arrays.
 */
function cartesianProduct(parts: OutputRow[][]): OutputRow[] {
  if (parts.length === 0) {
    return [];
  }

  let temp = parts[0];
  for (let i = 1; i < parts.length; i++) {
    temp = cartesianProductHelper(temp, parts[i]);
  }

  return temp;
}

function cartesianProductHelper(aArray: OutputRow[], bArray: OutputRow[]): OutputRow[] {
  const result = [];
  for (const a of aArray) {
    for (const b of bArray) {
      result.push(combinePartialRows(a, b));
    }
  }
  return result;
}

function combinePartialRows(a: OutputRow, b: OutputRow): OutputRow {
  const result: OutputRow = {};
  Object.assign(result, a);
  Object.assign(result, b);
  return result;
}
