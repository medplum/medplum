import { Quantity } from '@medplum/fhirtypes';
import { Atom } from './atoms';
import { parseDateString } from './date';
import { ensureArray, fhirPathIs, isQuantity, removeDuplicates, toJsBoolean } from './utils';

/*
 * Collection of FHIRPath
 * See: https://hl7.org/fhirpath/#functions
 */

/**
 * Temporary placholder for unimplemented methods.
 */
const stub = () => [];

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
export function empty(input: any[]): boolean {
  return input.length === 0;
}

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
export function exists(input: any[], criteria?: Atom): boolean {
  if (criteria) {
    return input.filter((e) => toJsBoolean(criteria.eval(e))).length > 0;
  } else {
    return input.length > 0;
  }
}

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
export function all(input: any[], criteria: Atom): boolean {
  return input.every((e) => toJsBoolean(criteria.eval(e)));
}

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
export function allTrue(input: any[]): boolean {
  for (const value of input) {
    if (!value) {
      return false;
    }
  }
  return true;
}

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
export function anyTrue(input: any[]): boolean {
  for (const value of input) {
    if (value) {
      return true;
    }
  }
  return false;
}

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
export function allFalse(input: any[]): boolean {
  for (const value of input) {
    if (value) {
      return false;
    }
  }
  return true;
}

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
export function anyFalse(input: any[]): boolean {
  for (const value of input) {
    if (!value) {
      return true;
    }
  }
  return false;
}

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
 */
export const subsetOf = stub;

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
 */
export const supersetOf = stub;

/**
 * Returns the integer count of the number of items in the input collection.
 * Returns 0 when the input collection is empty.
 *
 * See: https://hl7.org/fhirpath/#count-integer
 *
 * @param input The input collection.
 * @returns The integer count of the number of items in the input collection.
 */
export function count(input: any[]): number {
  return input.length;
}

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
export function distinct(input: any[]): any[] {
  return Array.from(new Set(input));
}

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
export function isDistinct(input: any[]): boolean {
  return input.length === new Set(input).size;
}

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
export function where(input: any[], criteria: Atom): any[] {
  return input.filter((e) => toJsBoolean(criteria.eval(e)));
}

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
 */
export function select(input: any[], criteria: Atom): any[] {
  return criteria.eval(input);
}

/**
 * A version of select that will repeat the projection and add it to the output
 * collection, as long as the projection yields new items (as determined by
 * the = (Equals) (=) operator).
 *
 * See: http://hl7.org/fhirpath/#repeatprojection-expression-collection
 */
export const repeat = stub;

/**
 * Returns a collection that contains all items in the input collection that
 * are of the given type or a subclass thereof. If the input collection is
 * empty ({ }), the result is empty. The type argument is an identifier that
 * must resolve to the name of a type in a model
 *
 * See: http://hl7.org/fhirpath/#oftypetype-type-specifier-collection
 */
export const ofType = stub;

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
export function single(input: any[]): any[] {
  if (input.length > 1) {
    throw new Error('Expected input length one for single()');
  }
  return input.length === 0 ? [] : input.slice(0, 1);
}

/**
 * Returns a collection containing only the first item in the input collection.
 * This function is equivalent to item[0], so it will return an empty collection if the input collection has no items.
 *
 * See: https://hl7.org/fhirpath/#first-collection
 *
 * @param input The input collection.
 * @returns A collection containing only the first item in the input collection.
 */
export function first(input: any[]): any[] {
  return input.length === 0 ? [] : [input[0]];
}

/**
 * Returns a collection containing only the last item in the input collection.
 * Will return an empty collection if the input collection has no items.
 *
 * See: https://hl7.org/fhirpath/#last-collection
 *
 * @param input The input collection.
 * @returns A collection containing only the last item in the input collection.
 */
export function last(input: any[]): any[] {
  return input.length === 0 ? [] : [input[input.length - 1]];
}

/**
 * Returns a collection containing all but the first item in the input collection.
 * Will return an empty collection if the input collection has no items, or only one item.
 *
 * See: https://hl7.org/fhirpath/#tail-collection
 *
 * @param input The input collection.
 * @returns A collection containing all but the first item in the input collection.
 */
export function tail(input: any[]): any[] {
  return input.length === 0 ? [] : input.slice(1, input.length);
}

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
export function skip(input: any[], num: Atom): any[] {
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
}

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
export function take(input: any[], num: Atom): any[] {
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
}

/**
 * Returns the set of elements that are in both collections.
 * Duplicate items will be eliminated by this function.
 * Order of items is not guaranteed to be preserved in the result of this function.
 *
 * See: http://hl7.org/fhirpath/#intersectother-collection-collection
 */
export function intersect(input: any[], other: Atom): any[] {
  if (!other) {
    return input;
  }
  const otherArray = ensureArray(other.eval(0));
  return removeDuplicates(input.filter((e) => otherArray.includes(e)));
}

/**
 * Returns the set of elements that are not in the other collection.
 * Duplicate items will not be eliminated by this function, and order will be preserved.
 *
 * e.g. (1 | 2 | 3).exclude(2) returns (1 | 3).
 *
 * See: http://hl7.org/fhirpath/#excludeother-collection-collection
 */
export function exclude(input: any[], other: Atom): any[] {
  if (!other) {
    return input;
  }
  const otherArray = ensureArray(other.eval(0));
  return input.filter((e) => !otherArray.includes(e));
}

/*
 * 5.4. Combining
 *
 * See: https://hl7.org/fhirpath/#combining
 */

/**
 * Merge the two collections into a single collection,
 * eliminating any duplicate values (using = (Equals) (=) to determine equality).
 * There is no expectation of order in the resulting collection.
 *
 * In other words, this function returns the distinct list of elements from both inputs.
 *
 * See: http://hl7.org/fhirpath/#unionother-collection
 */
export function union(input: any[], other: Atom): any[] {
  if (!other) {
    return input;
  }
  return removeDuplicates([input, other.eval(0)].flat());
}

/**
 * Merge the input and other collections into a single collection
 * without eliminating duplicate values. Combining an empty collection
 * with a non-empty collection will return the non-empty collection.
 *
 * There is no expectation of order in the resulting collection.
 *
 * See: http://hl7.org/fhirpath/#combineother-collection-collection
 */
export function combine(input: any[], other: Atom): any[] {
  if (!other) {
    return input;
  }
  return [input, other.eval(0)].flat();
}

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
 *
 * @param input
 * @param criterion
 * @param trueResult
 * @param otherwiseResult
 * @returns
 */
export function iif(input: any[], criterion: Atom, trueResult: Atom, otherwiseResult?: Atom): any[] {
  const evalResult = criterion.eval(input);
  if (evalResult.length > 1 || (evalResult.length === 1 && typeof evalResult[0] !== 'boolean')) {
    throw new Error('Expected criterion to evaluate to a Boolean');
  }

  if (toJsBoolean(evalResult)) {
    return trueResult.eval(input);
  }

  if (otherwiseResult) {
    return otherwiseResult.eval(input);
  }

  return [];
}

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
 *
 * @param input
 * @returns
 */
export function toBoolean(input: any[]): boolean[] {
  if (input.length === 0) {
    return [];
  }
  const [value] = validateInput(input, 1);
  if (typeof value === 'boolean') {
    return [value];
  }
  if (typeof value === 'number') {
    if (value === 0 || value === 1) {
      return [!!value];
    }
  }
  if (typeof value === 'string') {
    const lowerStr = value.toLowerCase();
    if (['true', 't', 'yes', 'y', '1', '1.0'].includes(lowerStr)) {
      return [true];
    }
    if (['false', 'f', 'no', 'n', '0', '0.0'].includes(lowerStr)) {
      return [false];
    }
  }
  return [];
}

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
 *
 * @param input
 * @returns
 */
export function convertsToBoolean(input: any[]): boolean[] {
  if (input.length === 0) {
    return [];
  }
  return [toBoolean(input).length === 1];
}

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
 *
 * @param input The input collection.
 * @returns The string representation of the input.
 */
export function toInteger(input: any[]): number[] {
  if (input.length === 0) {
    return [];
  }
  const [value] = validateInput(input, 1);
  if (typeof value === 'number') {
    return [value];
  }
  if (typeof value === 'string' && value.match(/^[+-]?\d+$/)) {
    return [parseInt(input[0], 10)];
  }
  if (typeof value === 'boolean') {
    return [value ? 1 : 0];
  }
  return [];
}

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
 *
 * @param input The input collection.
 * @returns
 */
export function convertsToInteger(input: any[]): boolean[] {
  if (input.length === 0) {
    return [];
  }
  return [toInteger(input).length === 1];
}

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
 */
export function toDate(input: any[]): string[] {
  if (input.length === 0) {
    return [];
  }
  const [value] = validateInput(input, 1);
  if (typeof value === 'string' && value.match(/^\d{4}(-\d{2}(-\d{2})?)?/)) {
    return [parseDateString(value)];
  }
  return [];
}

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
 */
export function convertsToDate(input: any[]): boolean[] {
  if (input.length === 0) {
    return [];
  }
  return [toDate(input).length === 1];
}

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

 * See: https://hl7.org/fhirpath/#todatetime-datetime
 *
 * @param input
 * @returns
 */
export function toDateTime(input: any[]): string[] {
  if (input.length === 0) {
    return [];
  }
  const [value] = validateInput(input, 1);
  if (typeof value === 'string' && value.match(/^\d{4}(-\d{2}(-\d{2})?)?/)) {
    return [parseDateString(value)];
  }
  return [];
}

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
 *
 * @param input
 * @returns
 */
export function convertsToDateTime(input: any[]): boolean[] {
  if (input.length === 0) {
    return [];
  }
  return [toDateTime(input).length === 1];
}

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
 *
 * @param input The input collection.
 * @returns
 */
export function toDecimal(input: any[]): number[] {
  if (input.length === 0) {
    return [];
  }
  const [value] = validateInput(input, 1);
  if (typeof value === 'number') {
    return [value];
  }
  if (typeof value === 'string' && value.match(/^-?\d{1,9}(\.\d{1,9})?$/)) {
    return [parseFloat(input[0])];
  }
  if (typeof value === 'boolean') {
    return [value ? 1 : 0];
  }
  return [];
}

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

 * See: https://hl7.org/fhirpath/#convertstodecimal-boolean
 *
 * @param input The input collection.
 * @returns
 */
export function convertsToDecimal(input: any[]): boolean[] {
  if (input.length === 0) {
    return [];
  }
  return [toDecimal(input).length === 1];
}

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
 *
 * @param input The input collection.
 * @returns
 */
export function toQuantity(input: any[]): Quantity[] {
  if (input.length === 0) {
    return [];
  }
  const [value] = validateInput(input, 1);
  if (isQuantity(value)) {
    return [value];
  }
  if (typeof value === 'number') {
    return [{ value, unit: '1' }];
  }
  if (typeof value === 'string' && value.match(/^-?\d{1,9}(\.\d{1,9})?/)) {
    return [{ value: parseFloat(input[0]), unit: '1' }];
  }
  if (typeof value === 'boolean') {
    return [{ value: value ? 1 : 0, unit: '1' }];
  }
  return [];
}

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
 *
 * @param input The input collection.
 * @returns
 */
export function convertsToQuantity(input: any[]): boolean[] {
  if (input.length === 0) {
    return [];
  }
  return [toQuantity(input).length === 1];
}

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
 *
 * @param input The input collection.
 * @returns The string representation of the input.
 */
export function toString(input: any[]): string[] {
  if (input.length === 0) {
    return [];
  }
  const [value] = validateInput(input, 1);
  if (isQuantity(value)) {
    return [`${value.value} '${value.unit}'`];
  }
  return [value.toString()];
}

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
 *
 * @param input The input collection.
 * @returns
 */
export function convertsToString(input: any[]): boolean[] {
  if (input.length === 0) {
    return [];
  }
  return [toString(input).length === 1];
}

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
 *
 * @param input
 * @returns
 */
export function toTime(input: any[]): string[] {
  if (input.length === 0) {
    return [];
  }
  const [value] = validateInput(input, 1);
  if (typeof value === 'string' && value.match(/^\d{2}(:\d{2}(:\d{2})?)?/)) {
    return [parseDateString('T' + value)];
  }
  return [];
}

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
 *
 * @param input
 * @returns
 */
export function convertsToTime(input: any[]): boolean[] {
  if (input.length === 0) {
    return [];
  }
  return [toTime(input).length === 1];
}

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
 *
 * @param input The input collection.
 * @returns The index of the substring.
 */
export function indexOf(input: any[], substringAtom: Atom): number[] {
  return applyStringFunc((str, substring) => str.indexOf(substring), input, substringAtom);
}

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
 *
 * @param input The input collection.
 * @returns The index of the substring.
 */
export function substring(input: any[], startAtom: Atom, lengthAtom?: Atom): string[] {
  return applyStringFunc(
    (str, start, length) => (start < 0 || start >= str.length ? undefined : str.substr(start, length)),
    input,
    startAtom,
    lengthAtom
  );
}

/**
 *
 * @param input The input collection.
 * @returns The index of the substring.
 */
export function startsWith(input: any[], prefixAtom: Atom): boolean[] {
  return applyStringFunc((str, prefix) => str.startsWith(prefix), input, prefixAtom);
}

/**
 *
 * @param input The input collection.
 * @returns The index of the substring.
 */
export function endsWith(input: any[], suffixAtom: Atom): boolean[] {
  return applyStringFunc((str, suffix) => str.endsWith(suffix), input, suffixAtom);
}

/**
 *
 * @param input The input collection.
 * @returns The index of the substring.
 */
export function contains(input: any[], substringAtom: Atom): boolean[] {
  return applyStringFunc((str, substring) => str.includes(substring), input, substringAtom);
}

/**
 *
 * @param input The input collection.
 * @returns The index of the substring.
 */
export function upper(input: any[]): string[] {
  return applyStringFunc((str) => str.toUpperCase(), input);
}

/**
 *
 * @param input The input collection.
 * @returns The index of the substring.
 */
export function lower(input: any[]): string[] {
  return applyStringFunc((str) => str.toLowerCase(), input);
}

/**
 *
 * @param input The input collection.
 * @returns The index of the substring.
 */
export function replace(input: any[], patternAtom: Atom, substitionAtom: Atom): string[] {
  return applyStringFunc(
    (str, pattern, substition) => str.replaceAll(pattern, substition),
    input,
    patternAtom,
    substitionAtom
  );
}

/**
 *
 * @param input The input collection.
 * @returns The index of the substring.
 */
export function matches(input: any[], regexAtom: Atom): boolean[] {
  return applyStringFunc((str, regex) => !!str.match(regex), input, regexAtom);
}

/**
 *
 * @param input The input collection.
 * @returns The index of the substring.
 */
export function replaceMatches(input: any[], regexAtom: Atom, substitionAtom: Atom): string[] {
  return applyStringFunc(
    (str, pattern, substition) => str.replaceAll(pattern, substition),
    input,
    regexAtom,
    substitionAtom
  );
}

/**
 *
 * @param input The input collection.
 * @returns The index of the substring.
 */
export function length(input: any[]): number[] {
  return applyStringFunc((str) => str.length, input);
}

/**
 * Returns the list of characters in the input string. If the input collection is empty ({ }), the result is empty.
 *
 * See: https://hl7.org/fhirpath/#tochars-collection
 *
 * @param input The input collection.
 */
export function toChars(input: any[]): string[][] {
  return applyStringFunc((str) => (str ? str.split('') : undefined), input);
}

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
 *
 * @param input The input collection.
 * @returns A collection containing the result.
 */
export function abs(input: any[]): number[] {
  return applyMathFunc(Math.abs, input);
}

/**
 * Returns the first integer greater than or equal to the input.
 *
 * If the input collection is empty, the result is empty.
 *
 * If the input collection contains multiple items, the evaluation of the expression will end and signal an error to the calling environment.
 *
 * See: https://hl7.org/fhirpath/#ceiling-integer
 *
 * @param input The input collection.
 * @returns A collection containing the result.
 */
export function ceiling(input: any[]): number[] {
  return applyMathFunc(Math.ceil, input);
}

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
 *
 * @param input The input collection.
 * @returns A collection containing the result.
 */
export function exp(input: any[]): number[] {
  return applyMathFunc(Math.exp, input);
}

/**
 * Returns the first integer less than or equal to the input.
 *
 * If the input collection is empty, the result is empty.
 *
 * If the input collection contains multiple items, the evaluation of the expression will end and signal an error to the calling environment.
 *
 * See: https://hl7.org/fhirpath/#floor-integer
 *
 * @param input The input collection.
 * @returns A collection containing the result.
 */
export function floor(input: any[]): number[] {
  return applyMathFunc(Math.floor, input);
}

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
 *
 * @param input The input collection.
 * @returns A collection containing the result.
 */
export function ln(input: any[]): number[] {
  return applyMathFunc(Math.log, input);
}

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
 *
 * @param input The input collection.
 * @returns A collection containing the result.
 */
export function log(input: any[], baseAtom: Atom): number[] {
  return applyMathFunc((value, base) => Math.log(value) / Math.log(base), input, baseAtom);
}

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
 *
 * @param input The input collection.
 * @returns A collection containing the result.
 */
export function power(input: any[], expAtom: Atom): number[] {
  return applyMathFunc(Math.pow, input, expAtom);
}

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
 *
 * @param input The input collection.
 * @returns A collection containing the result.
 */
export function round(input: any[]): number[] {
  return applyMathFunc(Math.round, input);
}

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
 *
 * @param input The input collection.
 * @returns A collection containing the result.
 */
export function sqrt(input: any[]): number[] {
  return applyMathFunc(Math.sqrt, input);
}

/**
 * Returns the integer portion of the input.
 *
 * If the input collection is empty, the result is empty.
 *
 * If the input collection contains multiple items, the evaluation of the expression will end and signal an error to the calling environment.
 *
 * See: https://hl7.org/fhirpath/#truncate-integer
 *
 * @param input The input collection.
 * @returns A collection containing the result.
 */
export function truncate(input: any[]): number[] {
  return applyMathFunc((x) => x | 0, input);
}

/*
 * 5.8. Tree navigation
 */

export const children = stub;

export const descendants = stub;

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
 *
 * @param input The input collection.
 * @param nameAtom The log name.
 */
export function trace(input: any[], nameAtom: Atom): any[] {
  console.log('trace', input, nameAtom);
  return input;
}

/**
 * Returns the current date and time, including timezone offset.
 *
 * See: https://hl7.org/fhirpath/#now-datetime
 */
export function now(): string[] {
  return [new Date().toISOString()];
}

/**
 * Returns the current time.
 *
 * See: https://hl7.org/fhirpath/#timeofday-time
 */
export function timeOfDay(): string[] {
  return [new Date().toISOString().substring(11)];
}

/**
 * Returns the current date.
 *
 * See: https://hl7.org/fhirpath/#today-date
 */
export function today(): string[] {
  return [new Date().toISOString().substring(0, 10)];
}

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
 *
 * @param input
 * @param typeAtom
 * @returns
 */
export function is(input: any[], typeAtom: Atom): boolean[] {
  const typeName = typeAtom.toString();
  return input.map((value) => fhirPathIs(value, typeName));
}

/*
 * 6.5 Boolean logic
 */

/**
 * 6.5.3. not() : Boolean
 *
 * Returns true if the input collection evaluates to false, and false if it evaluates to true. Otherwise, the result is empty ({ }):
 *
 * @param input
 * @returns
 */
export function not(input: any[]): boolean[] {
  return toBoolean(input).map((value) => !value);
}

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
export function resolve(input: any[]): any[] {
  return input
    .map((e) => {
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
    })
    .filter((e) => !!e);
}

/**
 * The as operator can be used to treat a value as a specific type.
 * @param context The context value.
 * @returns The value as the specific type.
 */
export function as(context: any): any {
  return context;
}

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
 *
 * @param input The input collection.
 * @returns
 */
export function type(input: any[]): any[] {
  return input.map((value) => {
    if (typeof value === 'boolean') {
      return { namespace: 'System', name: 'Boolean' };
    }
    if (typeof value === 'number') {
      return { namespace: 'System', name: 'Integer' };
    }
    if (typeof value === 'object' && 'resourceType' in value) {
      return { namespace: 'FHIR', name: value.resourceType };
    }
    return null;
  });
}

export function conformsTo(input: any[], systemAtom: Atom): boolean[] {
  const system = systemAtom.eval(undefined) as string;
  if (!system.startsWith('http://hl7.org/fhir/StructureDefinition/')) {
    throw new Error('Expected a StructureDefinition URL');
  }
  const expectedResourceType = system.replace('http://hl7.org/fhir/StructureDefinition/', '');
  return input.map((resource) => resource?.resourceType === expectedResourceType);
}

/*
 * Helper utilities
 */

function applyStringFunc<T>(
  func: (str: string, ...args: any[]) => T | undefined,
  input: any[],
  ...argsAtoms: (Atom | undefined)[]
): T[] {
  if (input.length === 0) {
    return input;
  }
  const [value] = validateInput(input, 1);
  if (typeof value !== 'string') {
    throw new Error('String function cannot be called with non-string');
  }
  const result = func(value, ...argsAtoms.map((atom) => atom && atom.eval(value)));
  return result === undefined ? [] : [result];
}

function applyMathFunc(func: (x: number, ...args: any[]) => number, input: any[], ...argsAtoms: Atom[]): number[] {
  if (input.length === 0) {
    return input;
  }
  const [value] = validateInput(input, 1);
  const quantity = isQuantity(value);
  const numberInput = quantity ? value.value : value;
  if (typeof numberInput !== 'number') {
    throw new Error('Math function cannot be called with non-number');
  }
  const result = func(numberInput, ...argsAtoms.map((atom) => atom.eval(undefined)));
  return quantity ? [{ ...value, value: result }] : [result];
}

function validateInput(input: any[], count: number): any[] {
  if (input.length !== count) {
    throw new Error(`Expected ${count} arguments`);
  }
  return input;
}
