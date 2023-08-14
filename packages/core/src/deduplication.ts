import { Patient, Reference, Resource } from '@medplum/fhirtypes';
import { MedplumClient } from './client';
import { createReference, deepClone } from './utils';

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

export function mergeContactInfo(src: Patient, target: Patient, fields: Partial<Patient>): MergedPatients {
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
