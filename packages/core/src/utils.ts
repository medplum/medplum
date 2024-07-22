import {
  Attachment,
  Bundle,
  CodeableConcept,
  Coding,
  Device,
  Extension,
  ExtensionValue,
  Identifier,
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
} from '@medplum/fhirtypes';
import { getTypedPropertyValue } from './fhirpath/utils';
import { formatCodeableConcept, formatHumanName } from './format';
import { OperationOutcomeError, validationError } from './outcomes';
import { isReference } from './types';

/**
 * QueryTypes defines the different ways to specify FHIR search parameters.
 *
 * Can be any valid input to the URLSearchParams() constructor.
 *
 * TypeScript definitions for URLSearchParams do not match runtime behavior.
 * The official spec only accepts string values.
 * Web browsers and Node.js automatically coerce values to strings.
 * See: https://github.com/microsoft/TypeScript/issues/32951
 */
export type QueryTypes =
  | URLSearchParams
  | string[][]
  | Record<string, string | number | boolean | undefined>
  | string
  | undefined;

export type ProfileResource = Patient | Practitioner | RelatedPerson;

/**
 * Allowed values for `code_challenge_method` in a PKCE exchange.
 */
export type CodeChallengeMethod = 'plain' | 'S256';

export interface Code {
  code?: CodeableConcept;
}

export type ResourceWithCode = Resource & Code;

/**
 * Creates a reference resource.
 * @param resource - The FHIR resource.
 * @returns A reference resource.
 */
export function createReference<T extends Resource>(resource: T): Reference<T> {
  const reference = getReferenceString(resource);
  const display = getDisplayString(resource);
  return display === reference ? { reference } : { reference, display };
}

/**
 * Returns a reference string for a resource.
 * @param input - The FHIR resource or reference.
 * @returns A reference string of the form resourceType/id.
 */
export function getReferenceString(input: Reference | Resource): string {
  if (isReference(input)) {
    return input.reference;
  }
  return `${(input as Resource).resourceType}/${input.id}`;
}

/**
 * Returns the ID portion of a reference.
 * @param input - A FHIR reference or resource.
 * @returns The ID portion of a reference.
 */
export function resolveId(input: Reference | Resource | undefined): string | undefined {
  if (!input) {
    return undefined;
  }
  if (isReference(input)) {
    return input.reference.split('/')[1];
  }
  return input.id;
}

/**
 * Parses a reference and returns a tuple of [ResourceType, ID].
 * @param reference - A reference to a FHIR resource.
 * @returns A tuple containing the `ResourceType` and the ID of the resource or `undefined` when `undefined` or an invalid reference is passed.
 */
export function parseReference<T extends Resource>(reference: Reference<T> | undefined): [T['resourceType'], string] {
  if (reference?.reference === undefined) {
    throw new OperationOutcomeError(validationError('Reference missing reference property.'));
  }
  const [type, id] = reference.reference.split('/') as [T['resourceType'] | '', string];
  if (type === '' || id === '' || id === undefined) {
    throw new OperationOutcomeError(validationError('Unable to parse reference string.'));
  }
  return [type, id];
}

/**
 * Returns true if the resource is a "ProfileResource".
 * @param resource - The FHIR resource.
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
 * @param resource - The input resource.
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
  if (resource.resourceType === 'MedicationRequest' && resource.medicationCodeableConcept) {
    return formatCodeableConcept(resource.medicationCodeableConcept);
  }
  if (resource.resourceType === 'Subscription' && resource.criteria) {
    return resource.criteria;
  }
  if (resource.resourceType === 'User' && resource.email) {
    return resource.email;
  }
  if ('name' in resource && resource.name && typeof resource.name === 'string') {
    return resource.name;
  }
  if ('code' in resource && resource.code) {
    let code = resource.code;
    if (Array.isArray(code)) {
      code = code[0];
    }
    if (isCodeableConcept(code)) {
      return formatCodeableConcept(code);
    }
    if (isTextObject(code)) {
      return code.text;
    }
  }
  return getReferenceString(resource);
}

/**
 * Returns a display string for a profile resource if one is found.
 * @param resource - The profile resource.
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
 * @param device - The device resource.
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
 * @param resource - The input resource.
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
  if (photo.url && photo.contentType?.startsWith('image/')) {
    return photo.url;
  }
  return undefined;
}

/**
 * Returns a Date property as a Date.
 * When working with JSON objects, Dates are often serialized as ISO-8601 strings.
 * When that happens, we need to safely convert to a proper Date object.
 * @param date - The date property value, which could be a string or a Date object.
 * @returns A Date object.
 */
export function getDateProperty(date: string | undefined): Date | undefined {
  return date ? new Date(date) : undefined;
}

/**
 * Calculates the age in years from the birth date.
 * @param birthDateStr - The birth date or start date in ISO-8601 format YYYY-MM-DD.
 * @param endDateStr - Optional end date in ISO-8601 format YYYY-MM-DD. Default value is today.
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
 * @param birthDateStr - The birth date or start date in ISO-8601 format YYYY-MM-DD.
 * @param endDateStr - Optional end date in ISO-8601 format YYYY-MM-DD. Default value is today.
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
 * @param response - The questionnaire response resource.
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
 * @param response - The questionnaire response resource.
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
 * @param items - The current questionnaire response items.
 * @param result - The cumulative result map of answers.
 */
function buildAllQuestionnaireAnswerItems(
  items: QuestionnaireResponseItem[] | undefined,
  result: Record<string, QuestionnaireResponseItemAnswer[]>
): void {
  if (items) {
    for (const item of items) {
      if (item.linkId && item.answer && item.answer.length > 0) {
        if (result[item.linkId]) {
          result[item.linkId] = [...result[item.linkId], ...item.answer];
        } else {
          result[item.linkId] = item.answer;
        }
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
 * @param resource - The resource to check.
 * @param system - The identifier system.
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
 * Sets a resource identifier for the given system.
 *
 * Note that this method is only available on resources that have an "identifier" property,
 * and that property must be an array of Identifier objects,
 * which is not true for all FHIR resources.
 *
 * If the identifier already exists, then the value is updated.
 *
 * Otherwise a new identifier is added.
 *
 * @param resource - The resource to add the identifier to.
 * @param system - The identifier system.
 * @param value - The identifier value.
 */
export function setIdentifier(resource: Resource & { identifier?: Identifier[] }, system: string, value: string): void {
  const identifiers = resource.identifier;
  if (!identifiers) {
    resource.identifier = [{ system, value }];
    return;
  }
  for (const identifier of identifiers) {
    if (identifier.system === system) {
      identifier.value = value;
      return;
    }
  }
  identifiers.push({ system, value });
}

/**
 * Returns an extension value by extension URLs.
 * @param resource - The base resource.
 * @param urls - Array of extension URLs.  Each entry represents a nested extension.
 * @returns The extension value if found; undefined otherwise.
 */
export function getExtensionValue(resource: any, ...urls: string[]): ExtensionValue | undefined {
  const extension = getExtension(resource, ...urls);
  if (!extension) {
    return undefined;
  }

  const typedValue = getTypedPropertyValue({ type: 'Extension', value: extension }, 'value[x]');
  if (!typedValue) {
    return undefined;
  }

  return Array.isArray(typedValue) ? typedValue[0].value : typedValue.value;
}

/**
 * Returns an extension by extension URLs.
 * @param resource - The base resource.
 * @param urls - Array of extension URLs. Each entry represents a nested extension.
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
 * @param value - The input value.
 * @param pretty - Optional flag to pretty-print the JSON.
 * @returns The resulting JSON string.
 */
export function stringify(value: any, pretty?: boolean): string {
  return JSON.stringify(value, stringifyReplacer, pretty ? 2 : undefined);
}

/**
 * Evaluates JSON key/value pairs for FHIR JSON stringify.
 * Removes properties with empty string values.
 * Removes objects with zero properties.
 * @param k - Property key.
 * @param v - Property value.
 * @returns The replaced value.
 */
function stringifyReplacer(k: string, v: any): any {
  return !isArrayKey(k) && isEmpty(v) ? undefined : v;
}

/**
 * Returns true if the key is an array key.
 * @param k - The property key.
 * @returns True if the key is an array key.
 */
function isArrayKey(k: string): boolean {
  return !!/\d+$/.exec(k);
}

/**
 * Returns true if the value is empty (null, undefined, empty string, or empty object).
 * @param v - Any value.
 * @returns True if the value is an empty string or an empty object.
 */
export function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined) {
    return true;
  }

  const t = typeof v;
  if (t === 'string' || t === 'object') {
    return !isPopulated(v);
  }

  return false;
}

export type CanBePopulated = { length: number } | object;
/**
 * Returns true if the value is a non-empty string, an object with a length property greater than zero, or a non-empty object
 * @param arg - Any value
 * @returns True if the value is a non-empty string, an object with a length property greater than zero, or a non-empty object
 */
export function isPopulated<T extends { length: number } | object>(arg: CanBePopulated | undefined | null): arg is T {
  if (arg === null || arg === undefined) {
    return false;
  }
  const t = typeof arg;

  return (
    (t === 'string' && arg !== '') ||
    (t === 'object' && (('length' in arg && arg.length > 0) || Object.keys(arg).length > 0))
  );
}

/**
 * Resource equality.
 * Ignores meta.versionId and meta.lastUpdated.
 * @param object1 - The first object.
 * @param object2 - The second object.
 * @param path - Optional path string.
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
 * Checks if value includes all fields and values of pattern.
 * It doesn't matter if value has extra fields, values, etc.
 * @param value - The object being tested against pattern.
 * @param pattern - The object pattern/shape checked to exist within value.
 * @returns True if value includes all fields and values of pattern.
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

function deepIncludesArray(value: any[], pattern: any[]): boolean {
  return pattern.every((patternVal) => value.some((valueVal) => deepIncludes(valueVal, patternVal)));
}

function deepIncludesObject(value: { [key: string]: unknown }, pattern: { [key: string]: unknown }): boolean {
  return Object.entries(pattern).every(
    ([patternKey, patternVal]) => patternKey in value && deepIncludes(value[patternKey], patternVal)
  );
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
 * @param input - The input to clone.
 * @returns A deep clone of the input.
 */
export function deepClone<T>(input: T): T {
  return input === undefined ? input : (JSON.parse(JSON.stringify(input)) as T);
}

/**
 * Returns true if the input string is a UUID.
 * @param input - The input string.
 * @returns True if the input string matches the UUID format.
 */
export function isUUID(input: string): input is string {
  return !!/^\w{8}-\w{4}-\w{4}-\w{4}-\w{12}$/i.exec(input);
}

/**
 * Returns true if the input is an object.
 * @param obj - The candidate object.
 * @returns True if the input is a non-null non-undefined object.
 */
export function isObject(obj: unknown): obj is Record<string, unknown> {
  return obj !== null && typeof obj === 'object';
}

/**
 * Returns true if the input array is an array of strings.
 * @param arr - Input array.
 * @returns True if the input array is an array of strings.
 */
export function isStringArray(arr: any[]): arr is string[] {
  return arr.every(isString);
}

/**
 * Returns true if the input value is a string.
 * @param value - The candidate value.
 * @returns True if the input value is a string.
 */
export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

/**
 * Returns true if the input value is a Coding object.
 * This is a heuristic check based on the presence of the "code" property.
 * @param value - The candidate value.
 * @returns True if the input value is a Coding.
 */
export function isCoding(value: unknown): value is Coding & { code: string } {
  return isObject(value) && 'code' in value && typeof value.code === 'string';
}

/**
 * Returns true if the input value is a CodeableConcept object.
 * This is a heuristic check based on the presence of the "coding" property.
 * @param value - The candidate value.
 * @returns True if the input value is a CodeableConcept.
 */
export function isCodeableConcept(value: unknown): value is CodeableConcept & { coding: Coding[] } {
  return isObject(value) && 'coding' in value && Array.isArray(value.coding) && value.coding.every(isCoding);
}

/**
 * Returns true if the input value is an object with a string text property.
 * This is a heuristic check based on the presence of the "text" property.
 * @param value - The candidate value.
 * @returns True if the input value is a text object.
 */
export function isTextObject(value: unknown): value is { text: string } {
  return isObject(value) && 'text' in value && typeof value.text === 'string';
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
 * @param arrayBuffer - The input array buffer.
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
 * @param arrayBuffer - The input array buffer.
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
  if (!word) {
    return '';
  }
  return word.charAt(0).toUpperCase() + word.substring(1);
}

export function isLowerCase(c: string): boolean {
  return c === c.toLowerCase() && c !== c.toUpperCase();
}

export function isComplexTypeCode(code: string): boolean {
  return code.length > 0 && code.startsWith(code[0].toUpperCase());
}

/**
 * Returns the difference between two paths which is often suitable to use as a key in a `Record<string, InternalSchemaElement>`
 * @param parentPath - The parent path that will be removed from `path`.
 * @param path - The element path that should be a child of `parentPath`.
 * @returns - The difference between `path` and `parentPath` or `undefined` if `path` is not a child of `parentPath`.
 */
export function getPathDifference(parentPath: string, path: string): string | undefined {
  const parentPathPrefix = parentPath + '.';
  if (path.startsWith(parentPathPrefix)) {
    return path.slice(parentPathPrefix.length);
  }
  return undefined;
}

/**
 * Tries to find a code string for a given system within a given codeable concept.
 * @param concept - The codeable concept.
 * @param system - The system string.
 * @returns The code if found; otherwise undefined.
 */
export function getCodeBySystem(concept: CodeableConcept, system: string): string | undefined {
  return concept.coding?.find((coding) => coding.system === system)?.code;
}

/**
 * Sets a code for a given system within a given codeable concept.
 * @param concept - The codeable concept.
 * @param system - The system string.
 * @param code - The code value.
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
 * @param definition - The observation definition.
 * @param patient - The patient.
 * @param value - The observation value.
 * @param category - Optional interval category restriction.
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
 * @param definition - The observation definition.
 * @param patient - The patient.
 * @param names - The condition names.
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
 * @param interval - The observation interval.
 * @param patient - The patient.
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
 * @param interval - The observation interval.
 * @param patient - The patient.
 * @returns True if the patient gender matches the observation interval.
 */
function observationIntervalMatchesGender(interval: ObservationDefinitionQualifiedInterval, patient: Patient): boolean {
  return !interval.gender || interval.gender === patient.gender;
}

/**
 * Returns true if the patient age matches the observation interval.
 * @param interval - The observation interval.
 * @param patient - The patient.
 * @returns True if the patient age matches the observation interval.
 */
function observationIntervalMatchesAge(interval: ObservationDefinitionQualifiedInterval, patient: Patient): boolean {
  return !interval.age || matchesRange(calculateAge(patient.birthDate as string).years, interval.age);
}

/**
 * Returns true if the value matches the observation interval.
 * @param interval - The observation interval.
 * @param value - The observation value.
 * @param precision - Optional precision in number of digits.
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
 * @param value - The numeric value.
 * @param range - The numeric range.
 * @param precision - Optional precision in number of digits.
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
 * @param a - The input number.
 * @param precision - The precision in number of digits.
 * @returns The number rounded to the specified number of digits.
 */
export function preciseRound(a: number, precision: number): number {
  return parseFloat(a.toFixed(precision));
}

/**
 * Returns true if the two numbers are equal to the given precision.
 * @param a - The first number.
 * @param b - The second number.
 * @param precision - Optional precision in number of digits.
 * @returns True if the two numbers are equal to the given precision.
 */
export function preciseEquals(a: number, b: number, precision?: number): boolean {
  return toPreciseInteger(a, precision) === toPreciseInteger(b, precision);
}

/**
 * Returns true if the first number is less than the second number to the given precision.
 * @param a - The first number.
 * @param b - The second number.
 * @param precision - Optional precision in number of digits.
 * @returns True if the first number is less than the second number to the given precision.
 */
export function preciseLessThan(a: number, b: number, precision?: number): boolean {
  return toPreciseInteger(a, precision) < toPreciseInteger(b, precision);
}

/**
 * Returns true if the first number is greater than the second number to the given precision.
 * @param a - The first number.
 * @param b - The second number.
 * @param precision - Optional precision in number of digits.
 * @returns True if the first number is greater than the second number to the given precision.
 */
export function preciseGreaterThan(a: number, b: number, precision?: number): boolean {
  return toPreciseInteger(a, precision) > toPreciseInteger(b, precision);
}

/**
 * Returns true if the first number is less than or equal to the second number to the given precision.
 * @param a - The first number.
 * @param b - The second number.
 * @param precision - Optional precision in number of digits.
 * @returns True if the first number is less than or equal to the second number to the given precision.
 */
export function preciseLessThanOrEquals(a: number, b: number, precision?: number): boolean {
  return toPreciseInteger(a, precision) <= toPreciseInteger(b, precision);
}

/**
 * Returns true if the first number is greater than or equal to the second number to the given precision.
 * @param a - The first number.
 * @param b - The second number.
 * @param precision - Optional precision in number of digits.
 * @returns True if the first number is greater than or equal to the second number to the given precision.
 */
export function preciseGreaterThanOrEquals(a: number, b: number, precision?: number): boolean {
  return toPreciseInteger(a, precision) >= toPreciseInteger(b, precision);
}

/**
 * Returns an integer representation of the number with the given precision.
 * For example, if precision is 2, then 1.2345 will be returned as 123.
 * @param a - The number.
 * @param precision - Optional precision in number of digits.
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
 * @param ms - Time delay in milliseconds
 * @returns A promise that resolves after the specified number of milliseconds.
 */
export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Splits a string into an array of strings using the specified delimiter.
 * Unlike the built-in split function, this function will split the string into a maximum of exactly n parts.
 * Trailing empty strings are included in the result.
 * @param str - The string to split.
 * @param delim - The delimiter.
 * @param n - The maximum number of parts to split the string into.
 * @returns The resulting array of strings.
 */
export function splitN(str: string, delim: string, n: number): string[] {
  const result: string[] = [];
  for (let i = 0; i < n - 1; i++) {
    const delimIndex = str.indexOf(delim);
    if (delimIndex < 0) {
      break;
    } else {
      result.push(str.slice(0, delimIndex));
      str = str.slice(delimIndex + delim.length);
    }
  }
  result.push(str);
  return result;
}

/**
 * Memoizes the result of a parameterless function
 * @param fn - The function to be wrapped
 * @returns The result of the first invocation of the wrapped function
 */
export function lazy<T>(fn: () => T): () => T {
  let result: T;
  let executed = false;

  return function (): T {
    if (!executed) {
      result = fn();
      executed = true;
    }
    return result;
  };
}

export function append<T>(array: T[] | undefined, value: T): T[] {
  if (!array) {
    return [value];
  }
  array.push(value);
  return array;
}

/**
 * Sorts an array of strings in place using the localeCompare method.
 *
 * This method will mutate the input array.
 *
 * @param array - The array of strings to sort.
 * @returns The sorted array of strings.
 */
export function sortStringArray(array: string[]): string[] {
  return array.sort((a, b) => a.localeCompare(b));
}

/**
 * Ensures the given URL has a trailing slash.
 * @param url - The URL to ensure has a trailing slash.
 * @returns The URL with a trailing slash.
 */
export function ensureTrailingSlash(url: string): string {
  return url.endsWith('/') ? url : url + '/';
}

/**
 * Ensures the given URL has no leading slash.
 * @param url - The URL to ensure has no leading slash.
 * @returns The URL string with no slash.
 */
export function ensureNoLeadingSlash(url: string): string {
  return url.startsWith('/') ? url.slice(1) : url;
}

/**
 * Concatenates the given base URL and URL.
 *
 * If the URL is absolute, it is returned as-is.
 *
 * @param baseUrl - The base URL.
 * @param path - The URL to concat. Can be relative or absolute.
 * @returns The concatenated URL.
 */
export function concatUrls(baseUrl: string | URL, path: string): string {
  return new URL(ensureNoLeadingSlash(path), ensureTrailingSlash(baseUrl.toString())).toString();
}

/**
 * Concatenates a given base URL and path, ensuring the URL has the appropriate `ws://` or `wss://` protocol instead of `http://` or `https://`.
 *
 * @param baseUrl - The base URL.
 * @param path - The URL to concat. Can be relative or absolute.
 * @returns The concatenated WebSocket URL.
 */
export function getWebSocketUrl(baseUrl: URL | string, path: string): string {
  return concatUrls(baseUrl, path).toString().replace('http://', 'ws://').replace('https://', 'wss://');
}

/**
 * Converts the given `query` to a string.
 *
 * @param query - The query to convert. The type can be any member of `QueryTypes`.
 * @returns The query as a string.
 */
export function getQueryString(query: QueryTypes): string {
  if (typeof query === 'object' && !Array.isArray(query) && !(query instanceof URLSearchParams)) {
    query = Object.fromEntries(Object.entries(query).filter((entry) => entry[1] !== undefined));
  }
  // @ts-expect-error Technically `Record<string, string, number, boolean>` is not valid to pass into `URLSearchParams` constructor since `boolean` and `number`
  // are not considered to be valid values based on the WebIDL definition from WhatWG. The current runtime behavior relies on implementation-specific coercion to string under the hood.
  // Source: https://url.spec.whatwg.org/#dom-urlsearchparams-urlsearchparams:~:text=6.2.%20URLSearchParams,)%20init%20%3D%20%22%22)%3B
  return new URLSearchParams(query).toString();
}

export const VALID_HOSTNAME_REGEX =
  /^(([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9\-_]*[a-zA-Z0-9])\.)*([A-Za-z0-9]|[A-Za-z0-9][A-Za-z0-9\-_]*[A-Za-z0-9])$/;

/**
 * Tests whether a given input is a valid hostname.
 *
 * __NOTE: Does not validate that the input is a valid domain name, only a valid hostname.__
 *
 * @param input - The input to test.
 * @returns True if `input` is a valid hostname, otherwise returns false.
 *
 * ### Valid matches:
 * - foo
 * - foo.com
 * - foo.bar.com
 * - foo.org
 * - foo.bar.co.uk
 * - localhost
 * - LOCALHOST
 * - foo-bar-baz
 * - foo_bar
 * - foobar123
 *
 * ### Invalid matches:
 * - foo.com/bar
 * - https://foo.com
 * - foo_-bar_-
 * - foo | rm -rf /
 */
export function isValidHostname(input: string): boolean {
  return VALID_HOSTNAME_REGEX.test(input);
}

/**
 * Adds the supplied profileUrl to the resource.meta.profile if it is not already
 * specified
 * @param resource - A FHIR resource
 * @param profileUrl - The profile URL to add
 * @returns The resource
 */
export function addProfileToResource<T extends Resource = Resource>(resource: T, profileUrl: string): T {
  if (!resource?.meta?.profile?.includes(profileUrl)) {
    resource.meta = resource.meta ?? {};
    resource.meta.profile = resource.meta.profile ?? [];
    resource.meta.profile.push(profileUrl);
  }
  return resource;
}

/**
 * Returns a Map of resources from a bundle, using the specified identifier system as the key.
 * @param resourceBundle - The bundle of resources.
 * @param identifierSystem - The identifier system to use for keys.
 * @returns Map of resources keyed by identifier value for the specified system.
 */
export function mapByIdentifier<T extends Resource = Resource>(
  resourceBundle: Bundle<T>,
  identifierSystem: string
): Map<string, T> {
  const resourceMap = new Map<string, T>(
    resourceBundle.entry
      ?.filter((e) => !!e.resource)
      .map((e) => [getIdentifier(e.resource as Resource, identifierSystem) as string, e.resource as T])
      .filter(([i]) => i !== undefined) as [string, T][]
  );
  return resourceMap;
}

/**
 * Removes the supplied profileUrl from the resource.meta.profile if it is present
 * @param resource - A FHIR resource
 * @param profileUrl - The profile URL to remove
 * @returns The resource
 */
export function removeProfileFromResource<T extends Resource = Resource>(resource: T, profileUrl: string): T {
  if (resource?.meta?.profile?.includes(profileUrl)) {
    const index = resource.meta.profile.indexOf(profileUrl);
    resource.meta.profile.splice(index, 1);
  }
  return resource;
}

export function flatMapFilter<T, U>(arr: T[], fn: (value: T, idx: number) => U | undefined): U[] {
  const result = [];
  for (let i = 0; i < arr.length; i++) {
    const resultValue = fn(arr[i], i);
    if (Array.isArray(resultValue)) {
      result.push(...resultValue.flat());
    } else if (resultValue !== undefined) {
      result.push(resultValue);
    }
  }
  return result;
}
