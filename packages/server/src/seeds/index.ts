import { SearchRequest, createReference, parseSearchUrl } from '@medplum/core';
import { Project } from '@medplum/fhirtypes';
import { NIL as nullUuid, v5 } from 'uuid';
import { systemRepo } from '../fhir/repo';
import { globalLogger } from '../logger';
import { rebuildR4SearchParameters } from './searchparameters';
import { rebuildR4StructureDefinitions } from './structuredefinitions';
import { rebuildR4ValueSets } from './valuesets';
import { createProject } from './utils';
import { testProject } from './testproject';

export const r4ProjectId = v5('R4', nullUuid);

class DataSeed {
  private filter: SearchRequest;
  private fn: () => Promise<void>;

  constructor(filter: string, fn: () => Promise<void>) {
    this.filter = parseSearchUrl(new URL('/' + filter, 'http://dummy.example.com'));
    this.fn = fn;
  }

  async run(): Promise<void> {
    const alreadySeeded = await systemRepo.searchOne(this.filter);
    if (alreadySeeded) {
      globalLogger.info('Already seeded', { name: this.fn.name });
      return Promise.resolve();
    }
    return this.fn();
  }
}

export const SEEDS = {
  systemBase: new DataSeed('ProjectMembership', systemBase),
  testProject: new DataSeed('Project?name=Stonefruit Therapeutics (Test)', testProject),
};

async function systemBase(): Promise<void> {
  const [_project, admin] = await createProject('Super Admin', 'Medplum Admin', 'admin@example.com', 'medplum_admin', {
    superAdmin: true,
  });
  await systemRepo.updateResource<Project>({
    resourceType: 'Project',
    id: r4ProjectId,
    name: 'FHIR R4',
    owner: createReference(admin),
  });

  await rebuildR4StructureDefinitions();
  await rebuildR4ValueSets();
  await rebuildR4SearchParameters();
}
