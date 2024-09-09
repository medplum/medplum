import { createReference } from '@medplum/core';
import { Project, ProjectMembership } from '@medplum/fhirtypes';
import { DrAliceSmith } from './alice';

export const TestProject: Project = {
  resourceType: 'Project',
  id: '123',
  name: 'Project 123',
};

export const TestProjectMembership: ProjectMembership = {
  resourceType: 'ProjectMembership',
  id: '456',
  user: { reference: 'User/123' },
  project: createReference(TestProject),
  profile: createReference(DrAliceSmith),
};
