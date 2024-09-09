import {
  BotEvent,
  MedplumClient,
  createReference,
  deepClone,
  getQuestionnaireAnswers,
  getReferenceString,
  resolveId,
} from '@medplum/core';
import {
  Identifier,
  Patient,
  QuestionnaireResponse,
  QuestionnaireResponseItemAnswer,
  Reference,
  ResourceType,
  RiskAssessment,
} from '@medplum/fhirtypes';

/**
 * Handler function to process incoming BotEvent containing a QuestionnaireResponse for potential patient record merges.
 *
 * Because this bot only considers a single (source, target) match, there is a risk of race conditions
 * across multiple merge operations. Managing race conditions over record merges is a known hard problem,
 * and n practice, this should be handled at the workflow level.
 *
 * There are a few different ways to handle such race conditions:
 *   - Modify the merge bot to operate on all RiskAssessments assigned to a given target patient
 *     rather than on each RiskAssessment individually. This would keep the merges sequential within the Bot.
 *   - Make sure all matches for a given target patient are reviewed by the same person.
 *     Have the reviewer-facing UI force the reviewer to handle all merges for a given target in sequence
 *
 * @param medplum - The Medplum client instance.
 * @param event - The BotEvent containing the QuestionnaireResponse.
 *
 */
export async function handler(medplum: MedplumClient, event: BotEvent<QuestionnaireResponse>): Promise<void> {
  // Extract answers from the QuestionnaireResponse.
  const responses = getQuestionnaireAnswers(event.input);
  // Get the reference to the RiskAssessment from the answers.
  const riskAssessmentReference = event.input.subject as QuestionnaireResponseItemAnswer;
  // If there's no valid RiskAssessment reference in the response, throw an error.
  if (!riskAssessmentReference) {
    throw new Error('Invalid input. Expected RiskAssessment reference');
  }
  const riskAssessment = (await medplum.readReference(riskAssessmentReference)) as RiskAssessment;
  const targetReference = riskAssessment.basis?.[0] as Reference<Patient>;
  const srcReference = riskAssessment.subject as Reference<Patient>;
  if (!targetReference || !srcReference) {
    throw new Error(
      `Undefined references target: ${JSON.stringify(targetReference, null, 2)} src: ${JSON.stringify(
        srcReference,
        null,
        2
      )}`
    );
  }

  // If merge is disabled based on the questionnaire's answer, terminate the handler early.
  // Reasons for disabling merge include:
  // - The patient records are not duplicates.
  // - The patient records are duplicates, but the user does not want to merge them.
  const mergeDisabled = responses['disableMerge']?.valueBoolean;
  if (mergeDisabled) {
    await addToDoNotMatchList(medplum, srcReference, targetReference);
    await addToDoNotMatchList(medplum, targetReference, srcReference);
    return;
  }

  // Read the source and target Patient resource
  const targetPatient = (await medplum.readReference(targetReference)) as Patient;
  const sourcePatient = (await medplum.readReference(srcReference)) as Patient;

  const patients = linkPatientRecords(sourcePatient, targetPatient);

  // Copy some data from the source patient to the target, depending on the user input
  let fieldUpdates = {} as Partial<Patient>;
  const appendName = responses['appendName']?.valueBoolean;
  const appendAddress = responses['appendAddress']?.valueBoolean;

  if (appendName) {
    fieldUpdates = { ...fieldUpdates, name: [...(targetPatient.name ?? []), ...(sourcePatient.name ?? [])] };
  }

  if (appendAddress) {
    fieldUpdates = { ...fieldUpdates, address: [...(targetPatient.address ?? []), ...(sourcePatient.address ?? [])] };
  }

  const mergedPatients = mergePatientRecords(patients.src, patients.target, fieldUpdates);

  // Update clinical data to point to the target resource
  // To improve efficiency, consider grouping these requests into a batch transaction (http://hl7.org/fhir/R4/http.html#transaction)
  await updateResourceReferences(medplum, mergedPatients.src, mergedPatients.target, 'ServiceRequest');
  await updateResourceReferences(medplum, mergedPatients.src, mergedPatients.target, 'Observation');
  await updateResourceReferences(medplum, mergedPatients.src, mergedPatients.target, 'DiagnosticReport');
  await updateResourceReferences(medplum, mergedPatients.src, mergedPatients.target, 'MedicationRequest');
  await updateResourceReferences(medplum, mergedPatients.src, mergedPatients.target, 'Encounter');

  // We might delete the source patient record if we don't want to continue to have a duplicate of an existing patient
  // despite the fact that it is an inactive record.
  const deleteSource = responses['deleteSource']?.valueBoolean;
  if (deleteSource === true) {
    await medplum.deleteResource('Patient', mergedPatients.src.id as string);
  } else {
    // If we don't delete the source patient record, we need to update it to be inactive.
    await medplum.updateResource<Patient>(mergedPatients.src);
  }

  // Update the target patient record with the merged data, and have it as the master record.
  await medplum.updateResource<Patient>(mergedPatients.target);
}

// start-block linkPatientRecords
interface MergedPatients {
  readonly src: Patient;
  readonly target: Patient;
}

/**
 * Links two patient records indicating one replaces the other.
 *
 * @param src - The source patient record which is being replaced.
 * @param target - The target patient record which will replace the source.
 * @returns - Object containing updated source and target patient records with their links.
 */
export function linkPatientRecords(src: Patient, target: Patient): MergedPatients {
  const targetCopy = deepClone(target);
  const targetLinks = targetCopy.link ?? [];
  targetLinks.push({ other: createReference(src), type: 'replaces' });

  const srcCopy = deepClone(src);
  const srcLinks = srcCopy.link ?? [];
  srcLinks.push({ other: createReference(target), type: 'replaced-by' });
  return { src: { ...srcCopy, link: srcLinks, active: false }, target: { ...targetCopy, link: targetLinks } };
}

// end-block linkPatientRecords

// start-block unLinkPatientRecords

/**
 * Unlink two patient that have been merged
 *
 * @param src - The source patient record which is marked as replaced.
 * @param target - The target patient marked as the master record.
 * @returns - Object containing updated source and target patient records with their links.
 */
export function unlinkPatientRecords(src: Patient, target: Patient): MergedPatients {
  const targetCopy = deepClone(target);
  const srcCopy = deepClone(src);
  // Filter out links from the target to the source
  targetCopy.link = targetCopy.link?.filter((link) => resolveId(link.other) !== src.id);
  // Filter out links from the source to the target
  srcCopy.link = srcCopy.link?.filter((link) => resolveId(link.other) !== target.id);

  // If the source record is no longer replaced, make it active again
  if (!srcCopy.link?.filter((link) => link.type === 'replaced-by')?.length) {
    srcCopy.active = true;
  }

  return { src: srcCopy, target: targetCopy };
}

// end-block unLinkPatientRecords

// start-block mergeIdentifiers
/**
 * Merges contact information (identifiers) of two patient records, where the source patient record will be marked as
 * an old record. The target patient record will be overwritten with the merged data and will be the master record.
 *
 * @param src - The source patient record.
 * @param target - The target patient record.
 * @param fields - Optional additional fields to be merged.
 * @returns - Object containing the original source and the merged target patient records.
 */
export function mergePatientRecords(src: Patient, target: Patient, fields?: Partial<Patient>): MergedPatients {
  const targetCopy = deepClone(target);
  const mergedIdentifiers = targetCopy.identifier ?? [];
  const srcIdentifiers = src.identifier ?? [];

  // Check for conflicts between the source and target records' identifiers
  for (const srcIdentifier of srcIdentifiers) {
    const targetIdentifier = mergedIdentifiers?.find((identifier) => identifier.system === srcIdentifier.system);
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

/**
 * Returns true if both the source and target patients are part of the same merged "cluster" of records.
 * There are three cases to handle:
 *   1. Both the source and target patients share the same master record (i.e. both replaced by the same record)
 *   2. The target record is the master record (i.e. target 'replaces' source)
 *   3. The source record is the master record (i.e. source 'replaces' target)
 *
 * @param src - The source patient record
 * @param target - The target patient record
 * @returns true if both the source and target patients are part of the same merged "cluster" of records.
 */
export function patientsAlreadyMerged(src: Patient, target: Patient): boolean {
  const srcMaster = src.link?.find((link) => link.type === 'replaced-by')?.other;
  const targetMaster = target.link?.find((link) => link.type === 'replaced-by')?.other;

  // Case 1: Both patients share the same master record
  if (srcMaster && targetMaster && resolveId(srcMaster) === resolveId(targetMaster)) {
    return true;
  }

  // Case 2: The target record is the master record
  if (resolveId(srcMaster) === target.id) {
    if (!target.link?.find((link) => link.type === 'replaces' && resolveId(link.other) === src.id)) {
      throw new Error(
        `Target Patient ${getReferenceString(target)} missing a 'replaces' link to ${getReferenceString(src)}`
      );
    }
    return true;
  }

  if (resolveId(targetMaster) === src.id) {
    if (!src.link?.find((link) => link.type === 'replaces' && resolveId(link.other) === target.id)) {
      throw new Error(
        `Source Patient ${getReferenceString(target)} missing a 'replaces' link to ${getReferenceString(src)}`
      );
    }
    return true;
  }

  return false;
}

// start-block updateReferences
/**
 * Rewrites all references to source patient to the target patient, for the given resource type.
 *
 * @param medplum - The MedplumClient
 * @param sourcePatient - Source `Patient` resource. After this operation, no resources of the specified type will refer
 * to this `Patient`
 * @param targetPatient - Target `Patient` resource. After this operation, no resources of the specified type will refer
 * to this `Patient`
 * @param resourceType - Resource type to rewrite (e.g. `Encounter`)
 */
export async function updateResourceReferences<T extends ResourceType>(
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
 * @param obj - A FHIR resource or element
 * @param srcReference - The reference string referring to the source resource
 * @param targetReference - The reference string referring to the target resource
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
