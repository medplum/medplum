import {
  Attachment,
  CodeableConcept,
  Device,
  Extension,
  ObservationDefinition,
  ObservationDefinitionQualifiedInterval,
  Patient,
  Practitioner,
  QuestionnaireResponse,
  QuestionnaireResponseItem,
  QuestionnaireResponseItemAnswer,
  Range,
  Reference,
  RelatedPerson,
  Resource,
  ResourceType,
} from '@medplum/fhirtypes';
import { formatHumanName } from './format';

/**
 * @internal
 */
export type ProfileResource = Patient | Practitioner | RelatedPerson;

interface Code {
  code?: CodeableConcept;
}
/**
 * @internal
 */
export type ResourceWithCode = Resource & Code;

/**
 * Creates a reference resource.
 * @param resource The FHIR reesource.
 * @returns A reference resource.
 */
export function createReference<T extends Resource>(resource: T): Reference<T> {
  const reference = getReferenceString(resource);
  const display = getDisplayString(resource);
  return display === reference ? { reference } : { reference, display };
}

/**
 * Returns a reference string for a resource.
 * @param resource The FHIR resource.
 * @returns A reference string of the form resourceType/id.
 */
export function getReferenceString(resource: Resource): string {
  return resource.resourceType + '/' + resource.id;
}

/**
 * Returns the ID portion of a reference.
 * @param reference A FHIR reference.
 * @returns The ID portion of a reference.
 */
export function resolveId(reference: Reference | undefined): string | undefined {
  return reference?.reference?.split('/')[1];
}

/**
 * Parses a reference and returns a tuple of [ResourceType, ID].
 * @param reference A reference to a FHIR resource.
 * @returns A tuple containing the `ResourceType` and the ID of the resource or `undefined` when `undefined` or an invalid reference is passed.
 */
export function parseReference(reference: Reference): [ResourceType, string] | undefined;
export function parseReference(reference: undefined): undefined;
export function parseReference(reference: Reference | undefined): [ResourceType, string] | undefined {
  if (reference?.reference === undefined) {
    return undefined;
  }
  const [type, id] = reference.reference.split('/');
  if (type === '' || id === '' || id === undefined) {
    return undefined;
  }
  return [type as ResourceType, id];
}

/**
 * Returns true if the resource is a "ProfileResource".
 * @param resource The FHIR resource.
 * @returns True if the resource is a "ProfileResource".
 */
export function isProfileResource(resource: Resource): resource is ProfileResource {
  return (
    resource.resourceType === 'Patient' ||
    resource.resourceType === 'Practitioner' ||
    resource.resourceType === 'RelatedPerson'
  );
}

/**
 * Returns a display string for the resource.
 * @param resource The input resource.
 * @returns Human friendly display string.
 */
export function getDisplayString(resource: Resource): string {
  if (isProfileResource(resource)) {
    const profileName = getProfileResourceDisplayString(resource);
    if (profileName) {
      return profileName;
    }
  }
  if (resource.resourceType === 'Device') {
    const deviceName = getDeviceDisplayString(resource);
    if (deviceName) {
      return deviceName;
    }
  }
  if (resource.resourceType === 'Observation') {
    if ('code' in resource && resource.code?.text) {
      return resource.code.text;
    }
  }
  if (resource.resourceType === 'User') {
    if (resource.email) {
      return resource.email;
    }
  }
  if ('name' in resource && resource.name && typeof resource.name === 'string') {
    return resource.name;
  }
  return getReferenceString(resource);
}

/**
 * Returns a display string for a profile resource if one is found.
 * @param resource The profile resource.
 * @returns The display name if one is found.
 */
function getProfileResourceDisplayString(resource: ProfileResource): string | undefined {
  const names = resource.name;
  if (names && names.length > 0) {
    return formatHumanName(names[0]);
  }
  return undefined;
}

/**
 * Returns a display string for a device resource if one is found.
 * @param device The device resource.
 * @returns The display name if one is found.
 */
function getDeviceDisplayString(device: Device): string | undefined {
  const names = device.deviceName;
  if (names && names.length > 0) {
    return names[0].name;
  }
  return undefined;
}

/**
 * Returns an image URL for the resource, if one is available.
 * @param resource The input resource.
 * @returns The image URL for the resource or undefined.
 */
export function getImageSrc(resource: Resource): string | undefined {
  if (!('photo' in resource)) {
    return undefined;
  }

  const photo = resource.photo;
  if (!photo) {
    return undefined;
  }

  if (Array.isArray(photo)) {
    for (const p of photo) {
      const url = getPhotoImageSrc(p);
      if (url) {
        return url;
      }
    }
  } else {
    return getPhotoImageSrc(photo);
  }

  return undefined;
}

function getPhotoImageSrc(photo: Attachment): string | undefined {
  if (photo.url && photo.contentType && photo.contentType.startsWith('image/')) {
    return photo.url;
  }
  return undefined;
}

/**
 * Returns a Date property as a Date.
 * When working with JSON objects, Dates are often serialized as ISO-8601 strings.
 * When that happens, we need to safely convert to a proper Date object.
 * @param date The date property value, which could be a string or a Date object.
 * @returns A Date object.
 */
export function getDateProperty(date: string | undefined): Date | undefined {
  return date ? new Date(date) : undefined;
}

/**
 * Calculates the age in years from the birth date.
 * @param birthDateStr The birth date or start date in ISO-8601 format YYYY-MM-DD.
 * @param endDateStr Optional end date in ISO-8601 format YYYY-MM-DD. Default value is today.
 * @returns The age in years, months, and days.
 */
export function calculateAge(
  birthDateStr: string,
  endDateStr?: string
): { years: number; months: number; days: number } {
  const startDate = new Date(birthDateStr);
  startDate.setUTCHours(0, 0, 0, 0);

  const endDate = endDateStr ? new Date(endDateStr) : new Date();
  endDate.setUTCHours(0, 0, 0, 0);

  const startYear = startDate.getUTCFullYear();
  const startMonth = startDate.getUTCMonth();
  const startDay = startDate.getUTCDate();

  const endYear = endDate.getUTCFullYear();
  const endMonth = endDate.getUTCMonth();
  const endDay = endDate.getUTCDate();

  let years = endYear - startYear;
  if (endMonth < startMonth || (endMonth === startMonth && endDay < startDay)) {
    years--;
  }

  let months = endYear * 12 + endMonth - (startYear * 12 + startMonth);
  if (endDay < startDay) {
    months--;
  }

  const days = Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

  return { years, months, days };
}

/**
 * Calculates the age string for display using the age appropriate units.
 * If the age is greater than or equal to 2 years, then the age is displayed in years.
 * If the age is greater than or equal to 1 month, then the age is displayed in months.
 * Otherwise, the age is displayed in days.
 * @param birthDateStr The birth date or start date in ISO-8601 format YYYY-MM-DD.
 * @param endDateStr Optional end date in ISO-8601 format YYYY-MM-DD. Default value is today.
 * @returns The age string.
 */
export function calculateAgeString(birthDateStr: string, endDateStr?: string): string | undefined {
  const { years, months, days } = calculateAge(birthDateStr, endDateStr);
  if (years >= 2) {
    return years.toString().padStart(3, '0') + 'Y';
  } else if (months >= 1) {
    return months.toString().padStart(3, '0') + 'M';
  } else {
    return days.toString().padStart(3, '0') + 'D';
  }
}

/**
 * Returns all questionnaire answers as a map by link ID.
 * @param response The questionnaire response resource.
 * @returns Questionnaire answers mapped by link ID.
 */
export function getQuestionnaireAnswers(
  response: QuestionnaireResponse
): Record<string, QuestionnaireResponseItemAnswer> {
  const result: Record<string, QuestionnaireResponseItemAnswer> = {};
  buildQuestionnaireAnswerItems(response.item, result);
  return result;
}

function buildQuestionnaireAnswerItems(
  items: QuestionnaireResponseItem[] | undefined,
  result: Record<string, QuestionnaireResponseItemAnswer>
): void {
  if (items) {
    for (const item of items) {
      if (item.linkId && item.answer && item.answer.length > 0) {
        result[item.linkId] = item.answer[0];
      }
      buildQuestionnaireAnswerItems(item.item, result);
    }
  }
}

/**
 * Returns an array of  questionnaire answers as a map by link ID.
 * @param response The questionnaire response resource.
 * @returns Questionnaire answer arrays mapped by link ID.
 */
export function getAllQuestionnaireAnswers(
  response: QuestionnaireResponse
): Record<string, QuestionnaireResponseItemAnswer[]> {
  const result: Record<string, QuestionnaireResponseItemAnswer[]> = {};
  buildAllQuestionnaireAnswerItems(response.item, result);
  return result;
}

/**
 * Recursively builds the questionnaire answer items map.
 * @param items The current questionnaire response items.
 * @param result The cumulative result map of answers.
 */
function buildAllQuestionnaireAnswerItems(
  items: QuestionnaireResponseItem[] | undefined,
  result: Record<string, QuestionnaireResponseItemAnswer[]>
): void {
  if (items) {
    for (const item of items) {
      if (item.linkId && item.answer && item.answer.length > 0) {
        result[item.linkId] = item.answer;
      }
      buildAllQuestionnaireAnswerItems(item.item, result);
    }
  }
}

/**
 * Returns the resource identifier for the given system.
 *
 * If multiple identifiers exist with the same system, the first one is returned.
 *
 * If the system is not found, then returns undefined.
 * @param resource The resource to check.
 * @param system The identifier system.
 * @returns The identifier value if found; otherwise undefined.
 */
export function getIdentifier(resource: Resource, system: string): string | undefined {
  const identifiers = (resource as any).identifier;
  if (!identifiers) {
    return undefined;
  }
  const array = Array.isArray(identifiers) ? identifiers : [identifiers];
  for (const identifier of array) {
    if (identifier.system === system) {
      return identifier.value;
    }
  }
  return undefined;
}

/**
 * Returns an extension value by extension URLs.
 * @param resource The base resource.
 * @param urls Array of extension URLs.  Each entry represents a nested extension.
 * @returns The extension value if found; undefined otherwise.
 */
export function getExtensionValue(resource: any, ...urls: string[]): string | undefined {
  // Let curr be the current resource or extension. Extensions can be nested.
  let curr: any = resource;

  // For each of the urls, try to find a matching nested extension.
  for (let i = 0; i < urls.length && curr; i++) {
    curr = (curr?.extension as Extension[] | undefined)?.find((e) => e.url === urls[i]);
  }

  return curr?.valueString as string | undefined;
}

/**
 * Returns an extension by extension URLs.
 * @param resource The base resource.
 * @param urls Array of extension URLs. Each entry represents a nested extension.
 * @returns The extension object if found; undefined otherwise.
 */
export function getExtension(resource: any, ...urls: string[]): Extension | undefined {
  // Let curr be the current resource or extension. Extensions can be nested.
  let curr: any = resource;

  // For each of the urls, try to find a matching nested extension.
  for (let i = 0; i < urls.length && curr; i++) {
    curr = (curr?.extension as Extension[] | undefined)?.find((e) => e.url === urls[i]);
  }

  return curr;
}

/**
 * FHIR JSON stringify.
 * Removes properties with empty string values.
 * Removes objects with zero properties.
 * See: https://www.hl7.org/fhir/json.html
 * @param value The input value.
 * @param pretty Optional flag to pretty-print the JSON.
 * @returns The resulting JSON string.
 */
export function stringify(value: any, pretty?: boolean): string {
  return JSON.stringify(value, stringifyReplacer, pretty ? 2 : undefined);
}

/**
 * Evaluates JSON key/value pairs for FHIR JSON stringify.
 * Removes properties with empty string values.
 * Removes objects with zero properties.
 * @param k Property key.
 * @param v Property value.
 * @returns The replaced value.
 */
function stringifyReplacer(k: string, v: any): any {
  return !isArrayKey(k) && isEmpty(v) ? undefined : v;
}

/**
 * Returns true if the key is an array key.
 * @param k The property key.
 * @returns True if the key is an array key.
 */
function isArrayKey(k: string): boolean {
  return !!/\d+$/.exec(k);
}

/**
 * Returns true if the value is empty (null, undefined, empty string, or empty object).
 * @param v Any value.
 * @returns True if the value is an empty string or an empty object.
 */
export function isEmpty(v: any): boolean {
  if (v === null || v === undefined) {
    return true;
  }
  const t = typeof v;
  return (t === 'string' && v === '') || (t === 'object' && Object.keys(v).length === 0);
}

/**
 * Resource equality.
 * Ignores meta.versionId and meta.lastUpdated.
 * @param object1 The first object.
 * @param object2 The second object.
 * @param path Optional path string.
 * @returns True if the objects are equal.
 */
export function deepEquals(object1: unknown, object2: unknown, path?: string): boolean {
  if (object1 === object2) {
    return true;
  }
  if (isEmpty(object1) && isEmpty(object2)) {
    return true;
  }
  if (isEmpty(object1) || isEmpty(object2)) {
    return false;
  }
  if (Array.isArray(object1) && Array.isArray(object2)) {
    return deepEqualsArray(object1, object2);
  }
  if (Array.isArray(object1) || Array.isArray(object2)) {
    return false;
  }
  if (isObject(object1) && isObject(object2)) {
    return deepEqualsObject(object1, object2, path);
  }
  if (isObject(object1) || isObject(object2)) {
    return false;
  }
  return false;
}

function deepEqualsArray(array1: unknown[], array2: unknown[]): boolean {
  if (array1.length !== array2.length) {
    return false;
  }
  for (let i = 0; i < array1.length; i++) {
    if (!deepEquals(array1[i], array2[i])) {
      return false;
    }
  }
  return true;
}

function deepEqualsObject(
  object1: Record<string, unknown>,
  object2: Record<string, unknown>,
  path: string | undefined
): boolean {
  const keySet = new Set<string>();
  Object.keys(object1).forEach((k) => keySet.add(k));
  Object.keys(object2).forEach((k) => keySet.add(k));
  if (path === 'meta') {
    keySet.delete('versionId');
    keySet.delete('lastUpdated');
    keySet.delete('author');
  }
  for (const key of keySet) {
    const val1 = object1[key];
    const val2 = object2[key];
    if (!deepEquals(val1, val2, key)) {
      return false;
    }
  }
  return true;
}

/**
 * Checks if object2 includes all fields and values of object1.
 * It doesn't matter if object2 has extra fields.
 * @param value The object to test if contained in pattern.
 * @param pattern The object to test against.
 * @returns True if pattern includes all fields and values of value.
 */
export function deepIncludes(value: any, pattern: any): boolean {
  if (isEmpty(value)) {
    return true;
  }
  if (isEmpty(pattern)) {
    return false;
  }
  if (Array.isArray(value) && Array.isArray(pattern)) {
    return deepIncludesArray(value, pattern);
  }
  if (Array.isArray(value) || Array.isArray(pattern)) {
    return false;
  }
  if (isObject(value) && isObject(pattern)) {
    return deepIncludesObject(value, pattern);
  } else if (isObject(value) || isObject(pattern)) {
    return false;
  }
  return value === pattern;
}

function deepIncludesArray(array1: any[], array2: any[]): boolean {
  return array1.every((value1) => array2.some((value2) => deepIncludes(value1, value2)));
}

function deepIncludesObject(object1: { [key: string]: unknown }, object2: { [key: string]: unknown }): boolean {
  return Object.entries(object1).every(([key, value]) => key in object2 && deepIncludes(value, object2[key]));
}

/**
 * Creates a deep clone of the input value.
 *
 * Limitations:
 *  - Only supports JSON primitives and arrays.
 *  - Does not support Functions, lambdas, etc.
 *  - Does not support circular references.
 *
 * See: https://web.dev/structured-clone/
 * See: https://stackoverflow.com/questions/40488190/how-is-structured-clone-algorithm-different-from-deep-copy
 * @param input The input to clone.
 * @returns A deep clone of the input.
 */
export function deepClone<T>(input: T): T {
  return JSON.parse(JSON.stringify(input)) as T;
}

/**
 * Returns true if the input string is a UUID.
 * @param input The input string.
 * @returns True if the input string matches the UUID format.
 */
export function isUUID(input: string): boolean {
  return !!/^\w{8}-\w{4}-\w{4}-\w{4}-\w{12}$/i.exec(input);
}

/**
 * Returns true if the input is an object.
 * @param obj The candidate object.
 * @returns True if the input is a non-null non-undefined object.
 */
export function isObject(obj: unknown): obj is Record<string, unknown> {
  return obj !== null && typeof obj === 'object';
}

/**
 * Returns true if the input array is an array of strings.
 * @param arr Input array.
 * @returns True if the input array is an array of strings.
 */
export function isStringArray(arr: any[]): arr is string[] {
  return arr.every((e) => typeof e === 'string');
}

// Precompute hex octets
// See: https://stackoverflow.com/a/55200387
const byteToHex: string[] = [];
for (let n = 0; n < 256; n++) {
  byteToHex.push(n.toString(16).padStart(2, '0'));
}

/**
 * Converts an ArrayBuffer to hex string.
 * See: https://stackoverflow.com/a/55200387
 * @param arrayBuffer The input array buffer.
 * @returns The resulting hex string.
 */
export function arrayBufferToHex(arrayBuffer: ArrayBuffer): string {
  const bytes = new Uint8Array(arrayBuffer);
  const result: string[] = new Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    result[i] = byteToHex[bytes[i]];
  }
  return result.join('');
}

/**
 * Converts an ArrayBuffer to a base-64 encoded string.
 * @param arrayBuffer The input array buffer.
 * @returns The base-64 encoded string.
 */
export function arrayBufferToBase64(arrayBuffer: ArrayBuffer): string {
  const bytes = new Uint8Array(arrayBuffer);
  const result: string[] = [];
  for (let i = 0; i < bytes.length; i++) {
    result[i] = String.fromCharCode(bytes[i]);
  }
  return window.btoa(result.join(''));
}

export function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.substring(1);
}

export function isLowerCase(c: string): boolean {
  return c === c.toLowerCase() && c !== c.toUpperCase();
}

/**
 * Tries to find a code string for a given system within a given codeable concept.
 * @param concept The codeable concept.
 * @param system The system string.
 * @returns The code if found; otherwise undefined.
 */
export function getCodeBySystem(concept: CodeableConcept, system: string): string | undefined {
  return concept.coding?.find((coding) => coding.system === system)?.code;
}

/**
 * Sets a code for a given system within a given codeable concept.
 * @param concept The codeable concept.
 * @param system The system string.
 * @param code The code value.
 */
export function setCodeBySystem(concept: CodeableConcept, system: string, code: string): void {
  if (!concept.coding) {
    concept.coding = [];
  }
  const coding = concept.coding.find((c) => c.system === system);
  if (coding) {
    coding.code = code;
  } else {
    concept.coding.push({ system, code });
  }
}

/**
 * Tries to find an observation interval for the given patient and value.
 * @param definition The observation definition.
 * @param patient The patient.
 * @param value The observation value.
 * @param category Optional interval category restriction.
 * @returns The observation interval if found; otherwise undefined.
 */
export function findObservationInterval(
  definition: ObservationDefinition,
  patient: Patient,
  value: number,
  category?: 'reference' | 'critical' | 'absolute'
): ObservationDefinitionQualifiedInterval | undefined {
  return definition.qualifiedInterval?.find(
    (interval) =>
      observationIntervalMatchesPatient(interval, patient) &&
      observationIntervalMatchesValue(interval, value, definition.quantitativeDetails?.decimalPrecision) &&
      (category === undefined || interval.category === category)
  );
}

/**
 * Tries to find an observation reference range for the given patient and condition names.
 * @param definition The observation definition.
 * @param patient The patient.
 * @param names The condition names.
 * @returns The observation interval if found; otherwise undefined.
 */
export function findObservationReferenceRange(
  definition: ObservationDefinition,
  patient: Patient,
  names: string[]
): ObservationDefinitionQualifiedInterval | undefined {
  return definition.qualifiedInterval?.find(
    (interval) => observationIntervalMatchesPatient(interval, patient) && names.includes(interval.condition as string)
  );
}

/**
 * Returns true if the patient matches the observation interval.
 * @param interval The observation interval.
 * @param patient The patient.
 * @returns True if the patient matches the observation interval.
 */
function observationIntervalMatchesPatient(
  interval: ObservationDefinitionQualifiedInterval,
  patient: Patient
): boolean {
  return observationIntervalMatchesGender(interval, patient) && observationIntervalMatchesAge(interval, patient);
}

/**
 * Returns true if the patient gender matches the observation interval.
 * @param interval The observation interval.
 * @param patient The patient.
 * @returns True if the patient gender matches the observation interval.
 */
function observationIntervalMatchesGender(interval: ObservationDefinitionQualifiedInterval, patient: Patient): boolean {
  return !interval.gender || interval.gender === patient.gender;
}

/**
 * Returns true if the patient age matches the observation interval.
 * @param interval The observation interval.
 * @param patient The patient.
 * @returns True if the patient age matches the observation interval.
 */
function observationIntervalMatchesAge(interval: ObservationDefinitionQualifiedInterval, patient: Patient): boolean {
  return !interval.age || matchesRange(calculateAge(patient.birthDate as string).years, interval.age);
}

/**
 * Returns true if the value matches the observation interval.
 * @param interval The observation interval.
 * @param value The observation value.
 * @param precision Optional precision in number of digits.
 * @returns True if the value matches the observation interval.
 */
function observationIntervalMatchesValue(
  interval: ObservationDefinitionQualifiedInterval,
  value: number,
  precision?: number
): boolean {
  return !!interval.range && matchesRange(value, interval.range, precision);
}

/**
 * Returns true if the value is in the range accounting for precision.
 * @param value The numeric value.
 * @param range The numeric range.
 * @param precision Optional precision in number of digits.
 * @returns True if the value is within the range.
 */
export function matchesRange(value: number, range: Range, precision?: number): boolean {
  return (
    (range.low?.value === undefined || preciseGreaterThanOrEquals(value, range.low.value, precision)) &&
    (range.high?.value === undefined || preciseLessThanOrEquals(value, range.high.value, precision))
  );
}

/**
 * Returns the input number rounded to the specified number of digits.
 * @param a The input number.
 * @param precision The precision in number of digits.
 * @returns The number rounded to the specified number of digits.
 */
export function preciseRound(a: number, precision: number): number {
  return parseFloat(a.toFixed(precision));
}

/**
 * Returns true if the two numbers are equal to the given precision.
 * @param a The first number.
 * @param b The second number.
 * @param precision Optional precision in number of digits.
 * @returns True if the two numbers are equal to the given precision.
 */
export function preciseEquals(a: number, b: number, precision?: number): boolean {
  return toPreciseInteger(a, precision) === toPreciseInteger(b, precision);
}

/**
 * Returns true if the first number is less than the second number to the given precision.
 * @param a The first number.
 * @param b The second number.
 * @param precision Optional precision in number of digits.
 * @returns True if the first number is less than the second number to the given precision.
 */
export function preciseLessThan(a: number, b: number, precision?: number): boolean {
  return toPreciseInteger(a, precision) < toPreciseInteger(b, precision);
}

/**
 * Returns true if the first number is greater than the second number to the given precision.
 * @param a The first number.
 * @param b The second number.
 * @param precision Optional precision in number of digits.
 * @returns True if the first number is greater than the second number to the given precision.
 */
export function preciseGreaterThan(a: number, b: number, precision?: number): boolean {
  return toPreciseInteger(a, precision) > toPreciseInteger(b, precision);
}

/**
 * Returns true if the first number is less than or equal to the second number to the given precision.
 * @param a The first number.
 * @param b The second number.
 * @param precision Optional precision in number of digits.
 * @returns True if the first number is less than or equal to the second number to the given precision.
 */
export function preciseLessThanOrEquals(a: number, b: number, precision?: number): boolean {
  return toPreciseInteger(a, precision) <= toPreciseInteger(b, precision);
}

/**
 * Returns true if the first number is greater than or equal to the second number to the given precision.
 * @param a The first number.
 * @param b The second number.
 * @param precision Optional precision in number of digits.
 * @returns True if the first number is greater than or equal to the second number to the given precision.
 */
export function preciseGreaterThanOrEquals(a: number, b: number, precision?: number): boolean {
  return toPreciseInteger(a, precision) >= toPreciseInteger(b, precision);
}

/**
 * Returns an integer representation of the number with the given precision.
 * For example, if precision is 2, then 1.2345 will be returned as 123.
 * @param a The number.
 * @param precision Optional precision in number of digits.
 * @returns The integer with the given precision.
 */
function toPreciseInteger(a: number, precision?: number): number {
  if (precision === undefined) {
    return a;
  }
  return Math.round(a * Math.pow(10, precision));
}

/**
 * Finds the first resource in the input array that matches the specified code and system.
 * @param resources - The array of resources to search.
 * @param code - The code to search for.
 * @param system - The system to search for.
 * @returns The first resource in the input array that matches the specified code and system, or undefined if no such resource is found.
 */
export function findResourceByCode(
  resources: ResourceWithCode[],
  code: CodeableConcept | string,
  system: string
): ResourceWithCode | undefined {
  return resources.find((r) =>
    typeof code === 'string'
      ? getCodeBySystem(r.code || {}, system) === code
      : getCodeBySystem(r.code || {}, system) === getCodeBySystem(code, system)
  );
}

export function arrayify<T>(value: T | T[] | undefined): T[] | undefined {
  if (!value) {
    return undefined;
  } else if (Array.isArray(value)) {
    return value;
  } else {
    return [value];
  }
}

/**
 * Sleeps for the specified number of milliseconds.
 * @param ms Time delay in milliseconds
 * @returns A promise that resolves after the specified number of milliseconds.
 */
export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
