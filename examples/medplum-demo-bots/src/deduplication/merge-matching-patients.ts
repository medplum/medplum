import {
  BotEvent,
  createReference,
  deepClone,
  getQuestionnaireAnswers,
  MedplumClient,
  getReferenceString,
} from '@medplum/core';
import {
  Identifier,
  Patient,
  QuestionnaireResponse,
  QuestionnaireResponseItemAnswer,
  Reference,
  Resource,
  RiskAssessment,
} from '@medplum/fhirtypes';

/**
 * Handler function to process incoming BotEvent containing a QuestionnaireResponse for potential patient record merges.
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

  // Copy some data from the source patuebt to the target, depending on the user input
  let fieldUpdates = {} as Partial<Patient>;
  const appendName = responses['appendName']?.valueBoolean;
  const appendAddress = responses['appendAddress']?.valueBoolean;
  const replaceDob = responses['replaceDOB']?.valueBoolean;

  if (appendName) {
    fieldUpdates = { ...fieldUpdates, name: [...(targetPatient.name ?? []), ...(sourcePatient.name ?? [])] };
  }

  if (appendAddress) {
    fieldUpdates = { ...fieldUpdates, address: [...(targetPatient.address ?? []), ...(sourcePatient.address ?? [])] };
  }

  if (replaceDob) {
    fieldUpdates.birthDate = sourcePatient.birthDate;
  }

  const mergedPatients = mergePatientRecords(patients.src, patients.target, fieldUpdates);

  // Update clinical data to point to the target resource
  await updateClinicalReferences(medplum, mergedPatients.src, mergedPatients.target, 'ServiceRequest');
  await updateClinicalReferences(medplum, mergedPatients.src, mergedPatients.target, 'Observation');
  await updateClinicalReferences(medplum, mergedPatients.src, mergedPatients.target, 'DiagnosticReport');
  await updateClinicalReferences(medplum, mergedPatients.src, mergedPatients.target, 'MedicationRequest');
  await updateClinicalReferences(medplum, mergedPatients.src, mergedPatients.target, 'Encounter');

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

interface MergedPatients {
  readonly src: Patient;
  readonly target: Patient;
}

type HasSubject = {
  subject?: Reference<Patient>;
};

type ResourceWithSubject = Resource & HasSubject;

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

/**
 * Merges contact information (identifiers) of two patient records, where the source patient record will be marked as an old record.
 * The target patient record will be overwritten with the merged data and will be the master record.
 *
 * @param src - The source patient record.
 * @param target - The target patient record.
 * @param fields - Optional additional fields to be merged.
 * @returns - Object containing the original source and the merged target patient records.
 */
export function mergePatientRecords(src: Patient, target: Patient, fields?: Partial<Patient>): MergedPatients {
  const srcIdentifiers = src.identifier ?? [];
  const mergedIdentifiers = srcIdentifiers.map((identifier) => ({
    ...identifier,
    use: 'old' as Identifier['use'],
  }));
  const targetCopy = deepClone(target);
  targetCopy.identifier = [...(targetCopy.identifier ?? []), ...mergedIdentifiers];
  const targetMerged = { ...targetCopy, ...fields };
  return { src: src, target: targetMerged };
}

/**
 * Updates the subject of clinical resources from the source patient to the target patient.
 *
 * @param medplum - Instance of the MedplumClient for server interactions.
 * @param src - The source patient record.
 * @param target - The target patient record.
 * @param clinicalResource - The type of the clinical resource (e.g., 'ServiceRequest').
 */
export async function updateClinicalReferences<T extends ResourceWithSubject>(
  medplum: MedplumClient,
  src: Patient,
  target: Patient,
  clinicalResource: T['resourceType']
): Promise<void> {
  // Search for clinical resources related to the source patient.
  const reports = await medplum.searchResources(clinicalResource, { subject: getReferenceString(src) });
  (reports as ResourceWithSubject[]).map(async (report) => {
    // Update each found resource's subject to the target patient.
    report.subject = createReference(target);
    await medplum.updateResource(report);
  });
}

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
