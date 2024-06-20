import { Reference, Resource } from '@medplum/fhirtypes';
import { Atom, AtomContext } from '../fhirlexer/parse';
import { PropertyType, TypedValue, isResource } from '../types';
import { calculateAge, getExtension, isEmpty, resolveId } from '../utils';
import { DotAtom, SymbolAtom } from './atoms';
import { parseDateString } from './date';
import { booleanToTypedValue, fhirPathIs, isQuantity, removeDuplicates, toJsBoolean, toTypedValue } from './utils';

/*
 * Collection of FHIRPath
 * See: https://hl7.org/fhirpath/#functions
 */

export type FhirPathFunction = (context: AtomContext, input: TypedValue[], ...args: Atom[]) => TypedValue[];

/**
 * Temporary placholder for unimplemented methods.
 * @returns Empty array.
 */
const stub: FhirPathFunction = (): [] => [];

export const functions: Record<string, FhirPathFunction> = {
  /*
   * 5.1 Existence
   * See: https://hl7.org/fhirpath/#existence
   */

  /**
   * Returns true if the input collection is empty ({ }) and false otherwise.
   *
   * See: https://hl7.org/fhirpath/#empty-boolean
   * @param _context - The evaluation context.
   * @param input - The input collection.
   * @returns True if the input collection is empty ({ }) and false otherwise.
   */
  empty: (_context: AtomContext, input: TypedValue[]): TypedValue[] => {
    return booleanToTypedValue(input.length === 0 || input.every((e) => isEmpty(e.value)));
  },

  /**
   * Returns true if the input collection is not empty ({ }) and false otherwise.
   *
   * @param _context - The evaluation context.
   * @param input - The input collection.
   * @returns True if the input collection is not empty ({ }) and false otherwise.
   */
  hasValue: (_context: AtomContext, input: TypedValue[]): TypedValue[] => {
    return booleanToTypedValue(input.length !== 0);
  },

  /**
   * Returns true if the collection has unknown elements, and false otherwise.
   * This is the opposite of empty(), and as such is a shorthand for empty().not().
   * If the input collection is empty ({ }), the result is false.
   *
   * The function can also take an optional criteria to be applied to the collection
   * prior to the determination of the exists. In this case, the function is shorthand
   * for where(criteria).exists().
   *
   * See: https://hl7.org/fhirpath/#existscriteria-expression-boolean
   * @param context - The evaluation context.
   * @param input - The input collection.
   * @param criteria - The evaluation criteria.
   * @returns True if the collection has unknown elements, and false otherwise.
   */
  exists: (context: AtomContext, input: TypedValue[], criteria?: Atom): TypedValue[] => {
    if (criteria) {
      return booleanToTypedValue(input.filter((e) => toJsBoolean(criteria.eval(context, [e]))).length > 0);
    } else {
      return booleanToTypedValue(input.length > 0 && input.every((e) => !isEmpty(e.value)));
    }
  },

  /**
   * Returns true if for every element in the input collection, criteria evaluates to true.
   * Otherwise, the result is false.
   *
   * If the input collection is empty ({ }), the result is true.
   *
   * See: https://hl7.org/fhirpath/#allcriteria-expression-boolean
   * @param context - The evaluation context.
   * @param input - The input collection.
   * @param criteria - The evaluation criteria.
   * @returns True if for every element in the input collection, criteria evaluates to true.
   */
  all: (context: AtomContext, input: TypedValue[], criteria: Atom): TypedValue[] => {
    return booleanToTypedValue(input.every((e) => toJsBoolean(criteria.eval(context, [e]))));
  },

  /**
   * Takes a collection of Boolean values and returns true if all the items are true.
   * If unknown items are false, the result is false.
   * If the input is empty ({ }), the result is true.
   *
   * See: https://hl7.org/fhirpath/#alltrue-boolean
   * @param _context - The evaluation context.
   * @param input - The input collection.
   * @returns True if all the items are true.
   */
  allTrue: (_context: AtomContext, input: TypedValue[]): TypedValue[] => {
    for (const value of input) {
      if (!value.value) {
        return booleanToTypedValue(false);
      }
    }
    return booleanToTypedValue(true);
  },

  /**
   * Takes a collection of Boolean values and returns true if unknown of the items are true.
   * If all the items are false, or if the input is empty ({ }), the result is false.
   *
   * See: https://hl7.org/fhirpath/#anytrue-boolean
   * @param _context - The evaluation context.
   * @param input - The input collection.
   * @returns True if unknown of the items are true.
   */
  anyTrue: (_context: AtomContext, input: TypedValue[]): TypedValue[] => {
    for (const value of input) {
      if (value.value) {
        return booleanToTypedValue(true);
      }
    }
    return booleanToTypedValue(false);
  },

  /**
   * Takes a collection of Boolean values and returns true if all the items are false.
   * If unknown items are true, the result is false.
   * If the input is empty ({ }), the result is true.
   *
   * See: https://hl7.org/fhirpath/#allfalse-boolean
   * @param _context - The evaluation context.
   * @param input - The input collection.
   * @returns True if all the items are false.
   */
  allFalse: (_context: AtomContext, input: TypedValue[]): TypedValue[] => {
    for (const value of input) {
      if (value.value) {
        return booleanToTypedValue(false);
      }
    }
    return booleanToTypedValue(true);
  },

  /**
   * Takes a collection of Boolean values and returns true if unknown of the items are false.
   * If all the items are true, or if the input is empty ({ }), the result is false.
   *
   * See: https://hl7.org/fhirpath/#anyfalse-boolean
   * @param _context - The evaluation context.
   * @param input - The input collection.
   * @returns True if for every element in the input collection, criteria evaluates to true.
   */
  anyFalse: (_context: AtomContext, input: TypedValue[]): TypedValue[] => {
    for (const value of input) {
      if (!value.value) {
        return booleanToTypedValue(true);
      }
    }
    return booleanToTypedValue(false);
  },

  /**
   * Returns true if all items in the input collection are members of the collection passed
   * as the other argument. Membership is determined using the = (Equals) (=) operation.
   *
   * Conceptually, this function is evaluated by testing each element in the input collection
   * for membership in the other collection, with a default of true. This means that if the
   * input collection is empty ({ }), the result is true, otherwise if the other collection
   * is empty ({ }), the result is false.
   *
   * See: http://hl7.org/fhirpath/#subsetofother-collection-boolean
   * @param context - The evaluation context.
   * @param input - The input collection.
   * @param other - The atom representing the collection of elements.
   * @returns True if all items in the input collection are members of the other collection.
   */
  subsetOf: (context: AtomContext, input: TypedValue[], other: Atom): TypedValue[] => {
    if (input.length === 0) {
      return booleanToTypedValue(true);
    }

    const otherArray = other.eval(context, getRootInput(context));
    if (otherArray.length === 0) {
      return booleanToTypedValue(false);
    }

    return booleanToTypedValue(input.every((e) => otherArray.some((o) => o.value === e.value)));
  },

  /**
   * Returns true if all items in the collection passed as the other argument are members of
   * the input collection. Membership is determined using the = (Equals) (=) operation.
   *
   * Conceptually, this function is evaluated by testing each element in the other collection
   * for membership in the input collection, with a default of true. This means that if the
   * other collection is empty ({ }), the result is true, otherwise if the input collection
   * is empty ({ }), the result is false.
   *
   * See: http://hl7.org/fhirpath/#supersetofother-collection-boolean
   * @param context - The evaluation context.
   * @param input - The input collection.
   * @param other - The atom representing the collection of elements.
   * @returns True if all items in the other collection are members of the input collection.
   */
  supersetOf: (context: AtomContext, input: TypedValue[], other: Atom): TypedValue[] => {
    const otherArray = other.eval(context, getRootInput(context));
    if (otherArray.length === 0) {
      return booleanToTypedValue(true);
    }

    if (input.length === 0) {
      return booleanToTypedValue(false);
    }

    return booleanToTypedValue(otherArray.every((e) => input.some((o) => o.value === e.value)));
  },

  /**
   * Returns the integer count of the number of items in the input collection.
   * Returns 0 when the input collection is empty.
   *
   * See: https://hl7.org/fhirpath/#count-integer
   * @param _context - The evaluation context.
   * @param input - The input collection.
   * @returns The integer count of the number of items in the input collection.
   */
  count: (_context: AtomContext, input: TypedValue[]): TypedValue[] => {
    return [{ type: PropertyType.integer, value: input.length }];
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
   * @param _context - The evaluation context.
   * @param input - The input collection.
   * @returns The integer count of the number of items in the input collection.
   */
  distinct: (_context: AtomContext, input: TypedValue[]): TypedValue[] => {
    const result: TypedValue[] = [];
    for (const value of input) {
      if (!result.some((e) => e.value === value.value)) {
        result.push(value);
      }
    }
    return result;
  },

  /**
   * Returns true if all the items in the input collection are distinct.
   * To determine whether two items are distinct, the = (Equals) (=) operator is used,
   * as defined below.
   *
   * See: https://hl7.org/fhirpath/#isdistinct-boolean
   * @param context - The evaluation context.
   * @param input - The input collection.
   * @returns The integer count of the number of items in the input collection.
   */
  isDistinct: (context: AtomContext, input: TypedValue[]): TypedValue[] => {
    return booleanToTypedValue(input.length === functions.distinct(context, input).length);
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
   * @param context - The evaluation context.
   * @param input - The input collection.
   * @param criteria - The condition atom.
   * @returns A collection containing only those elements in the input collection for which the stated criteria expression evaluates to true.
   */
  where: (context: AtomContext, input: TypedValue[], criteria: Atom): TypedValue[] => {
    return input.filter((e) => toJsBoolean(criteria.eval(context, [e])));
  },

  /**
   * Evaluates the projection expression for each item in the input collection.
   * The result of each evaluation is added to the output collection. If the
   * evaluation results in a collection with multiple items, all items are added
   * to the output collection (collections resulting from evaluation of projection
   * are flattened). This means that if the evaluation for an element results in
   * the empty collection ({ }), no element is added to the result, and that if
   * the input collection is empty ({ }), the result is empty as well.
   *
   * See: http://hl7.org/fhirpath/#selectprojection-expression-collection
   * @param context - The evaluation context.
   * @param input - The input collection.
   * @param criteria - The condition atom.
   * @returns A collection containing only those elements in the input collection for which the stated criteria expression evaluates to true.
   */
  select: (context: AtomContext, input: TypedValue[], criteria: Atom): TypedValue[] => {
    return input.map((e) => criteria.eval(context, [e])).flat();
  },

  /**
   * A version of select that will repeat the projection and add it to the output
   * collection, as long as the projection yields new items (as determined by
   * the = (Equals) (=) operator).
   *
   * See: http://hl7.org/fhirpath/#repeatprojection-expression-collection
   */
  repeat: stub,

  /**
   * Returns a collection that contains all items in the input collection that
   * are of the given type or a subclass thereof. If the input collection is
   * empty ({ }), the result is empty. The type argument is an identifier that
   * must resolve to the name of a type in a model
   *
   * See: http://hl7.org/fhirpath/#oftypetype-type-specifier-collection
   * @param _context - The evaluation context.
   * @param input - The input collection.
   * @param criteria - The condition atom.
   * @returns A collection containing only those elements in the input collection that are of the given type or a subclass thereof.
   */
  ofType: (_context: AtomContext, input: TypedValue[], criteria: Atom): TypedValue[] => {
    return input.filter((e) => e.type === (criteria as SymbolAtom).name);
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
   * @param _context - The evaluation context.
   * @param input - The input collection.
   * @returns The single item in the input if there is just one item.
   */
  single: (_context: AtomContext, input: TypedValue[]): TypedValue[] => {
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
   * @param context - The evaluation context.
   * @param input - The input collection.
   * @returns A collection containing only the first item in the input collection.
   */
  first: (context: AtomContext, input: TypedValue[]): TypedValue[] => {
    return input.length === 0 ? [] : input.slice(0, 1);
  },

  /**
   * Returns a collection containing only the last item in the input collection.
   * Will return an empty collection if the input collection has no items.
   *
   * See: https://hl7.org/fhirpath/#last-collection
   * @param context - The evaluation context.
   * @param input - The input collection.
   * @returns A collection containing only the last item in the input collection.
   */
  last: (context: AtomContext, input: TypedValue[]): TypedValue[] => {
    return input.length === 0 ? [] : input.slice(input.length - 1, input.length);
  },

  /**
   * Returns a collection containing all but the first item in the input collection.
   * Will return an empty collection if the input collection has no items, or only one item.
   *
   * See: https://hl7.org/fhirpath/#tail-collection
   * @param context - The evaluation context.
   * @param input - The input collection.
   * @returns A collection containing all but the first item in the input collection.
   */
  tail: (context: AtomContext, input: TypedValue[]): TypedValue[] => {
    return input.length === 0 ? [] : input.slice(1, input.length);
  },

  /**
   * Returns a collection containing all but the first num items in the input collection.
   * Will return an empty collection if there are no items remaining after the
   * indicated number of items have been skipped, or if the input collection is empty.
   * If num is less than or equal to zero, the input collection is simply returned.
   *
   * See: https://hl7.org/fhirpath/#skipnum-integer-collection
   * @param context - The evaluation context.
   * @param input - The input collection.
   * @param num - The atom representing the number of elements to skip.
   * @returns A collection containing all but the first item in the input collection.
   */
  skip: (context: AtomContext, input: TypedValue[], num: Atom): TypedValue[] => {
    const numValue = num.eval(context, input)[0]?.value;
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
   * @param context - The evaluation context.
   * @param input - The input collection.
   * @param num - The atom representing the number of elements to take.
   * @returns A collection containing the first num items in the input collection.
   */
  take: (context: AtomContext, input: TypedValue[], num: Atom): TypedValue[] => {
    const numValue = num.eval(context, input)[0]?.value;
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

  /**
   * Returns the set of elements that are in both collections.
   * Duplicate items will be eliminated by this function.
   * Order of items is not guaranteed to be preserved in the result of this function.
   *
   * See: http://hl7.org/fhirpath/#intersectother-collection-collection
   * @param context - The evaluation context.
   * @param input - The input collection.
   * @param other - The atom representing the collection of elements to intersect.
   * @returns A collection containing the elements that are in both collections.
   */
  intersect: (context: AtomContext, input: TypedValue[], other: Atom): TypedValue[] => {
    if (!other) {
      return input;
    }
    const otherArray = other.eval(context, getRootInput(context));
    const result: TypedValue[] = [];
    for (const value of input) {
      if (!result.some((e) => e.value === value.value) && otherArray.some((e) => e.value === value.value)) {
        result.push(value);
      }
    }
    return result;
  },

  /**
   * Returns the set of elements that are not in the other collection.
   * Duplicate items will not be eliminated by this function, and order will be preserved.
   *
   * e.g. (1 | 2 | 3).exclude(2) returns (1 | 3).
   *
   * See: http://hl7.org/fhirpath/#excludeother-collection-collection
   * @param context - The evaluation context.
   * @param input - The input collection.
   * @param other - The atom representing the collection of elements to exclude.
   * @returns A collection containing the elements that are in the input collection but not the other collection.
   */
  exclude: (context: AtomContext, input: TypedValue[], other: Atom): TypedValue[] => {
    if (!other) {
      return input;
    }
    const otherArray = other.eval(context, getRootInput(context));
    const result: TypedValue[] = [];
    for (const value of input) {
      if (!otherArray.some((e) => e.value === value.value)) {
        result.push(value);
      }
    }
    return result;
  },

  /*
   * 5.4. Combining
   *
   * See: https://hl7.org/fhirpath/#combining
   */

  /**
   * Merge the two collections into a single collection,
   * eliminating unknown duplicate values (using = (Equals) (=) to determine equality).
   * There is no expectation of order in the resulting collection.
   *
   * In other words, this function returns the distinct list of elements from both inputs.
   *
   * See: http://hl7.org/fhirpath/#unionother-collection
   * @param context - The evaluation context.
   * @param input - The input collection.
   * @param other - The atom representing the collection of elements to merge.
   * @returns A collection containing the elements that represent the union of both collections.
   */
  union: (context: AtomContext, input: TypedValue[], other: Atom): TypedValue[] => {
    if (!other) {
      return input;
    }
    const otherArray = other.eval(context, getRootInput(context));
    return removeDuplicates([...input, ...otherArray]);
  },

  /**
   * Merge the input and other collections into a single collection
   * without eliminating duplicate values. Combining an empty collection
   * with a non-empty collection will return the non-empty collection.
   *
   * There is no expectation of order in the resulting collection.
   *
   * See: http://hl7.org/fhirpath/#combineother-collection-collection
   * @param context - The evaluation context.
   * @param input - The input collection.
   * @param other - The atom representing the collection of elements to merge.
   * @returns A collection containing the elements that represent the combination of both collections including duplicates.
   */
  combine: (context: AtomContext, input: TypedValue[], other: Atom): TypedValue[] => {
    if (!other) {
      return input;
    }
    const otherArray = other.eval(context, getRootInput(context));
    return [...input, ...otherArray];
  },

  /**
   * Returns true if the input is a value HTML element.
   *
   * See: https://hl7.org/fhir/fhirpath.html#variables
   * @param _context - The evaluation context.
   * @param _input - The input collection.
   * @param _other - The atom representing the collection of elements to validate the html.
   * @returns A collection of boolean values
   */
  htmlChecks: (_context: AtomContext, _input: TypedValue[], _other: Atom): TypedValue[] => {
    return [toTypedValue(true)];
  },

  /*
   * 5.5. Conversion
   *
   * See: https://hl7.org/fhirpath/#conversion
   */

  /**
   * The iif function in FHIRPath is an immediate if,
   * also known as a conditional operator (such as C’s ? : operator).
   *
   * The criterion expression is expected to evaluate to a Boolean.
   *
   * If criterion is true, the function returns the value of the true-result argument.
   *
   * If criterion is false or an empty collection, the function returns otherwise-result,
   * unless the optional otherwise-result is not given, in which case the function returns an empty collection.
   *
   * Note that short-circuit behavior is expected in this function. In other words,
   * true-result should only be evaluated if the criterion evaluates to true,
   * and otherwise-result should only be evaluated otherwise. For implementations,
   * this means delaying evaluation of the arguments.
   * @param context - The evaluation context.
   * @param input - The input collection.
   * @param criterion - The atom representing the conditional.
   * @param trueResult - The atom to be used if the conditional evaluates to true.
   * @param otherwiseResult - Optional atom to be used if the conditional evaluates to false.
   * @returns The result of the iif function.
   */
  iif: (
    context: AtomContext,
    input: TypedValue[],
    criterion: Atom,
    trueResult: Atom,
    otherwiseResult?: Atom
  ): TypedValue[] => {
    const evalResult = criterion.eval(context, input);
    if (evalResult.length > 1 || (evalResult.length === 1 && typeof evalResult[0].value !== 'boolean')) {
      throw new Error('Expected criterion to evaluate to a Boolean');
    }

    if (toJsBoolean(evalResult)) {
      return trueResult.eval(context, input);
    }

    if (otherwiseResult) {
      return otherwiseResult.eval(context, input);
    }

    return [];
  },

  /**
   * Converts an input collection to a boolean.
   *
   * If the input collection contains a single item, this function will return a single boolean if:
   *   1) the item is a Boolean
   *   2) the item is an Integer and is equal to one of the possible integer representations of Boolean values
   *   3) the item is a Decimal that is equal to one of the possible decimal representations of Boolean values
   *   4) the item is a String that is equal to one of the possible string representations of Boolean values
   *
   * If the item is not one the above types, or the item is a String, Integer, or Decimal, but is not equal to one of the possible values convertible to a Boolean, the result is empty.
   *
   * See: https://hl7.org/fhirpath/#toboolean-boolean
   * @param _context - The evaluation context.
   * @param input - The input collection.
   * @returns The input converted to boolean value.
   */
  toBoolean: (_context: AtomContext, input: TypedValue[]): TypedValue[] => {
    if (input.length === 0) {
      return [];
    }
    const [{ value }] = validateInput(input, 1);
    if (typeof value === 'boolean') {
      return [{ type: PropertyType.boolean, value }];
    }
    if (typeof value === 'number') {
      if (value === 0 || value === 1) {
        return booleanToTypedValue(!!value);
      }
    }
    if (typeof value === 'string') {
      const lowerStr = value.toLowerCase();
      if (['true', 't', 'yes', 'y', '1', '1.0'].includes(lowerStr)) {
        return booleanToTypedValue(true);
      }
      if (['false', 'f', 'no', 'n', '0', '0.0'].includes(lowerStr)) {
        return booleanToTypedValue(false);
      }
    }
    return [];
  },

  /**
   * If the input collection contains a single item, this function will return true if:
   *   1) the item is a Boolean
   *   2) the item is an Integer that is equal to one of the possible integer representations of Boolean values
   *   3) the item is a Decimal that is equal to one of the possible decimal representations of Boolean values
   *   4) the item is a String that is equal to one of the possible string representations of Boolean values
   *
   * If the item is not one of the above types, or the item is a String, Integer, or Decimal, but is not equal to one of the possible values convertible to a Boolean, the result is false.
   *
   * Possible values for Integer, Decimal, and String are described in the toBoolean() function.
   *
   * If the input collection contains multiple items, the evaluation of the expression will end and signal an error to the calling environment.
   *
   * If the input collection is empty, the result is empty.
   *
   * See: http://hl7.org/fhirpath/#convertstoboolean-boolean
   * @param context - The evaluation context.
   * @param input - The input collection.
   * @returns True if the input can be converted to boolean.
   */
  convertsToBoolean: (context: AtomContext, input: TypedValue[]): TypedValue[] => {
    if (input.length === 0) {
      return [];
    }
    return booleanToTypedValue(functions.toBoolean(context, input).length === 1);
  },

  /**
   * Returns the integer representation of the input.
   *
   * If the input collection contains a single item, this function will return a single integer if:
   *   1) the item is an Integer
   *   2) the item is a String and is convertible to an integer
   *   3) the item is a Boolean, where true results in a 1 and false results in a 0.
   *
   * If the item is not one the above types, the result is empty.
   *
   * If the item is a String, but the string is not convertible to an integer (using the regex format (\\+|-)?\d+), the result is empty.
   *
   * If the input collection contains multiple items, the evaluation of the expression will end and signal an error to the calling environment.
   *
   * If the input collection is empty, the result is empty.
   *
   * See: https://hl7.org/fhirpath/#tointeger-integer
   * @param _context - The evaluation context.
   * @param input - The input collection.
   * @returns The string representation of the input.
   */
  toInteger: (_context: AtomContext, input: TypedValue[]): TypedValue[] => {
    if (input.length === 0) {
      return [];
    }
    const [{ value }] = validateInput(input, 1);
    if (typeof value === 'number') {
      return [{ type: PropertyType.integer, value }];
    }
    if (typeof value === 'string' && /^[+-]?\d+$/.exec(value)) {
      return [{ type: PropertyType.integer, value: parseInt(value, 10) }];
    }
    if (typeof value === 'boolean') {
      return [{ type: PropertyType.integer, value: value ? 1 : 0 }];
    }
    return [];
  },

  /**
   * Returns true if the input can be converted to string.
   *
   * If the input collection contains a single item, this function will return true if:
   *   1) the item is an Integer
   *   2) the item is a String and is convertible to an Integer
   *   3) the item is a Boolean
   *   4) If the item is not one of the above types, or the item is a String, but is not convertible to an Integer (using the regex format (\\+|-)?\d+), the result is false.
   *
   * If the input collection contains multiple items, the evaluation of the expression will end and signal an error to the calling environment.
   *
   * If the input collection is empty, the result is empty.
   *
   * See: https://hl7.org/fhirpath/#convertstointeger-boolean
   * @param context - The evaluation context.
   * @param input - The input collection.
   * @returns True if the input can be converted to an integer.
   */
  convertsToInteger: (context: AtomContext, input: TypedValue[]): TypedValue[] => {
    if (input.length === 0) {
      return [];
    }
    return booleanToTypedValue(functions.toInteger(context, input).length === 1);
  },

  /**
   * If the input collection contains a single item, this function will return a single date if:
   *   1) the item is a Date
   *   2) the item is a DateTime
   *   3) the item is a String and is convertible to a Date
   *
   * If the item is not one of the above types, the result is empty.
   *
   * If the item is a String, but the string is not convertible to a Date (using the format YYYY-MM-DD), the result is empty.
   *
   * If the input collection contains multiple items, the evaluation of the expression will end and signal an error to the calling environment.
   *
   * If the input collection is empty, the result is empty.
   *
   * See: https://hl7.org/fhirpath/#todate-date
   * @param _context - The evaluation context.
   * @param input - The input collection.
   * @returns The value converted to a date if possible; otherwise empty array.
   */
  toDate: (_context: AtomContext, input: TypedValue[]): TypedValue[] => {
    if (input.length === 0) {
      return [];
    }
    const [{ value }] = validateInput(input, 1);
    if (typeof value === 'string' && /^\d{4}(-\d{2}(-\d{2})?)?/.exec(value)) {
      return [{ type: PropertyType.date, value: parseDateString(value) }];
    }
    return [];
  },

  /**
   * If the input collection contains a single item, this function will return true if:
   *   1) the item is a Date
   *   2) the item is a DateTime
   *   3) the item is a String and is convertible to a Date
   *
   * If the item is not one of the above types, or is not convertible to a Date (using the format YYYY-MM-DD), the result is false.
   *
   * If the item contains a partial date (e.g. '2012-01'), the result is a partial date.
   *
   * If the input collection contains multiple items, the evaluation of the expression will end and signal an error to the calling environment.
   *
   * If the input collection is empty, the result is empty.
   *
   * See: https://hl7.org/fhirpath/#convertstodate-boolean
   * @param context - The evaluation context.
   * @param input - The input collection.
   * @returns True if the item can be converted to a date.
   */
  convertsToDate: (context: AtomContext, input: TypedValue[]): TypedValue[] => {
    if (input.length === 0) {
      return [];
    }
    return booleanToTypedValue(functions.toDate(context, input).length === 1);
  },

  /**
   * If the input collection contains a single item, this function will return a single datetime if:
   *   1) the item is a DateTime
   *   2) the item is a Date, in which case the result is a DateTime with the year, month, and day of the Date, and the time components empty (not set to zero)
   *   3) the item is a String and is convertible to a DateTime
   *
   * If the item is not one of the above types, the result is empty.
   *
   * If the item is a String, but the string is not convertible to a DateTime (using the format YYYY-MM-DDThh:mm:ss.fff(+|-)hh:mm), the result is empty.
   *
   * If the item contains a partial datetime (e.g. '2012-01-01T10:00'), the result is a partial datetime.
   *
   * If the input collection contains multiple items, the evaluation of the expression will end and signal an error to the calling environment.
   *
   * If the input collection is empty, the result is empty.
   *
   * See: https://hl7.org/fhirpath/#todatetime-datetime
   * @param _context - The evaluation context.
   * @param input - The input collection.
   * @returns The value converted to a datetime if possible; otherwise empty array.
   */
  toDateTime: (_context: AtomContext, input: TypedValue[]): TypedValue[] => {
    if (input.length === 0) {
      return [];
    }
    const [{ value }] = validateInput(input, 1);
    if (typeof value === 'string' && /^\d{4}(-\d{2}(-\d{2})?)?/.exec(value)) {
      return [{ type: PropertyType.dateTime, value: parseDateString(value) }];
    }
    return [];
  },

  /**
   * If the input collection contains a single item, this function will return true if:
   *   1) the item is a DateTime
   *   2) the item is a Date
   *   3) the item is a String and is convertible to a DateTime
   *
   * If the item is not one of the above types, or is not convertible to a DateTime (using the format YYYY-MM-DDThh:mm:ss.fff(+|-)hh:mm), the result is false.
   *
   * If the input collection contains multiple items, the evaluation of the expression will end and signal an error to the calling environment.
   *
   * If the input collection is empty, the result is empty.
   *
   * See: https://hl7.org/fhirpath/#convertstodatetime-boolean
   * @param context - The evaluation context.
   * @param input - The input collection.
   * @returns True if the item can be converted to a dateTime.
   */
  convertsToDateTime: (context: AtomContext, input: TypedValue[]): TypedValue[] => {
    if (input.length === 0) {
      return [];
    }
    return booleanToTypedValue(functions.toDateTime(context, input).length === 1);
  },

  /**
   * If the input collection contains a single item, this function will return a single decimal if:
   *   1) the item is an Integer or Decimal
   *   2) the item is a String and is convertible to a Decimal
   *   3) the item is a Boolean, where true results in a 1.0 and false results in a 0.0.
   *   4) If the item is not one of the above types, the result is empty.
   *
   * If the item is a String, but the string is not convertible to a Decimal (using the regex format (\\+|-)?\d+(\.\d+)?), the result is empty.
   *
   * If the input collection contains multiple items, the evaluation of the expression will end and signal an error to the calling environment.
   *
   * If the input collection is empty, the result is empty.
   *
   * See: https://hl7.org/fhirpath/#decimal-conversion-functions
   * @param _context - The evaluation context.
   * @param input - The input collection.
   * @returns The value converted to a decimal if possible; otherwise empty array.
   */
  toDecimal: (_context: AtomContext, input: TypedValue[]): TypedValue[] => {
    if (input.length === 0) {
      return [];
    }
    const [{ value }] = validateInput(input, 1);
    if (typeof value === 'number') {
      return [{ type: PropertyType.decimal, value }];
    }
    if (typeof value === 'string' && /^-?\d{1,9}(\.\d{1,9})?$/.exec(value)) {
      return [{ type: PropertyType.decimal, value: parseFloat(value) }];
    }
    if (typeof value === 'boolean') {
      return [{ type: PropertyType.decimal, value: value ? 1 : 0 }];
    }
    return [];
  },

  /**
   * If the input collection contains a single item, this function will true if:
   *   1) the item is an Integer or Decimal
   *   2) the item is a String and is convertible to a Decimal
   *   3) the item is a Boolean
   *
   * If the item is not one of the above types, or is not convertible to a Decimal (using the regex format (\\+|-)?\d+(\.\d+)?), the result is false.
   *
   * If the input collection contains multiple items, the evaluation of the expression will end and signal an error to the calling environment.
   *
   * If the input collection is empty, the result is empty.
   *
   * See: https://hl7.org/fhirpath/#convertstodecimal-boolean
   * @param context - The evaluation context.
   * @param input - The input collection.
   * @returns The value converted to a decimal if possible; otherwise empty array.
   */
  convertsToDecimal: (context: AtomContext, input: TypedValue[]): TypedValue[] => {
    if (input.length === 0) {
      return [];
    }
    return booleanToTypedValue(functions.toDecimal(context, input).length === 1);
  },

  /**
   * If the input collection contains a single item, this function will return a single quantity if:
   *   1) the item is an Integer, or Decimal, where the resulting quantity will have the default unit ('1')
   *   2) the item is a Quantity
   *   3) the item is a String and is convertible to a Quantity
   *   4) the item is a Boolean, where true results in the quantity 1.0 '1', and false results in the quantity 0.0 '1'
   *
   * If the item is not one of the above types, the result is empty.
   *
   * See: https://hl7.org/fhirpath/#quantity-conversion-functions
   * @param _context - The evaluation context.
   * @param input - The input collection.
   * @returns The value converted to a quantity if possible; otherwise empty array.
   */
  toQuantity: (_context: AtomContext, input: TypedValue[]): TypedValue[] => {
    if (input.length === 0) {
      return [];
    }
    const [{ value }] = validateInput(input, 1);
    if (isQuantity(value)) {
      return [{ type: PropertyType.Quantity, value }];
    }
    if (typeof value === 'number') {
      return [{ type: PropertyType.Quantity, value: { value, unit: '1' } }];
    }
    if (typeof value === 'string' && /^-?\d{1,9}(\.\d{1,9})?/.exec(value)) {
      return [{ type: PropertyType.Quantity, value: { value: parseFloat(value), unit: '1' } }];
    }
    if (typeof value === 'boolean') {
      return [{ type: PropertyType.Quantity, value: { value: value ? 1 : 0, unit: '1' } }];
    }
    return [];
  },

  /**
   * If the input collection contains a single item, this function will return true if:
   *   1) the item is an Integer, Decimal, or Quantity
   *   2) the item is a String that is convertible to a Quantity
   *   3) the item is a Boolean
   *
   * If the item is not one of the above types, or is not convertible to a Quantity using the following regex format:
   *
   *     (?'value'(\+|-)?\d+(\.\d+)?)\s*('(?'unit'[^']+)'|(?'time'[a-zA-Z]+))?
   *
   * then the result is false.
   *
   * If the input collection contains multiple items, the evaluation of the expression will end and signal an error to the calling environment.
   *
   * If the input collection is empty, the result is empty.
   *
   * If the unit argument is provided, it must be the string representation of a UCUM code (or a FHIRPath calendar duration keyword), and is used to determine whether the input quantity can be converted to the given unit, according to the unit conversion rules specified by UCUM. If the input quantity can be converted, the result is true, otherwise, the result is false.
   *
   * See: https://hl7.org/fhirpath/#convertstoquantityunit-string-boolean
   * @param context - The evaluation context.
   * @param input - The input collection.
   * @returns True if the item can be converted to a quantity.
   */
  convertsToQuantity: (context: AtomContext, input: TypedValue[]): TypedValue[] => {
    if (input.length === 0) {
      return [];
    }
    return booleanToTypedValue(functions.toQuantity(context, input).length === 1);
  },

  /**
   * Returns the string representation of the input.
   *
   * If the input collection contains a single item, this function will return a single String if:
   *
   *  1) the item in the input collection is a String
   *  2) the item in the input collection is an Integer, Decimal, Date, Time, DateTime, or Quantity the output will contain its String representation
   *  3) the item is a Boolean, where true results in 'true' and false in 'false'.
   *
   * If the item is not one of the above types, the result is false.
   *
   * See: https://hl7.org/fhirpath/#tostring-string
   * @param _context - The evaluation context.
   * @param input - The input collection.
   * @returns The string representation of the input.
   */
  toString: (_context: AtomContext, input: TypedValue[]): TypedValue[] => {
    if (input.length === 0) {
      return [];
    }
    const [{ value }] = validateInput(input, 1);
    if (value === null || value === undefined) {
      return [];
    }
    if (isQuantity(value)) {
      return [{ type: PropertyType.string, value: `${value.value} '${value.unit}'` }];
    }
    return [{ type: PropertyType.string, value: (value as boolean | number | string).toString() }];
  },

  /**
   * Returns true if the input can be converted to string.
   *
   * If the input collection contains a single item, this function will return true if:
   *   1) the item is a String
   *   2) the item is an Integer, Decimal, Date, Time, or DateTime
   *   3) the item is a Boolean
   *   4) the item is a Quantity
   *
   * If the item is not one of the above types, the result is false.
   *
   * If the input collection contains multiple items, the evaluation of the expression will end and signal an error to the calling environment.
   *
   * If the input collection is empty, the result is empty.
   *
   * See: https://hl7.org/fhirpath/#tostring-string
   * @param context - The evaluation context.
   * @param input - The input collection.
   * @returns True if the item can be converted to a string
   */
  convertsToString: (context: AtomContext, input: TypedValue[]): TypedValue[] => {
    if (input.length === 0) {
      return [];
    }
    return booleanToTypedValue((functions.toString as unknown as FhirPathFunction)(context, input).length === 1);
  },

  /**
   * If the input collection contains a single item, this function will return a single time if:
   *   1) the item is a Time
   *   2) the item is a String and is convertible to a Time
   *
   * If the item is not one of the above types, the result is empty.
   *
   * If the item is a String, but the string is not convertible to a Time (using the format hh:mm:ss.fff(+|-)hh:mm), the result is empty.
   *
   * If the item contains a partial time (e.g. '10:00'), the result is a partial time.
   *
   * If the input collection contains multiple items, the evaluation of the expression will end and signal an error to the calling environment.
   *
   * If the input collection is empty, the result is empty.
   *
   * See: https://hl7.org/fhirpath/#totime-time
   * @param _context - The evaluation context.
   * @param input - The input collection.
   * @returns The value converted to a time if possible; otherwise empty array.
   */
  toTime: (_context: AtomContext, input: TypedValue[]): TypedValue[] => {
    if (input.length === 0) {
      return [];
    }
    const [{ value }] = validateInput(input, 1);
    if (typeof value === 'string') {
      const match = /^T?(\d{2}(:\d{2}(:\d{2})?)?)/.exec(value);
      if (match) {
        return [{ type: PropertyType.time, value: parseDateString('T' + match[1]) }];
      }
    }
    return [];
  },

  /**
   * If the input collection contains a single item, this function will return true if:
   *   1) the item is a Time
   *   2) the item is a String and is convertible to a Time
   *
   * If the item is not one of the above types, or is not convertible to a Time (using the format hh:mm:ss.fff(+|-)hh:mm), the result is false.
   *
   * If the input collection contains multiple items, the evaluation of the expression will end and signal an error to the calling environment.
   *
   * If the input collection is empty, the result is empty.
   *
   * See: https://hl7.org/fhirpath/#convertstotime-boolean
   * @param context - The evaluation context.
   * @param input - The input collection.
   * @returns True if the item can be converted to a time.
   */
  convertsToTime: (context: AtomContext, input: TypedValue[]): TypedValue[] => {
    if (input.length === 0) {
      return [];
    }
    return booleanToTypedValue(functions.toTime(context, input).length === 1);
  },

  /*
   * 5.6. String Manipulation.
   *
   * See: https://hl7.org/fhirpath/#string-manipulation
   */

  /**
   * Returns the 0-based index of the first position substring is found in the input string, or -1 if it is not found.
   *
   * If substring is an empty string (''), the function returns 0.
   *
   * If the input or substring is empty ({ }), the result is empty ({ }).
   *
   * If the input collection contains multiple items, the evaluation of the expression will end and signal an error to the calling environment.
   *
   * See: https://hl7.org/fhirpath/#indexofsubstring-string-integer
   * @param context - The evaluation context.
   * @param input - The input collection.
   * @param substringAtom - The substring to search for.
   * @returns The index of the substring.
   */
  indexOf: (context: AtomContext, input: TypedValue[], substringAtom: Atom): TypedValue[] => {
    return applyStringFunc((str, substring) => str.indexOf(substring as string), context, input, substringAtom);
  },

  /**
   * Returns the part of the string starting at position start (zero-based). If length is given, will return at most length number of characters from the input string.
   *
   * If start lies outside the length of the string, the function returns empty ({ }). If there are less remaining characters in the string than indicated by length, the function returns just the remaining characters.
   *
   * If the input or start is empty, the result is empty.
   *
   * If an empty length is provided, the behavior is the same as if length had not been provided.
   *
   * If the input collection contains multiple items, the evaluation of the expression will end and signal an error to the calling environment.
   * @param context - The evaluation context.
   * @param input - The input collection.
   * @param startAtom - The start index atom.
   * @param lengthAtom - Optional length atom.
   * @returns The substring.
   */
  substring: (context: AtomContext, input: TypedValue[], startAtom: Atom, lengthAtom?: Atom): TypedValue[] => {
    return applyStringFunc(
      (str, start, length) => {
        const startIndex = start as number;
        const endIndex = length ? startIndex + (length as number) : str.length;
        return startIndex < 0 || startIndex >= str.length ? undefined : str.substring(startIndex, endIndex);
      },
      context,
      input,
      startAtom,
      lengthAtom
    );
  },

  /**
   * Returns true when the input string starts with the given prefix.
   *
   * If prefix is the empty string (''), the result is true.
   *
   * If the input collection is empty, the result is empty.
   *
   * If the input collection contains multiple items, the evaluation of the expression will end and signal an error to the calling environment.
   *
   * See: https://hl7.org/fhirpath/#startswithprefix-string-boolean
   * @param context - The evaluation context.
   * @param input - The input collection.
   * @param prefixAtom - The prefix substring to test.
   * @returns True if the input string starts with the given prefix string.
   */
  startsWith: (context: AtomContext, input: TypedValue[], prefixAtom: Atom): TypedValue[] => {
    return applyStringFunc((str, prefix) => str.startsWith(prefix as string), context, input, prefixAtom);
  },

  /**
   * Returns true when the input string ends with the given suffix.
   *
   * If suffix is the empty string (''), the result is true.
   *
   * If the input collection is empty, the result is empty.
   *
   * If the input collection contains multiple items, the evaluation of the expression will end and signal an error to the calling environment.
   *
   * See: https://hl7.org/fhirpath/#endswithsuffix-string-boolean
   * @param context - The evaluation context.
   * @param input - The input collection.
   * @param suffixAtom - The suffix substring to test.
   * @returns True if the input string ends with the given suffix string.
   */
  endsWith: (context: AtomContext, input: TypedValue[], suffixAtom: Atom): TypedValue[] => {
    return applyStringFunc((str, suffix) => str.endsWith(suffix as string), context, input, suffixAtom);
  },

  /**
   * Returns true when the given substring is a substring of the input string.
   *
   * If substring is the empty string (''), the result is true.
   *
   * If the input collection is empty, the result is empty.
   *
   * If the input collection contains multiple items, the evaluation of the expression will end and signal an error to the calling environment.
   *
   * See: https://hl7.org/fhirpath/#containssubstring-string-boolean
   * @param context - The evaluation context.
   * @param input - The input collection.
   * @param substringAtom - The substring to test.
   * @returns True if the input string contains the given substring.
   */
  contains: (context: AtomContext, input: TypedValue[], substringAtom: Atom): TypedValue[] => {
    return applyStringFunc((str, substring) => str.includes(substring as string), context, input, substringAtom);
  },

  /**
   * Returns the input string with all characters converted to upper case.
   * If the input collection is empty, the result is empty.
   *
   * If the input collection contains multiple items, the evaluation of the expression will end and signal an error to the calling environment.
   *
   * See: https://hl7.org/fhirpath/#upper-string
   * @param context - The evaluation context.
   * @param input - The input collection.
   * @returns The string converted to upper case.
   */
  upper: (context: AtomContext, input: TypedValue[]): TypedValue[] => {
    return applyStringFunc((str) => str.toUpperCase(), context, input);
  },

  /**
   * Returns the input string with all characters converted to lower case.
   *
   * If the input collection is empty, the result is empty.
   *
   * If the input collection contains multiple items, the evaluation of the expression will end and signal an error to the calling environment.
   *
   * See: https://hl7.org/fhirpath/#lower-string
   * @param context - The evaluation context.
   * @param input - The input collection.
   * @returns The string converted to lower case.
   */
  lower: (context: AtomContext, input: TypedValue[]): TypedValue[] => {
    return applyStringFunc((str) => str.toLowerCase(), context, input);
  },

  /**
   * Returns the input string with all instances of pattern replaced with substitution. If the substitution is the empty string (''),
   * instances of pattern are removed from the result. If pattern is the empty string (''), every character in the input string is
   * surrounded by the substitution, e.g. 'abc'.replace('','x') becomes 'xaxbxcx'.
   *
   * If the input collection, pattern, or substitution are empty, the result is empty ({ }).
   *
   * If the input collection contains multiple items, the evaluation of the expression will end and signal an error to the calling environment.
   *
   * See: https://hl7.org/fhirpath/#replacepattern-string-substitution-string-string
   * @param context - The evaluation context.
   * @param input - The input collection.
   * @param patternAtom - The pattern to search for.
   * @param substitionAtom - The substition to replace with.
   * @returns The string with all instances of the search pattern replaced with the substitution string.
   */
  replace: (context: AtomContext, input: TypedValue[], patternAtom: Atom, substitionAtom: Atom): TypedValue[] => {
    return applyStringFunc(
      (str, pattern, substition) => str.replaceAll(pattern as string, substition as string),
      context,
      input,
      patternAtom,
      substitionAtom
    );
  },

  /**
   * Returns true when the value matches the given regular expression. Regular expressions should function consistently, regardless of any culture- and locale-specific settings in the environment, should be case-sensitive, use 'single line' mode and allow Unicode characters.
   *
   * If the input collection or regex are empty, the result is empty ({ }).
   *
   * If the input collection contains multiple items, the evaluation of the expression will end and signal an error to the calling environment.
   *
   * See: https://hl7.org/fhirpath/#matchesregex-string-boolean
   * @param context - The evaluation context.
   * @param input - The input collection.
   * @param regexAtom - The regular expression atom.
   * @returns True if the input string matches the given regular expression.
   */
  matches: (context: AtomContext, input: TypedValue[], regexAtom: Atom): TypedValue[] => {
    return applyStringFunc((str, regex) => !!new RegExp(regex as string).exec(str), context, input, regexAtom);
  },

  /**
   * Matches the input using the regular expression in regex and replaces each match with the substitution string. The substitution may refer to identified match groups in the regular expression.
   *
   * If the input collection, regex, or substitution are empty, the result is empty ({ }).
   *
   * If the input collection contains multiple items, the evaluation of the expression will end and signal an error to the calling environment.
   *
   * See: https://hl7.org/fhirpath/#replacematchesregex-string-substitution-string-string
   * @param context - The evaluation context.
   * @param input - The input collection.
   * @param regexAtom - The regular expression atom.
   * @param substitionAtom - The substition to replace with.
   * @returns The string with all instances of the search pattern replaced with the substitution string.
   */
  replaceMatches: (context: AtomContext, input: TypedValue[], regexAtom: Atom, substitionAtom: Atom): TypedValue[] => {
    return applyStringFunc(
      (str, pattern, substition) => str.replaceAll(pattern as string, substition as string),
      context,
      input,
      regexAtom,
      substitionAtom
    );
  },

  /**
   * @param context - The evaluation context.
   * @param input - The input collection.
   * @returns The index of the substring.
   */
  length: (context: AtomContext, input: TypedValue[]): TypedValue[] => {
    return applyStringFunc((str) => str.length, context, input);
  },

  /**
   * Returns the list of characters in the input string. If the input collection is empty ({ }), the result is empty.
   *
   * See: https://hl7.org/fhirpath/#tochars-collection
   * @param context - The evaluation context.
   * @param input - The input collection.
   * @returns Array of characters.
   */
  toChars: (context: AtomContext, input: TypedValue[]): TypedValue[] => {
    return applyStringFunc((str) => (str ? str.split('') : undefined), context, input);
  },

  /*
   * Additional string functions
   * See: https://build.fhir.org/ig/HL7/FHIRPath/#additional-string-functions
   * STU Note: the contents of this section are Standard for Trial Use (STU)
   */

  encode: stub,
  decode: stub,
  escape: stub,
  unescape: stub,
  trim: stub,
  split: stub,

  /**
   * The join function takes a collection of strings and joins them into a single string, optionally using the given separator.
   *
   * If the input is empty, the result is empty.
   *
   * If no separator is specified, the strings are directly concatenated.
   *
   * See: https://build.fhir.org/ig/HL7/FHIRPath/#joinseparator-string--string
   *
   * @param context - The evaluation context.
   * @param input - The input collection.
   * @param separatorAtom - Optional separator atom.
   * @returns The joined string.
   */
  join: (context: AtomContext, input: TypedValue[], separatorAtom: Atom): TypedValue[] => {
    const separator = separatorAtom?.eval(context, getRootInput(context))[0]?.value ?? '';
    if (typeof separator !== 'string') {
      throw new Error('Separator must be a string.');
    }
    return [{ type: PropertyType.string, value: input.map((i) => i.value?.toString() ?? '').join(separator) }];
  },

  /*
   * 5.7. Math
   */

  /**
   * Returns the absolute value of the input. When taking the absolute value of a quantity, the unit is unchanged.
   *
   * If the input collection is empty, the result is empty.
   *
   * If the input collection contains multiple items, the evaluation of the expression will end and signal an error to the calling environment.
   *
   * See: https://hl7.org/fhirpath/#abs-integer-decimal-quantity
   * @param context - The evaluation context.
   * @param input - The input collection.
   * @returns A collection containing the result.
   */
  abs: (context: AtomContext, input: TypedValue[]): TypedValue[] => {
    return applyMathFunc(Math.abs, context, input);
  },

  /**
   * Returns the first integer greater than or equal to the input.
   *
   * If the input collection is empty, the result is empty.
   *
   * If the input collection contains multiple items, the evaluation of the expression will end and signal an error to the calling environment.
   *
   * See: https://hl7.org/fhirpath/#ceiling-integer
   * @param context - The evaluation context.
   * @param input - The input collection.
   * @returns A collection containing the result.
   */
  ceiling: (context: AtomContext, input: TypedValue[]): TypedValue[] => {
    return applyMathFunc(Math.ceil, context, input);
  },

  /**
   * Returns e raised to the power of the input.
   *
   * If the input collection contains an Integer, it will be implicitly converted to a Decimal and the result will be a Decimal.
   *
   * If the input collection is empty, the result is empty.
   *
   * If the input collection contains multiple items, the evaluation of the expression will end and signal an error to the calling environment.
   *
   * See: https://hl7.org/fhirpath/#exp-decimal
   * @param context - The evaluation context.
   * @param input - The input collection.
   * @returns A collection containing the result.
   */
  exp: (context: AtomContext, input: TypedValue[]): TypedValue[] => {
    return applyMathFunc(Math.exp, context, input);
  },

  /**
   * Returns the first integer less than or equal to the input.
   *
   * If the input collection is empty, the result is empty.
   *
   * If the input collection contains multiple items, the evaluation of the expression will end and signal an error to the calling environment.
   *
   * See: https://hl7.org/fhirpath/#floor-integer
   * @param context - The evaluation context.
   * @param input - The input collection.
   * @returns A collection containing the result.
   */
  floor: (context: AtomContext, input: TypedValue[]): TypedValue[] => {
    return applyMathFunc(Math.floor, context, input);
  },

  /**
   * Returns the natural logarithm of the input (i.e. the logarithm base e).
   *
   * When used with an Integer, it will be implicitly converted to a Decimal.
   *
   * If the input collection is empty, the result is empty.
   *
   * If the input collection contains multiple items, the evaluation of the expression will end and signal an error to the calling environment.
   *
   * See: https://hl7.org/fhirpath/#ln-decimal
   * @param context - The evaluation context.
   * @param input - The input collection.
   * @returns A collection containing the result.
   */
  ln: (context: AtomContext, input: TypedValue[]): TypedValue[] => {
    return applyMathFunc(Math.log, context, input);
  },

  /**
   * Returns the logarithm base base of the input number.
   *
   * When used with Integers, the arguments will be implicitly converted to Decimal.
   *
   * If base is empty, the result is empty.
   *
   * If the input collection is empty, the result is empty.
   *
   * If the input collection contains multiple items, the evaluation of the expression will end and signal an error to the calling environment.
   *
   * See: https://hl7.org/fhirpath/#logbase-decimal-decimal
   * @param context - The evaluation context.
   * @param input - The input collection.
   * @param baseAtom - The logarithm base.
   * @returns A collection containing the result.
   */
  log: (context: AtomContext, input: TypedValue[], baseAtom: Atom): TypedValue[] => {
    return applyMathFunc((value, base) => Math.log(value) / Math.log(base as number), context, input, baseAtom);
  },

  /**
   * Raises a number to the exponent power. If this function is used with Integers, the result is an Integer. If the function is used with Decimals, the result is a Decimal. If the function is used with a mixture of Integer and Decimal, the Integer is implicitly converted to a Decimal and the result is a Decimal.
   *
   * If the power cannot be represented (such as the -1 raised to the 0.5), the result is empty.
   *
   * If the input is empty, or exponent is empty, the result is empty.
   *
   * If the input collection contains multiple items, the evaluation of the expression will end and signal an error to the calling environment.
   *
   * See: https://hl7.org/fhirpath/#powerexponent-integer-decimal-integer-decimal
   * @param context - The evaluation context.
   * @param input - The input collection.
   * @param expAtom - The exponent power.
   * @returns A collection containing the result.
   */
  power: (context: AtomContext, input: TypedValue[], expAtom: Atom): TypedValue[] => {
    return applyMathFunc(Math.pow as (x: number, ...args: unknown[]) => number, context, input, expAtom);
  },

  /**
   * Rounds the decimal to the nearest whole number using a traditional round (i.e. 0.5 or higher will round to 1). If specified, the precision argument determines the decimal place at which the rounding will occur. If not specified, the rounding will default to 0 decimal places.
   *
   * If specified, the number of digits of precision must be >= 0 or the evaluation will end and signal an error to the calling environment.
   *
   * If the input collection contains a single item of type Integer, it will be implicitly converted to a Decimal.
   *
   * If the input collection is empty, the result is empty.
   *
   * If the input collection contains multiple items, the evaluation of the expression will end and signal an error to the calling environment.
   *
   * See: https://hl7.org/fhirpath/#roundprecision-integer-decimal
   * @param context - The evaluation context.
   * @param input - The input collection.
   * @returns A collection containing the result.
   */
  round: (context: AtomContext, input: TypedValue[]): TypedValue[] => {
    return applyMathFunc(Math.round, context, input);
  },

  /**
   * Returns the square root of the input number as a Decimal.
   *
   * If the square root cannot be represented (such as the square root of -1), the result is empty.
   *
   * If the input collection is empty, the result is empty.
   *
   * If the input collection contains multiple items, the evaluation of the expression will end and signal an error to the calling environment.
   *
   * Note that this function is equivalent to raising a number of the power of 0.5 using the power() function.
   *
   * See: https://hl7.org/fhirpath/#sqrt-decimal
   * @param context - The evaluation context.
   * @param input - The input collection.
   * @returns A collection containing the result.
   */
  sqrt: (context: AtomContext, input: TypedValue[]): TypedValue[] => {
    return applyMathFunc(Math.sqrt, context, input);
  },

  /**
   * Returns the integer portion of the input.
   *
   * If the input collection is empty, the result is empty.
   *
   * If the input collection contains multiple items, the evaluation of the expression will end and signal an error to the calling environment.
   *
   * See: https://hl7.org/fhirpath/#truncate-integer
   * @param context - The evaluation context.
   * @param input - The input collection.
   * @returns A collection containing the result.
   */
  truncate: (context: AtomContext, input: TypedValue[]): TypedValue[] => {
    return applyMathFunc((x) => x | 0, context, input);
  },

  /*
   * 5.8. Tree navigation
   */

  children: stub,

  descendants: stub,

  /*
   * 5.9. Utility functions
   */

  /**
   * Adds a String representation of the input collection to the diagnostic log,
   * using the name argument as the name in the log. This log should be made available
   * to the user in some appropriate fashion. Does not change the input, so returns
   * the input collection as output.
   *
   * If the projection argument is used, the trace would log the result of evaluating
   * the project expression on the input, but still return the input to the trace
   * function unchanged.
   *
   * See: https://hl7.org/fhirpath/#tracename-string-projection-expression-collection
   * @param _context - The evaluation context.
   * @param input - The input collection.
   * @param _nameAtom - The log name.
   * @returns The input collection.
   */
  trace: (_context: AtomContext, input: TypedValue[], _nameAtom: Atom): TypedValue[] => {
    return input;
  },

  /**
   * Returns the current date and time, including timezone offset.
   *
   * See: https://hl7.org/fhirpath/#now-datetime
   * @returns The current dateTime.
   */
  now: (): TypedValue[] => {
    return [{ type: PropertyType.dateTime, value: new Date().toISOString() }];
  },

  /**
   * Returns the current time.
   *
   * See: https://hl7.org/fhirpath/#timeofday-time
   * @returns The current time string.
   */
  timeOfDay: (): TypedValue[] => {
    return [{ type: PropertyType.time, value: new Date().toISOString().substring(11) }];
  },

  /**
   * Returns the current date.
   *
   * See: https://hl7.org/fhirpath/#today-date
   * @returns The current date string.
   */
  today: (): TypedValue[] => {
    return [{ type: PropertyType.date, value: new Date().toISOString().substring(0, 10) }];
  },

  /**
   * Calculates the difference between two dates or date/times.
   *
   * This is not part of the official FHIRPath spec.
   *
   * IBM FHIR issue: https://github.com/IBM/FHIR/issues/1014
   * IBM FHIR PR: https://github.com/IBM/FHIR/pull/1023
   * @param context - The evaluation context.
   * @param input - The input collection.
   * @param startAtom - The start date/time.
   * @param endAtom - The end date/time.
   * @param unitsAtom - Which units to return ("years", "months", or "days").
   * @returns The Quantity of time between the two dates.
   */
  between: (
    context: AtomContext,
    input: TypedValue[],
    startAtom: Atom,
    endAtom: Atom,
    unitsAtom: Atom
  ): TypedValue[] => {
    const startDate = functions.toDateTime(context, startAtom.eval(context, input));
    if (startDate.length === 0) {
      throw new Error('Invalid start date');
    }
    const endDate = functions.toDateTime(context, endAtom.eval(context, input));
    if (endDate.length === 0) {
      throw new Error('Invalid end date');
    }
    const unit = unitsAtom.eval(context, input)[0]?.value as string;
    if (unit !== 'years' && unit !== 'months' && unit !== 'days') {
      throw new Error('Invalid units');
    }
    const age = calculateAge(startDate[0].value, endDate[0].value);
    return [{ type: PropertyType.Quantity, value: { value: age[unit], unit } }];
  },

  /*
   * 6.3 Types
   */

  /**
   * The is() function is supported for backwards compatibility with previous
   * implementations of FHIRPath. Just as with the is keyword, the type argument
   * is an identifier that must resolve to the name of a type in a model.
   *
   * For implementations with compile-time typing, this requires special-case
   * handling when processing the argument to treat it as a type specifier rather
   * than an identifier expression:
   * @param _context - The evaluation context.
   * @param input - The input collection.
   * @param typeAtom - The desired type.
   * @returns True if the input element is of the desired type.
   */
  is: (_context: AtomContext, input: TypedValue[], typeAtom: Atom): TypedValue[] => {
    let typeName = '';
    if (typeAtom instanceof SymbolAtom) {
      typeName = typeAtom.name;
    } else if (typeAtom instanceof DotAtom) {
      typeName = (typeAtom.left as SymbolAtom).name + '.' + (typeAtom.right as SymbolAtom).name;
    }
    if (!typeName) {
      return [];
    }
    return input.map((value) => ({ type: PropertyType.boolean, value: fhirPathIs(value, typeName) }));
  },

  /*
   * 6.5 Boolean logic
   */

  /**
   * 6.5.3. not() : Boolean
   *
   * Returns true if the input collection evaluates to false, and false if it evaluates to true. Otherwise, the result is empty ({ }):
   * @param context - The evaluation context.
   * @param input - The input collection.
   * @returns True if the input evaluates to false.
   */
  not: (context: AtomContext, input: TypedValue[]): TypedValue[] => {
    return functions.toBoolean(context, input).map((value) => ({ type: PropertyType.boolean, value: !value.value }));
  },

  /*
   * Additional functions
   * See: https://hl7.org/fhir/fhirpath.html#functions
   */

  /**
   * For each item in the collection, if it is a string that is a uri (or canonical or url), locate the target of the reference, and add it to the resulting collection. If the item does not resolve to a resource, the item is ignored and nothing is added to the output collection.
   * The items in the collection may also represent a Reference, in which case the Reference.reference is resolved.
   * @param _context - The evaluation context.
   * @param input - The input collection.
   * @returns The resolved resource.
   */
  resolve: (_context: AtomContext, input: TypedValue[]): TypedValue[] => {
    return input
      .map((e) => {
        const value = e.value;
        let refStr: string | undefined;
        if (typeof value === 'string') {
          refStr = value;
        } else if (typeof value === 'object') {
          const ref = value as Reference;
          if (ref.resource) {
            return toTypedValue(ref.resource);
          }
          if (ref.reference) {
            refStr = ref.reference;
          } else if (ref.type && ref.identifier) {
            refStr = `${ref.type}?identifier=${ref.identifier.system}|${ref.identifier.value}`;
          }
        }
        if (refStr?.includes('?')) {
          const [resourceType] = refStr.split('?');
          return { type: resourceType, value: { resourceType } };
        }
        if (refStr?.includes('/')) {
          const [resourceType, id] = refStr.split('/');
          return { type: resourceType, value: { resourceType, id } };
        }
        return { type: PropertyType.BackboneElement, value: undefined };
      })
      .filter((e) => !!e.value);
  },

  /**
   * The as operator can be used to treat a value as a specific type.
   * @param _context - The evaluation context.
   * @param input - The input value.
   * @returns The value as the specific type.
   */
  as: (_context: AtomContext, input: TypedValue[]): TypedValue[] => {
    return input;
  },

  /*
   * 12. Formal Specifications
   */

  /**
   * Returns the type of the input.
   *
   * 12.2. Model Information
   *
   * The model information returned by the reflection function type() is specified as an
   * XML Schema document (xsd) and included in this specification at the following link:
   * https://hl7.org/fhirpath/modelinfo.xsd
   *
   * See: https://hl7.org/fhirpath/#model-information
   * @param _context - The evaluation context.
   * @param input - The input collection.
   * @returns The type of the input value.
   */
  type: (_context: AtomContext, input: TypedValue[]): TypedValue[] => {
    return input.map(({ value }) => {
      if (typeof value === 'boolean') {
        return { type: PropertyType.BackboneElement, value: { namespace: 'System', name: 'Boolean' } };
      }
      if (typeof value === 'number') {
        return { type: PropertyType.BackboneElement, value: { namespace: 'System', name: 'Integer' } };
      }
      if (isResource(value)) {
        return {
          type: PropertyType.BackboneElement,
          value: { namespace: 'FHIR', name: value.resourceType },
        };
      }
      return { type: PropertyType.BackboneElement, value: null };
    });
  },

  conformsTo: (context: AtomContext, input: TypedValue[], systemAtom: Atom): TypedValue[] => {
    const system = systemAtom.eval(context, input)[0].value as string;
    if (!system.startsWith('http://hl7.org/fhir/StructureDefinition/')) {
      throw new Error('Expected a StructureDefinition URL');
    }
    const expectedResourceType = system.replace('http://hl7.org/fhir/StructureDefinition/', '');
    return input.map((value) => ({
      type: PropertyType.boolean,
      value: value.value?.resourceType === expectedResourceType,
    }));
  },

  /*
   * SQL-on-FHIR utilities
   */

  /**
   * Returns an opaque value to be used as the primary key for the row associated with the resource.
   *
   * In many cases the value may just be the resource id, but exceptions are described below.
   * This function is used in tandem with getReferenceKey(), which returns an equal value from references that point to this resource.
   *
   * The returned KeyType is implementation dependent, but must be a FHIR primitive type that can be used for efficient joins in the
   * system’s underlying data storage. Integers, strings, UUIDs, and other primitive types are appropriate.
   *
   * See: https://build.fhir.org/ig/FHIR/sql-on-fhir-v2/StructureDefinition-ViewDefinition.html#getresourcekey--keytype
   *
   * @param _context - The evaluation context.
   * @param input - The input collection.
   * @returns The resource key.
   */
  getResourceKey: (_context: AtomContext, input: TypedValue[]): TypedValue[] => {
    const resource = input[0].value as Resource;
    if (!resource?.id) {
      return [];
    }
    return [{ type: PropertyType.id, value: resource.id }];
  },

  /**
   * Returns an opaque value that represents the database key of the row being referenced.
   *
   * The value returned must be equal to the getResourceKey() value returned on the resource itself.
   *
   * Users may pass an optional resource type (e.g., Patient or Observation) to indicate the expected type that the reference should point to.
   * The getReferenceKey() will return an empty collection (effectively null since FHIRPath always returns collections) if the reference is not of the expected type.
   * For example, Observation.subject.getReferenceKey(Patient) would return a row key if the subject is a Patient, or the empty collection (i.e., {}) if it is not.
   *
   * The returned KeyType is implementation dependent, but must be a FHIR primitive type that can be used for efficient joins in the systems underlying data storage.
   * Integers, strings, UUIDs, and other primitive types are appropriate.
   *
   * See: https://build.fhir.org/ig/FHIR/sql-on-fhir-v2/StructureDefinition-ViewDefinition.html#getreferencekeyresource-type-specifier--keytype
   *
   * @param context - The evaluation context.
   * @param input - The input collection.
   * @param typeAtom - Optional expected resource type.
   * @returns The reference key.
   */
  getReferenceKey: (context: AtomContext, input: TypedValue[], typeAtom: Atom): TypedValue[] => {
    const reference = input[0].value as Reference;
    if (!reference?.reference) {
      return [];
    }

    let typeName = '';
    if (typeAtom instanceof SymbolAtom) {
      typeName = typeAtom.name;
    }
    if (typeName && !reference.reference.startsWith(typeName + '/')) {
      return [];
    }

    return [{ type: PropertyType.id, value: resolveId(reference) }];
  },

  extension: (context: AtomContext, input: TypedValue[], urlAtom: Atom): TypedValue[] => {
    const url = urlAtom.eval(context, input)[0].value as string;
    const resource = input?.[0]?.value;
    if (resource) {
      const extension = getExtension(resource, url);
      if (extension) {
        return [{ type: PropertyType.Extension, value: extension }];
      }
    }
    return [];
  },
};

/*
 * Helper utilities
 */

function applyStringFunc<T>(
  func: (str: string, ...args: unknown[]) => T | undefined,
  context: AtomContext,
  input: TypedValue[],
  ...argsAtoms: (Atom | undefined)[]
): TypedValue[] {
  if (input.length === 0) {
    return [];
  }
  const [{ value }] = validateInput(input, 1);
  if (typeof value !== 'string') {
    throw new Error('String function cannot be called with non-string');
  }
  const result = func(value, ...argsAtoms.map((atom) => atom?.eval(context, input)[0]?.value));
  if (result === undefined) {
    return [];
  }
  if (Array.isArray(result)) {
    return result.map(toTypedValue);
  }
  return [toTypedValue(result)];
}

function applyMathFunc(
  func: (x: number, ...args: unknown[]) => number,
  context: AtomContext,
  input: TypedValue[],
  ...argsAtoms: Atom[]
): TypedValue[] {
  if (input.length === 0) {
    return [];
  }
  const [{ value }] = validateInput(input, 1);
  const quantity = isQuantity(value);
  const numberInput = quantity ? value.value : value;
  if (typeof numberInput !== 'number') {
    throw new Error('Math function cannot be called with non-number');
  }
  const result = func(numberInput, ...argsAtoms.map((atom) => atom.eval(context, input)[0]?.value));
  const type = quantity ? PropertyType.Quantity : input[0].type;
  const returnValue = quantity ? { ...value, value: result } : result;
  return [{ type, value: returnValue }];
}

function validateInput(input: TypedValue[], count: number): TypedValue[] {
  if (input.length !== count) {
    throw new Error(`Expected ${count} arguments`);
  }
  for (const element of input) {
    if (element === null || element === undefined) {
      throw new Error('Expected non-null argument');
    }
  }
  return input;
}

function getRootInput(context: AtomContext): [TypedValue] {
  let last = context;
  while (last.parent?.variables.$this) {
    last = last.parent;
  }
  return [last.variables.$this];
}
