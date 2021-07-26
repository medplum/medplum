import { Patient, Practitioner, Reference, RelatedPerson, Resource } from './fhir';
import { formatHumanName } from './format';

export type ProfileResource = Patient | Practitioner | RelatedPerson;

/**
 * Creates a reference resource.
 * @param resource The FHIR reesource.
 * @returns A reference resource.
 */
export function createReference(resource: Resource): Reference {
  return {
    reference: getReferenceString(resource),
    display: getDisplayString(resource)
  };
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
    const names = (resource as ProfileResource).name;
    if (names && names.length > 0) {
      return formatHumanName(names[0]);
    }
  }
  if (resource.resourceType === 'ClientApplication' && resource.name) {
    return resource.name;
  }
  return getReferenceString(resource);
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
export function getDateProperty(date: Date | string | undefined): Date | undefined {
  if (date instanceof Date) {
    return date;
  }
  if (typeof date === 'string') {
    return new Date(date);
  }
  return undefined;
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
export function arrayBufferToHex(arrayBuffer: ArrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const result: string[] = new Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    result[i] = byteToHex[bytes[i]];
  }
  return result.join('');
}

export function arrayBufferToBase64(arrayBuffer: ArrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const result: string[] = [];
  for (let i = 0; i < bytes.length; i++) {
    result[i] = String.fromCharCode(bytes[i]);
  }
  return window.btoa(result.join(''));
}
