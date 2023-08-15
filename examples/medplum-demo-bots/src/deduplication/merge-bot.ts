import {
  BotEvent,
  createReference,
  deepClone,
  getCodeBySystem,
  getQuestionnaireAnswers,
  MedplumClient,
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

interface MergedPatients {
  readonly src: Patient;
  readonly target: Patient;
}

interface Subject {
  subject?: Reference<Patient>;
}

type ResourceWithSubject = Resource & Subject;

/**
 * Links two patient records indicating one replaces the other.
 *
 * @param src - The source patient record which is being replaced.
 * @param target - The target patient record which will replace the source.
 * @returns - Object containing updated source and target patient records with their links.
 */
export function linkPatientRecords(src: Patient, target: Patient): MergedPatients {
  const targetLinks = target.link ?? [];
  targetLinks.push({ other: createReference(src), type: 'replaces' });
  const targetCopy = deepClone(target);

  const srcLinks = src.link ?? [];
  srcLinks.push({ other: createReference(target), type: 'replaced-by' });
  const srcCopy = deepClone(src);
  return { src: { ...srcCopy, link: srcLinks, active: false }, target: { ...targetCopy, link: targetLinks } };
}

/**
 * Merges contact information (identifiers) of two patient records.
 * Identifiers from the source are marked as 'old' in the merged record.
 *
 * @param src - The source patient record.
 * @param target - The target patient record.
 * @param fields - Optional additional fields to be merged.
 * @returns - Object containing the original source and the merged target patient records.
 */
export function mergeContactInfo(src: Patient, target: Patient, fields?: Partial<Patient>): MergedPatients {
  const srcIdentifiers = src.identifier ?? [];
  const mergedIdentifiers = srcIdentifiers.map((identifier) => ({
    ...identifier,
    use: 'old' as Identifier['use'],
  }));
  const targetCopy = deepClone(target);
  targetCopy.identifier = [...(targetCopy.identifier ?? []), ...mergedIdentifiers];
  const targedMerged = { ...targetCopy, ...fields };
  return { src: src, target: targedMerged };
}

/**
 * Updates the subject of clinical resources from the source patient to the target patient.
 *
 * @param medplum - Instance of the MedplumClient for server interactions.
 * @param src - The source patient record.
 * @param target - The target patient record.
 * @param clinicalResource - The type of the clinical resource (e.g., 'ServiceRequest').
 */
export async function rewriteClinicalResources<T extends ResourceWithSubject>(
  medplum: MedplumClient,
  src: Patient,
  target: Patient,
  clinicalResource: T['resourceType']
): Promise<void> {
  // Search for clinical resources related to the source patient.
  const reports = await medplum.searchResources(clinicalResource, { subject: src });
  (reports as ResourceWithSubject[]).map(async (report) => {
    // Update each found resource's subject to the target patient.
    report.subject = createReference(target);
    await medplum.updateResource(report);
  });
}

async function addToDoNotMatchList(
  medplum: MedplumClient,
  patientList: Reference<Patient>,
  patientAdded: Reference<Patient>
): Promise<void> {
  const lists = await medplum.searchResources('List', { subject: patientList, code: 'doNotMatch' }); 
  lists.forEach(async (list) => {
    const entries = list.entry;
    entries?.push({ item: patientAdded });
    await medplum.updateResource({ ...list, entry: entries });
  });
}

/**
 * Handler function to process incoming BotEvent containing a QuestionnaireResponse for potential patient record merges.
 */
export async function handler(medplum: MedplumClient, event: BotEvent<QuestionnaireResponse>): Promise<any> {
  // Extract answers from the QuestionnaireResponse.
  const responses = getQuestionnaireAnswers(event.input);
  // Get the reference to the RiskAssessment from the answers.
  const riskAssessmentReference = responses['assessment'] as QuestionnaireResponseItemAnswer;
  // If there's no valid RiskAssessment reference in the response, throw an error.
  if (!riskAssessmentReference.valueReference) {
    throw new Error('Invalid input. Expected RiskAssessment reference');
  }
  const riskAssessment = (await medplum.readReference(riskAssessmentReference.valueReference)) as RiskAssessment;
  const targetReference = riskAssessment.basis?.[0] as Reference<Patient>;
  const srcReference = riskAssessment.subject as Reference<Patient>;
  if (!targetReference || !srcReference) {
    throw new Error(`Undefined references target: ${targetReference} src: ${srcReference}`);
  }

  // If merge is disabled based on the questionnaire's answer, terminate the handler early.
  const mergeCheck = responses['disableMerge']?.valueBoolean;
  if (!!mergeCheck) {
    await addToDoNotMatchList(medplum, srcReference, targetReference);
    await addToDoNotMatchList(medplum, targetReference, srcReference);
    return true;
  }

  const patientTarget = await medplum.readReference(targetReference);
  const patientSource = await medplum.readReference(srcReference);

  const patients = linkPatientRecords(patientSource as Patient, patientTarget as Patient);

  const mergedPatients = mergeContactInfo(patients.src, patients.target);
  const deleteSource = responses['deleteSource']?.valueBoolean;

  await rewriteClinicalResources(medplum, mergedPatients.src, mergedPatients.target, 'ServiceRequest');
  if (deleteSource === true) {
    await medplum.deleteResource('Patient', mergedPatients.src.id as string);
  } else {
    await medplum.updateResource<Patient>(mergedPatients.src);
  }
  await medplum.updateResource<Patient>(mergedPatients.target);
  return true;
}
