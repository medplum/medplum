import { Identifier, Patient, Reference, Resource } from '@medplum/fhirtypes';
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
  const targetCopy = deepClone(target);
  const targetLinks = targetCopy.link ?? [];
  targetLinks.push({ other: createReference(src), type: 'replaces' });

  const srcCopy = deepClone(src);
  const srcLinks = srcCopy.link ?? [];
  srcLinks.push({ other: createReference(target), type: 'replaced-by' });
  return { src: { ...srcCopy, link: srcLinks, active: false }, target: { ...targetCopy, link: targetLinks } };
}

export function mergePatientRecords(src: Patient, target: Patient, fields?: Partial<Patient>): MergedPatients {
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

export async function createMasterResource(medplum: MedplumClient, src: Patient, target: Patient): Promise<void> {
  const srcReplacedByTypes = src.link?.filter((link) => link.type === 'replaced-by') ?? [];
  const targetReplacedByTypes = target.link?.filter((link) => link.type === 'replaced-by') ?? [];

  const srcReplacesTypes = src.link?.filter((link) => link.type === 'replaces') ?? [];
  const targetReplacesTypes = target.link?.filter((link) => link.type === 'replaces') ?? [];

  // If either one has 2 links with type ‘replaced-by’
  if (srcReplacedByTypes.length > 1 || targetReplacedByTypes.length > 1) {
    throw new Error('Either resource has 2 links with type replaced-by');
  }

  // If they both have 1 with type ‘replaced-by’
  if (srcReplacedByTypes.length === 1 && targetReplacedByTypes.length === 1) {
    throw new Error('Both resources have 1 link with type replaced-by');
  }

  // If one has ‘replace-by’ and 1 one ‘replaces’
  if (
    (srcReplacedByTypes.length === 1 && (srcReplacesTypes.length === 1 || targetReplacesTypes.length === 1)) ||
    (targetReplacedByTypes.length === 1 && (targetReplacesTypes.length === 1 || srcReplacesTypes.length === 1))
  ) {
    throw new Error('There is already a master with the input id');
  }

  // If one has a ‘replace-by’
  if (srcReplacedByTypes.length === 1) {
    const patient = await medplum.readReference(srcReplacedByTypes[0].other as Reference<Patient>);
    const links = patient.link ?? [];
    await medplum.updateResource<Patient>({
      ...patient,
      link: [...links, { other: createReference(src), type: 'replaces' }],
    });
    return;
  }
  if (targetReplacedByTypes.length === 1) {
    const patient = await medplum.readReference(targetReplacedByTypes[0].other as Reference<Patient>);
    const links = patient.link ?? [];
    await medplum.updateResource<Patient>({
      ...patient,
      link: [...links, { other: createReference(target), type: 'replaces' }],
    });
    return;
  }
  // If neither of them have a ‘replace-by’
  // Assuming 'target' is the master
  await medplum.createResource<Patient>({ ...target });
}

export async function updateClinicalReferences<T extends ResourceWithSubject>(
  medplum: MedplumClient,
  src: Patient,
  target: Patient,
  clinicalResource: T['resourceType']
): Promise<void> {
  const reports = await medplum.searchResources(clinicalResource, { subject: src });
  (reports as ResourceWithSubject[]).map(async (report) => {
    report.subject = createReference(target);
    await medplum.updateResource(report);
  });
}
