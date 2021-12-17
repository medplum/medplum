import { readJson } from '@medplum/definitions';
import { CompartmentDefinition, CompartmentDefinitionResource, Reference, Resource } from '@medplum/fhirtypes';

/**
 * Patient compartment definitions.
 * See: https://www.hl7.org/fhir/compartmentdefinition-patient.html
 */
let patientCompartment: CompartmentDefinition | undefined = undefined;

/**
 * Lazy load the patient compartment definitions.
 * @returns The patient compartment definitions.
 */
function getPatientCompartments(): CompartmentDefinition {
  if (!patientCompartment) {
    patientCompartment = readJson('fhir/r4/compartmentdefinition-patient.json') as CompartmentDefinition;
  }
  return patientCompartment;
}

/**
 * Returns the list of patient compartment properties, if the resource type is in a patient compartment.
 * Returns undefined otherwise.
 * See: https://www.hl7.org/fhir/compartmentdefinition-patient.html
 * @param resourceType The resource type.
 * @returns List of property names if in patient compartment; undefined otherwise.
 */
export function getPatientCompartmentProperties(resourceType: string): string[] | undefined {
  const resourceList = getPatientCompartments().resource as CompartmentDefinitionResource[];
  for (const resource of resourceList) {
    if (resource.code === resourceType) {
      return resource.param;
    }
  }
  return undefined;
}

/**
 * Returns the list of patient resource types.
 * See: https://www.hl7.org/fhir/compartmentdefinition-patient.html
 * @returns List of resource types in the patient compartment.
 */
export function getPatientCompartmentResourceTypes(): string[] {
  const result = ['Patient'];
  const resourceList = getPatientCompartments().resource as CompartmentDefinitionResource[];
  for (const resource of resourceList) {
    if (resource.code && resource.param) {
      // Only add resource definitions with a 'param' value
      // The param value defines the eligible properties
      // If param is missing, it means the resource type is not in the compartment
      result.push(resource.code);
    }
  }
  return result;
}

/**
 * Returns the patient compartment ID for a resource.
 * If the resource is in a patient compartment (i.e., an Observation about the patient),
 * then return the patient ID.
 * If the resource is not in a patient compartment (i.e., a StructureDefinition),
 * then return undefined.
 * @param resource The resource to inspect.
 * @returns The patient ID if found; undefined otherwise.
 */
export function getPatientId(resource: Resource): string | undefined {
  if (resource.resourceType === 'Patient') {
    return resource.id;
  }
  const properties = getPatientCompartmentProperties(resource.resourceType);
  if (properties) {
    for (const property of properties) {
      if (property in resource) {
        const value: Reference | Reference[] | undefined = (resource as any)[property];
        const patientId = getPatientIdFromReferenceProperty(value);
        if (patientId) {
          return patientId;
        }
      }
    }
  }
  return undefined;
}

/**
 * Tries to return a patient ID from a reference or array of references.
 * @param reference A FHIR reference or array of references.
 * @returns The patient ID if found; undefined otherwise.
 */
function getPatientIdFromReferenceProperty(reference: Reference | Reference[] | undefined): string | undefined {
  if (!reference) {
    return undefined;
  }
  if (Array.isArray(reference)) {
    return getPatientIdFromReferenceArray(reference);
  } else {
    return getPatientIdFromReference(reference);
  }
}

/**
 * Tries to return a patient ID from an array of references.
 * @param references Array of FHIR references.
 * @returns The patient ID if found; undefined otherwise.
 */
function getPatientIdFromReferenceArray(references: Reference[]): string | undefined {
  for (const reference of references) {
    const result = getPatientIdFromReference(reference);
    if (result) {
      return result;
    }
  }
  return undefined;
}

/**
 * Tries to return a patient ID from a FHIR reference.
 * @param reference A FHIR reference.
 * @returns The patient ID if found; undefined otherwise.
 */
function getPatientIdFromReference(reference: Reference): string | undefined {
  if (reference.reference?.startsWith('Patient/')) {
    return resolveId(reference);
  }
  return undefined;
}

/**
 * Returns the ID portion of a reference.
 * For now, assumes the common convention of resourceType/id.
 * In the future, detect and handle searches (i.e., "Patient?identifier=123").
 * @param reference A FHIR reference.
 * @returns The ID portion of a reference.
 */
function resolveId(reference: Reference | undefined): string | undefined {
  return reference?.reference?.split('/')[1];
}
