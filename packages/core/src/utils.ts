import { Device, Patient, Practitioner, Reference, RelatedPerson, Resource } from './fhir';
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
  return (display === reference) ? { reference } : { reference, display };
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
 * Returns true if the resource is a "ProfileResource".
 * @param resource The FHIR resource.
 * @returns True if the resource is a "ProfileResource".
 */
export function isProfileResource(resource: Resource): boolean {
  return resource.resourceType === 'Patient' ||
    resource.resourceType === 'Practitioner' ||
    resource.resourceType === 'RelatedPerson';
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
  const simpleName = (resource as any).name;
  if (simpleName && typeof simpleName === 'string') {
    return simpleName;
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
        if (photo.url && photo.contentType && photo.contentType.startsWith('image/')) {
          return photo.url;
        }
      }
    }
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
 * Replaces any key/value pair of key "__key" with value undefined.
 * This function can be used as the 2nd argument to stringify to remove __key properties.
 * We add __key properties to array elements to improve React render performance.
 * @param {string} k Property key.
 * @param {*} v Property value.
 */
function stringifyReplacer(k: string, v: any): any {
  return (k === '__key' || isEmpty(v)) ? undefined : v;
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
    keys1 = keys1.filter(k => k !== 'versionId' && k !== 'lastUpdated');
    keys2 = keys2.filter(k => k !== 'versionId' && k !== 'lastUpdated');
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

function isObject(object: any): boolean {
  return object !== null && typeof object === 'object';
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
