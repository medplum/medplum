import { createReference, evalFhirPath } from '@medplum/core';
import { readJson } from '@medplum/definitions';
import { CompartmentDefinition, CompartmentDefinitionResource, Patient, Reference, Resource } from '@medplum/fhirtypes';
import { getSearchParameter } from './structure';

/**
 * Patient compartment definitions.
 * See: https://www.hl7.org/fhir/compartmentdefinition-patient.html
 */
let patientCompartment: CompartmentDefinition | undefined = undefined;

/**
 * Lazy load the patient compartment definitions.
 * @returns The patient compartment definitions.
 */
export function getPatientCompartments(): CompartmentDefinition {
  if (!patientCompartment) {
    patientCompartment = readJson('fhir/r4/compartmentdefinition-patient.json') as CompartmentDefinition;
  }
  return patientCompartment;
}

/**
 * Returns the list of patient compartment search parameters, if the resource type is in a patient compartment.
 * Returns undefined otherwise.
 * See: https://www.hl7.org/fhir/compartmentdefinition-patient.html
 * @param resourceType The resource type.
 * @returns List of property names if in patient compartment; undefined otherwise.
 */
export function getPatientCompartmentParams(resourceType: string): string[] | undefined {
  const resourceList = getPatientCompartments().resource as CompartmentDefinitionResource[];
  for (const resource of resourceList) {
    if (resource.code === resourceType) {
      return resource.param;
    }
  }
  return undefined;
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
export function getPatient(resource: Resource): Reference<Patient> | undefined {
  if (resource.resourceType === 'Patient') {
    return resource.id ? createReference(resource) : undefined;
  }
  const params = getPatientCompartmentParams(resource.resourceType);
  if (params) {
    for (const code of params) {
      const searchParam = getSearchParameter(resource.resourceType, code);
      if (searchParam) {
        const values = evalFhirPath(searchParam.expression as string, resource);
        for (const value of values) {
          const patientId = getPatientFromUnknownValue(value);
          if (patientId) {
            return patientId;
          }
        }
      }
    }
  }
  return undefined;
}

/**
 * Tries to return a patient ID from an unknown value.
 * @param value The unknown value.
 * @returns The patient ID if found; undefined otherwise.
 */
function getPatientFromUnknownValue(value: unknown): Reference<Patient> | undefined {
  if (value && typeof value === 'object') {
    return getPatientIdFromReference(value as Reference);
  }
  return undefined;
}

/**
 * Tries to return a patient ID from a FHIR reference.
 * @param reference A FHIR reference.
 * @returns The patient ID if found; undefined otherwise.
 */
function getPatientIdFromReference(reference: Reference): Reference<Patient> | undefined {
  if (reference.reference?.startsWith('Patient/')) {
    return reference as Reference<Patient>;
  }
  return undefined;
}
