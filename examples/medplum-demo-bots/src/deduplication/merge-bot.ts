import { BotEvent, createReference, deepClone, getQuestionnaireAnswers, MedplumClient } from '@medplum/core';
import { Patient, QuestionnaireResponse, Reference, Resource } from '@medplum/fhirtypes';

interface MergedPatients {
  readonly src: Patient;
  readonly target: Patient;
}

interface Subject {
  subject?: Reference<Patient>;
}

type ResourceWithSubject = Resource & Subject;

export function linkPatientRecords(src: Patient, target: Patient): MergedPatients {
  const targetLinks = target.link ?? [];
  targetLinks.push({ other: createReference(src), type: 'replaces' });
  const targetCopy = deepClone(target);

  const srcLinks = src.link ?? [];
  srcLinks.push({ other: createReference(target), type: 'replaced-by' });
  const srcCopy = deepClone(src);
  return { src: { ...srcCopy, link: srcLinks, active: false }, target: { ...targetCopy, link: targetLinks } };
}

export function mergeContactInfo(src: Patient, target: Patient, fields?: Partial<Patient>): MergedPatients {
  const srcIdentifiers = src.identifier ?? [];
  const mergedIdentifiers = srcIdentifiers.map((identifier) => ({
    ...identifier,
    use: 'old' as 'usual' | 'official' | 'temp' | 'secondary' | 'old',
  }));
  const targetCopy = deepClone(target);
  targetCopy.identifier = [...(targetCopy.identifier ?? []), ...mergedIdentifiers];
  const targedMerged = { ...targetCopy, ...fields };
  return { src: src, target: targedMerged };
}

export async function rewriteClinicalResources<T extends ResourceWithSubject>(
  medplum: MedplumClient,
  src: Patient,
  target: Patient,
  clinicalResource: T['resourceType']
): Promise<void> {
  const reports = await medplum.searchResources(clinicalResource, { subject: src });
  console.log(reports);
  (reports as ResourceWithSubject[]).map(async (report) => {
    report.subject = createReference(target);
    await medplum.updateResource(report);
  });
}

export async function handler(medplum: MedplumClient, event: BotEvent<QuestionnaireResponse>): Promise<any> {
  const responses = getQuestionnaireAnswers(event.input);
  const targetReference = responses['otherPatient'];
  const srcReference = event.input.subject;
  if (!targetReference.valueReference || !srcReference) {
    throw new Error(`Undefined references target: ${targetReference} src: ${srcReference}`);
  }
  const patientTarget = await medplum.readReference(targetReference.valueReference);
  const patientSource = await medplum.readReference(srcReference);

  const patients = linkPatientRecords(patientSource as Patient, patientTarget as Patient);
  const mergedPatients = mergeContactInfo(patients.src, patients.target);
  const deleteSource = responses['deleteSource']?.valueBoolean;
  console.log(JSON.stringify(responses, null, 2));
  if (deleteSource === true) {
    console.log('deleting source ', mergedPatients.src.id);
    const deleted = await medplum.deleteResource('Patient', mergedPatients.src.id as string);
    console.log(JSON.stringify(deleted, null, 2));
  } else {
    await medplum.updateResource<Patient>(mergedPatients.src);
  }
  await medplum.updateResource<Patient>(mergedPatients.target);
  return `ok, merged ${mergedPatients.src} into ${mergedPatients.target}`;
  //   await rewriteClinicalResources(medplum, mergedPatients.src, mergedPatients.target, 'ServiceRequest');
}
