// start-block imports
import { MedplumClient, getReferenceString, deepClone } from '@medplum/core';
import { Identifier, Patient, Reference, ResourceType } from '@medplum/fhirtypes';

// end-block imports

// start-block updateReferences
/**
 * Rewrites all references to source patient to the target patient, for the given resource type.
 *
 * @param medplum The MedplumClient
 * @param sourcePatient Source `Patient` resource. After this operation, no resources of the specified type will refer
 * to this `Patient`
 * @param targetPatient Target `Patient` resource. After this operation, no resources of the specified type will refer
 * to this `Patient`
 * @param resourceType Resource type to rewrite (e.g. `Encounter`)
 */
async function updateResourceReferences<T extends ResourceType>(
  medplum: MedplumClient,
  sourcePatient: Patient,
  targetPatient: Patient,
  resourceType: T
): Promise<void> {
  // Search for clinical resources related to the source patient, by searching for all resources in the patient compartment
  // Refer to the FHIR documentation on compartments for more information:
  // https://hl7.org/fhir/R4/compartmentdefinition-patient.html
  const clinicalResources = await medplum.searchResources(resourceType, {
    _compartment: getReferenceString(sourcePatient),
  });

  for (const clinicalResource of clinicalResources) {
    replaceReferences(clinicalResource, getReferenceString(sourcePatient), getReferenceString(targetPatient));
    await medplum.updateResource(clinicalResource);
  }
}

/**
 * Recursive function to search for all references to the source resource, and translate them to the target resource
 * @param obj A FHIR resource or element
 * @param srcReference The reference string referring to the source resource
 * @param targetReference The reference string referring to the target resource
 */
function replaceReferences(obj: any, srcReference: string, targetReference: string): void {
  for (const key in obj) {
    if (typeof obj[key] === 'object' && obj[key] !== null) {
      replaceReferences(obj[key], srcReference, targetReference);
    } else if (typeof obj[key] === 'string' && obj[key] === srcReference) {
      obj[key] = targetReference;
    }
  }
}
// end-block updateReferences

// start-block mergeIdentifiers
interface MergedPatients {
  readonly src: Patient;
  readonly target: Patient;
}

/**
 * Merges contact information (identifiers) of two patient records, where the source patient record will be marked as
 * an old record. The target patient record will be overwritten with the merged data and will be the master record.
 *
 * @param src - The source patient record.
 * @param target - The target patient record.
 * @param fields - Optional additional fields to be merged.
 * @returns - Object containing the original source and the merged target patient records.
 */
function mergePatientRecords(src: Patient, target: Patient, fields?: Partial<Patient>): MergedPatients {
  const targetCopy = deepClone(target);
  const mergedIdentifiers = targetCopy.identifier ?? [];
  const srcIdentifiers = src.identifier ?? [];

  // Check for conflicts between the source and target records' identifiers
  for (const srcIdentifier of srcIdentifiers) {
    const targetIdentifier = mergedIdentifiers?.find(
      (identifier: Identifier) => identifier.system === srcIdentifier.system
    );
    // If the targetRecord has an identifier with the same system, check if source and target agree on the identifier value
    if (targetIdentifier) {
      if (targetIdentifier.value !== srcIdentifier.value) {
        throw new Error(`Mismatched identifier for system ${srcIdentifier.system}`);
      }
    }
    // If this identifier is not present on the target, add it to the merged record and mark it as 'old'
    else {
      mergedIdentifiers.push({ ...srcIdentifier, use: 'old' } as Identifier);
    }
  }

  targetCopy.identifier = mergedIdentifiers;
  const targetMerged = { ...targetCopy, ...fields };
  return { src: src, target: targetMerged };
}
// end-block mergeIdentifiers

// start-block doNotMatch
/**
 * Adds a patient to the 'doNotMatch' list for a given patient list.
 *
 * @param medplum - The Medplum client instance.
 * @param subject - Reference to the patient list.
 * @param patientAdded - Reference to the patient being added to the 'doNotMatch' list.
 *
 * @returns - Returns a promise that resolves when the operation is completed.
 */
async function addToDoNotMatchList(
  medplum: MedplumClient,
  subject: Reference<Patient>,
  patientAdded: Reference<Patient>
): Promise<void> {
  const list = await medplum.searchOne('List', {
    subject: subject.reference,
    code: 'http://example.org/listType|doNotMatch',
  });
  if (list) {
    const entries = list.entry ?? [];
    entries.push({ item: patientAdded });
    await medplum.updateResource({ ...list, entry: entries });
    return;
  }
  console.warn('No doNotMatch list found for patient: ' + subject.reference);
}
// end-block doNotMatch

console.log(addToDoNotMatchList, mergePatientRecords, updateResourceReferences);
