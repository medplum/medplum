import { Atom } from './parse';

/**
 * Collection of FHIRPath functions.
 * See: https://hl7.org/fhirpath/#functions
 */
export const functions: Record<string, (input: any[], ...args: Atom[]) => any> = {

  /*
   * 5.1 Existence
   * See: https://hl7.org/fhirpath/#existence
   */

  /**
   * Returns true if the input collection is empty ({ }) and false otherwise.
   *
   * See: https://hl7.org/fhirpath/#empty-boolean
   *
   * @param input The input collection.
   * @returns True if the input collection is empty ({ }) and false otherwise.
   */
  empty(input: any[]): boolean {
    return input.length === 0;
  },

  /**
   * Returns true if the collection has any elements, and false otherwise.
   * This is the opposite of empty(), and as such is a shorthand for empty().not().
   * If the input collection is empty ({ }), the result is false.
   *
   * The function can also take an optional criteria to be applied to the collection
   * prior to the determination of the exists. In this case, the function is shorthand
   * for where(criteria).exists().
   *
   * See: https://hl7.org/fhirpath/#existscriteria-expression-boolean
   *
   * @param input
   * @param criteria
   * @returns True if the collection has any elements, and false otherwise.
   */
  exists(input: any[], criteria?: Atom): boolean {
    if (criteria) {
      return input.filter(e => !!criteria.eval(e)).length > 0;
    } else {
      return input.length > 0;
    }
  },

  /**
   * Returns true if for every element in the input collection, criteria evaluates to true.
   * Otherwise, the result is false.
   *
   * If the input collection is empty ({ }), the result is true.
   *
   * See: https://hl7.org/fhirpath/#allcriteria-expression-boolean
   *
   * @param input The input collection.
   * @param criteria The evaluation criteria.
   * @returns True if for every element in the input collection, criteria evaluates to true.
   */
  all(input: any, criteria: Atom): boolean {
    for (const value of input) {
      if (!criteria.eval(value)) {
        return false;
      }
    }
    return true;
  },

  /**
   * Takes a collection of Boolean values and returns true if all the items are true.
   * If any items are false, the result is false.
   * If the input is empty ({ }), the result is true.
   *
   * See: https://hl7.org/fhirpath/#alltrue-boolean
   *
   * @param input The input collection.
   * @param criteria The evaluation criteria.
   * @returns True if all the items are true.
   */
  allTrue(input: any): boolean {
    for (const value of input) {
      if (!value) {
        return false;
      }
    }
    return true;
  },

  /**
   * Takes a collection of Boolean values and returns true if any of the items are true.
   * If all the items are false, or if the input is empty ({ }), the result is false.
   *
   * See: https://hl7.org/fhirpath/#anytrue-boolean
   *
   * @param input The input collection.
   * @param criteria The evaluation criteria.
   * @returns True if any of the items are true.
   */
  anyTrue(input: any): boolean {
    for (const value of input) {
      if (value) {
        return true;
      }
    }
    return false;
  },

  /**
   * Takes a collection of Boolean values and returns true if all the items are false.
   * If any items are true, the result is false.
   * If the input is empty ({ }), the result is true.
   *
   * See: https://hl7.org/fhirpath/#allfalse-boolean
   *
   * @param input The input collection.
   * @param criteria The evaluation criteria.
   * @returns True if all the items are false.
   */
  allFalse(input: any): boolean {
    for (const value of input) {
      if (value) {
        return false;
      }
    }
    return true;
  },

  /**
   * Takes a collection of Boolean values and returns true if any of the items are false.
   * If all the items are true, or if the input is empty ({ }), the result is false.
   *
   * See: https://hl7.org/fhirpath/#anyfalse-boolean
   *
   * @param input The input collection.
   * @param criteria The evaluation criteria.
   * @returns True if for every element in the input collection, criteria evaluates to true.
   */
  anyFalse(input: any): boolean {
    for (const value of input) {
      if (!value) {
        return true;
      }
    }
    return false;
  },

  /**
   * Returns the integer count of the number of items in the input collection.
   * Returns 0 when the input collection is empty.
   *
   * See: https://hl7.org/fhirpath/#count-integer
   *
   * @param input The input collection.
   * @returns The integer count of the number of items in the input collection.
   */
  count(input: any[]): number {
    return input.length;
  },

  /**
   * Returns a collection containing only the unique items in the input collection.
   * To determine whether two items are the same, the = (Equals) (=) operator is used,
   * as defined below.
   *
   * If the input collection is empty ({ }), the result is empty.
   *
   * Note that the order of elements in the input collection is not guaranteed to be
   * preserved in the result.
   *
   * See: https://hl7.org/fhirpath/#distinct-collection
   *
   * @param input The input collection.
   * @returns The integer count of the number of items in the input collection.
   */
  distinct(input: any[]): any[] {
    return Array.from(new Set(input));
  },

  /**
   * Returns true if all the items in the input collection are distinct.
   * To determine whether two items are distinct, the = (Equals) (=) operator is used,
   * as defined below.
   *
   * See: https://hl7.org/fhirpath/#isdistinct-boolean
   *
   * @param input The input collection.
   * @returns The integer count of the number of items in the input collection.
   */
  isDistinct(input: any[]): boolean {
    return input.length === new Set(input).size;
  },

  /*
   * 5.2 Filtering and projection
   */

  /**
   * Returns a collection containing only those elements in the input collection
   * for which the stated criteria expression evaluates to true.
   * Elements for which the expression evaluates to false or empty ({ }) are not
   * included in the result.
   *
   * If the input collection is empty ({ }), the result is empty.
   *
   * If the result of evaluating the condition is other than a single boolean value,
   * the evaluation will end and signal an error to the calling environment,
   * consistent with singleton evaluation of collections behavior.
   *
   * See: https://hl7.org/fhirpath/#wherecriteria-expression-collection
   *
   * @param input The input collection.
   * @param condition The condition atom.
   * @returns A collection containing only those elements in the input collection for which the stated criteria expression evaluates to true.
   */
  where(input: any[], criteria: Atom): any[] {
    return input.filter(e => !!criteria.eval(e));
  },

  /*
   * 5.3 Subsetting
   */

  /**
   * Will return the single item in the input if there is just one item.
   * If the input collection is empty ({ }), the result is empty.
   * If there are multiple items, an error is signaled to the evaluation environment.
   * This function is useful for ensuring that an error is returned if an assumption
   * about cardinality is violated at run-time.
   *
   * See: https://hl7.org/fhirpath/#single-collection
   *
   * @param input The input collection.
   * @returns The single item in the input if there is just one item.
   */
  single(input: any[]): any[] {
    if (input.length > 1) {
      throw new Error('Expected input length one for single()');
    }
    return input.length === 0 ? [] : input.slice(0, 1);
  },

  /**
   * Returns a collection containing only the first item in the input collection.
   * This function is equivalent to item[0], so it will return an empty collection if the input collection has no items.
   *
   * See: https://hl7.org/fhirpath/#first-collection
   *
   * @param input The input collection.
   * @returns A collection containing only the first item in the input collection.
   */
  first(input: any[]): any[] {
    return input.length === 0 ? [] : input.slice(0, 1);
  },

  /**
   * Returns a collection containing only the last item in the input collection.
   * Will return an empty collection if the input collection has no items.
   *
   * See: https://hl7.org/fhirpath/#last-collection
   *
   * @param input The input collection.
   * @returns A collection containing only the last item in the input collection.
   */
  last(input: any[]): any[] {
    return input.length === 0 ? [] : input.slice(input.length - 1, input.length);
  },

  /**
   * Returns a collection containing all but the first item in the input collection.
   * Will return an empty collection if the input collection has no items, or only one item.
   *
   * See: https://hl7.org/fhirpath/#tail-collection
   *
   * @param input The input collection.
   * @returns A collection containing all but the first item in the input collection.
   */
  tail(input: any[]): any[] {
    return input.length === 0 ? [] : input.slice(1, input.length);
  },

  /**
   * Returns a collection containing all but the first num items in the input collection.
   * Will return an empty collection if there are no items remaining after the
   * indicated number of items have been skipped, or if the input collection is empty.
   * If num is less than or equal to zero, the input collection is simply returned.
   *
   * See: https://hl7.org/fhirpath/#skipnum-integer-collection
   *
   * @param input The input collection.
   * @returns A collection containing all but the first item in the input collection.
   */
  skip(input: any[], num: Atom): any[] {
    const numValue = num.eval(0);
    if (typeof numValue !== 'number') {
      throw new Error('Expected a number for skip(num)');
    }
    if (numValue >= input.length) {
      return [];
    }
    if (numValue <= 0) {
      return input;
    }
    return input.slice(numValue, input.length);
  },

  /**
   * Returns a collection containing the first num items in the input collection,
   * or less if there are less than num items.
   * If num is less than or equal to 0, or if the input collection is empty ({ }),
   * take returns an empty collection.
   *
   * See: https://hl7.org/fhirpath/#takenum-integer-collection
   *
   * @param input The input collection.
   * @returns A collection containing the first num items in the input collection.
   */
  take(input: any[], num: Atom): any[] {
    const numValue = num.eval(0);
    if (typeof numValue !== 'number') {
      throw new Error('Expected a number for take(num)');
    }
    if (numValue >= input.length) {
      return input;
    }
    if (numValue <= 0) {
      return [];
    }
    return input.slice(0, numValue);
  },

  /*
   * Additional functions
   * See: https://hl7.org/fhir/fhirpath.html#functions
   */

  /**
   * For each item in the collection, if it is a string that is a uri (or canonical or url), locate the target of the reference, and add it to the resulting collection. If the item does not resolve to a resource, the item is ignored and nothing is added to the output collection.
   * The items in the collection may also represent a Reference, in which case the Reference.reference is resolved.
   * @param input The input collection.
   * @returns
   */
  resolve(input: any[]): any[] {
    return input.map(e => {
      let refStr: string | undefined;
      if (typeof e === 'string') {
        refStr = e;
      } else if (typeof e === 'object') {
        refStr = e.reference;
      }
      if (!refStr) {
        return undefined;
      }
      const [resourceType, id] = refStr.split('/');
      return { resourceType, id };
    }).filter(e => !!e);
  },

  /**
   * The as operator can be used to treat a value as a specific type.
   * @param context The context value.
   * @returns The value as the specific type.
   */
  as(context: any): any {
    return context;
  }
};