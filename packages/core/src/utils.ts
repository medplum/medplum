import {
  Attachment,
  Device,
  Extension,
  Patient,
  Practitioner,
  QuestionnaireResponse,
  QuestionnaireResponseItem,
  QuestionnaireResponseItemAnswer,
  Reference,
  RelatedPerson,
  Resource,
} from '@medplum/fhirtypes';
import { formatHumanName } from './format';

export type ProfileResource = Patient | Practitioner | RelatedPerson;

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
 * Returns true if the resource is a "ProfileResource".
 * @param resource The FHIR resource.
 * @returns True if the resource is a "ProfileResource".
 */
export function isProfileResource(resource: Resource): boolean {
  return (
    resource.resourceType === 'Patient' ||
    resource.resourceType === 'Practitioner' ||
    resource.resourceType === 'RelatedPerson'
  );
}

/**
 * Returns a display string for the resource.
 * @param resource The input resource.
 * @return Human friendly display string.
 */
export function getDisplayString(resource: Resource): string {
  if (isProfileResource(resource)) {
    const profileName = getProfileResourceDisplayString(resource as ProfileResource);
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
    if ('code' in resource && (resource.code as any)?.text) {
      return (resource.code as any)?.text;
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
  if (isProfileResource(resource)) {
    const photos = (resource as ProfileResource).photo;
    if (photos) {
      for (const photo of photos) {
        const url = getPhotoImageSrc(photo);
        if (url) {
          return url;
        }
      }
    }
  }
  if (resource.resourceType === 'Bot' && resource.photo) {
    const url = getPhotoImageSrc(resource.photo);
    if (url) {
      return url;
    }
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

/**
 * Recursively builds the questionnaire answer items map.
 * @param item The current questionnaire response item.
 * @param result The cumulative result map.
 */
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
 * Returns an extension value by extension URLs.
 * @param resource The base resource.
 * @param urls Array of extension URLs.  Each entry represents a nested extension.
 * @returns The extension value if found; undefined otherwise.
 */
export function getExtensionValue(resource: Resource, ...urls: string[]): string | undefined {
  // Let curr be the current resource or extension. Extensions can be nested.
  let curr: any = resource;

  // For each of the urls, try to find a matching nested extension.
  for (let i = 0; i < urls.length && curr; i++) {
    curr = (curr?.extension as Extension[] | undefined)?.find((e) => e.url === urls[i]);
  }

  return curr?.valueString as string | undefined;
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
 * @param {string} k Property key.
 * @param {*} v Property value.
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
  return !!k.match(/\d+$/);
}

/**
 * Returns true if the value is empty (null, undefined, empty string, or empty object).
 * @param v Any value.
 * @returns True if the value is an empty string or an empty object.
 */
function isEmpty(v: any): boolean {
  if (v === null || v === undefined) {
    return true;
  }
  const t = typeof v;
  return (t === 'string' && v === '') || (t === 'object' && Object.keys(v).length === 0);
}

/**
 * Resource equality.
 * Ignores meta.versionId and meta.lastUpdated.
 * See: https://dmitripavlutin.com/how-to-compare-objects-in-javascript/#4-deep-equality
 * @param object1 The first object.
 * @param object2 The second object.
 * @returns True if the objects are equal.
 */
export function deepEquals(object1: any, object2: any, path?: string): boolean {
  let keys1 = Object.keys(object1);
  let keys2 = Object.keys(object2);
  if (path === 'meta') {
    keys1 = keys1.filter((k) => k !== 'versionId' && k !== 'lastUpdated' && k !== 'author');
    keys2 = keys2.filter((k) => k !== 'versionId' && k !== 'lastUpdated' && k !== 'author');
  }
  if (keys1.length !== keys2.length) {
    return false;
  }
  for (const key of keys1) {
    const val1 = object1[key];
    const val2 = object2[key];
    if (isObject(val1) && isObject(val2)) {
      if (!deepEquals(val1, val2, key)) {
        return false;
      }
    } else {
      if (val1 !== val2) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Returns true if the input is an object.
 * @param object The candidate object.
 * @returns True if the input is a non-null non-undefined object.
 */
export function isObject(obj: unknown): obj is object {
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
  return word.charAt(0).toUpperCase() + word.substr(1);
}

export function isLowerCase(c: string): boolean {
  return c === c.toLowerCase();
}
