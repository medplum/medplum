import { Atom } from './atoms';
import { fhirPathIs, toBoolean } from './utils';

/**
 * Temporary placholder for unimplemented methods.
 */
const stub = (input: any[]) => input;

/**
 * Collection of FHIRPath functions.
 * See: https://hl7.org/fhirpath/#functions
 */
export const functions: Record<string, (...args: any[]) => any> = {

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

  subsetOf: stub,

  supersetOf: stub,

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
    return input.filter(e => toBoolean(criteria.eval(e)));
  },

  select: stub,

  repeat: stub,

  ofType: stub,

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
    return input.length === 0 ? [] : [input[0]];
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
    return input.length === 0 ? [] : [input[input.length - 1]];
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

  intersect: stub,

  exclude: stub,

  /*
   * 5.4. Combining
   *
   * See: https://hl7.org/fhirpath/#combining
   */

  union: stub,

  combine: stub,

  /*
   * 5.5. Conversion
   *
   * See: https://hl7.org/fhirpath/#conversion
   */

  iif: stub,

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
  toBoolean(input: any[]): boolean[] {
    if (input.length === 0) {
      return [];
    }
    const [value] = validateInput(input, 1);
    if (typeof value === 'boolean') {
      return [value];
    }
    if (typeof value === 'number') {
      return [!!value];
    }
    if (typeof value === 'string') {
      if (['true', 't', 'yes', 'y', '1', '1.0'].includes(value)) {
        return [true];
      }
      if (['false', 'f', 'no', 'n', '0', '0.0'].includes(value)) {
        return [false];
      }
      return [];
    }
    return [toBoolean(value)];
  },

  convertsToBoolean: stub,

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
  toInteger(input: any[]): number[] {
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
   *
   * @param input The input collection.
   * @returns
   */
  convertsToInteger(input: any[]): boolean[] {
    if (input.length === 0) {
      return [];
    }
    const [value] = validateInput(input, 1);
    return [
      value !== null &&
      value !== undefined &&
      (
        typeof value === 'number' ||
        (typeof value === 'string' && !!value.match(/^[+-]?\d+$/)) ||
        typeof value === 'boolean'
      )];
  },

  toDate: stub,

  convertsToDate: stub,

  toDateTime: stub,

  convertsToDateTime: stub,

  toDecimal: stub,

  convertsToDecimal: stub,

  toQuantity: stub,

  convertsToQuantity: stub,

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
  toString(input: any[]): string[] {
    if (input.length === 0) {
      return [];
    }
    const [value] = validateInput(input, 1);
    return [value.toString()];
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
   *
   * @param input The input collection.
   * @returns
   */
  convertsToString(input: any[]): boolean[] {
    if (input.length === 0) {
      return [];
    }
    const [value] = validateInput(input, 1);
    return [value !== null && value !== undefined];
  },

  toTime: stub,

  convertsToTime: stub,

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
  indexOf(input: any[], substringAtom: Atom): number[] {
    return applyStringFunc(
      (str, substring) => str.indexOf(substring),
      input,
      substringAtom);
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
   *
   * @param input The input collection.
   * @returns The index of the substring.
   */
  substring(input: any[], startAtom: Atom, lengthAtom: Atom): string[] {
    return applyStringFunc(
      (str, start, length) => str.substr(start, length),
      input,
      startAtom,
      lengthAtom);
  },

  /**
   *
   * @param input The input collection.
   * @returns The index of the substring.
   */
  startsWith(input: any[], prefixAtom: Atom): boolean[] {
    return applyStringFunc(
      (str, prefix) => str.startsWith(prefix),
      input,
      prefixAtom);
  },

  /**
   *
   * @param input The input collection.
   * @returns The index of the substring.
   */
  endsWith(input: any[], suffixAtom: Atom): boolean[] {
    return applyStringFunc(
      (str, suffix) => str.endsWith(suffix),
      input,
      suffixAtom);
  },

  /**
   *
   * @param input The input collection.
   * @returns The index of the substring.
   */
  contains(input: any[], substringAtom: Atom): boolean[] {
    return applyStringFunc(
      (str, substring) => str.includes(substring),
      input,
      substringAtom);
  },

  /**
   *
   * @param input The input collection.
   * @returns The index of the substring.
   */
  upper(input: any[]): string[] {
    return applyStringFunc(
      (str) => str.toUpperCase(),
      input);
  },

  /**
   *
   * @param input The input collection.
   * @returns The index of the substring.
   */
  lower(input: any[]): string[] {
    return applyStringFunc(
      (str) => str.toLowerCase(),
      input);
  },

  /**
   *
   * @param input The input collection.
   * @returns The index of the substring.
   */
  replace(input: any[], patternAtom: Atom, substitionAtom): string[] {
    return applyStringFunc(
      (str, pattern, substition) => str.replaceAll(pattern, substition),
      input,
      patternAtom,
      substitionAtom);
  },

  /**
   *
   * @param input The input collection.
   * @returns The index of the substring.
   */
  matches(input: any[], regexAtom: Atom): boolean[] {
    return applyStringFunc(
      (str, regex) => !!str.match(regex),
      input,
      regexAtom);
  },

  /**
   *
   * @param input The input collection.
   * @returns The index of the substring.
   */
  replaceMatches(input: any[], regexAtom: Atom, substitionAtom): string[] {
    return applyStringFunc(
      (str, pattern, substition) => str.replaceAll(pattern, substition),
      input,
      regexAtom,
      substitionAtom);
  },

  /**
   *
   * @param input The input collection.
   * @returns The index of the substring.
   */
  length(input: any[]): number[] {
    return applyStringFunc(
      (str) => str.length,
      input);
  },

  /**
   *
   * @param input The input collection.
   * @returns The index of the substring.
   */
  toChars(input: any[]): string[][] {
    return applyStringFunc(
      (str) => str.split(''),
      input);
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
   *
   * @param input The input collection.
   * @returns A collection containing the result.
   */
  abs(input: any[]): number[] {
    return applyMathFunc(Math.abs, input);
  },

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
  ceiling(input: any[]): number[] {
    return applyMathFunc(Math.ceil, input);
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
   *
   * @param input The input collection.
   * @returns A collection containing the result.
   */
  exp(input: any[]): number[] {
    return applyMathFunc(Math.exp, input);
  },

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
  floor(input: any[]): number[] {
    return applyMathFunc(Math.floor, input);
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
   *
   * @param input The input collection.
   * @returns A collection containing the result.
   */
  ln(input: any[]): number[] {
    return applyMathFunc(Math.log, input);
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
   *
   * @param input The input collection.
   * @returns A collection containing the result.
   */
  log(input: any[], baseAtom: Atom): number[] {
    return applyMathFunc((value, base) => Math.log(value) / Math.log(base), input, baseAtom);
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
   *
   * @param input The input collection.
   * @returns A collection containing the result.
   */
  power(input: any[], expAtom: Atom): number[] {
    return applyMathFunc(Math.pow, input, expAtom);
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
   *
   * @param input The input collection.
   * @returns A collection containing the result.
   */
  round(input: any[]): number[] {
    return applyMathFunc(Math.round, input);
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
   *
   * @param input The input collection.
   * @returns A collection containing the result.
   */
  sqrt(input: any[]): number[] {
    return applyMathFunc(Math.sqrt, input);
  },

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
  truncate(input: any[]): number[] {
    return applyMathFunc(x => x | 0, input);
  },

  /*
   * 5.8. Tree navigation
   */

  children: stub,

  descendants: stub,

  /*
   * 5.9. Utility functions
   */

  trace(input: any[], nameAtom: Atom): any[] {
    console.log('trace', input, nameAtom);
    return input;
  },

  now(): Date[] {
    return [new Date()];
  },

  timeOfDay(): Date[] {
    return [new Date()];
  },

  today(): Date[] {
    return [new Date()];
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
   *
   * @param input The input collection.
   * @returns
   */
  type(input: any[]): any[] {
    return input.map(value => {
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
  },

  is(input: any[], typeAtom: Atom): boolean[] {
    const typeName = typeAtom.toString();
    return input.map(value => fhirPathIs(value, typeName));
  },

  conformsTo(input: any[], systemAtom: Atom): boolean[] {
    const system = systemAtom.eval(undefined) as string;
    if (!system.startsWith('http://hl7.org/fhir/StructureDefinition/')) {
      throw new Error('Expected a StructureDefinition URL');
    }
    const expectedResourceType = system.replace('http://hl7.org/fhir/StructureDefinition/', '');
    return input.map(resource => resource?.resourceType === expectedResourceType);
  },

  not(input: any[]): boolean[] {
    return input.map(value => !toBoolean(value));
  },

};

function applyStringFunc<T>(func: (str: string, ...args: any[]) => T, input: any[], ...argsAtoms: Atom[]): T[] {
  if (input.length === 0) {
    return input;
  }
  const [value] = validateInput(input, 1);
  if (typeof value !== 'string') {
    throw new Error('String function cannot be called with non-string');
  }
  return [func(value, ...argsAtoms.map(atom => atom && atom.eval(undefined)))];
}

function applyMathFunc(func: (x: number, ...args: any[]) => number, input: any[], ...argsAtoms: Atom[]): number[] {
  if (input.length === 0) {
    return input;
  }
  const [value] = validateInput(input, 1);
  if (typeof value !== 'number') {
    throw new Error('Math function cannot be called with non-number');
  }
  return [func(value, ...argsAtoms.map(atom => atom.eval(undefined)))];
}

function validateInput(input: any[], count: number): any[] {
  if (input.length !== count) {
    throw new Error(`Expected ${count} arguments`);
  }
  return input;
}
