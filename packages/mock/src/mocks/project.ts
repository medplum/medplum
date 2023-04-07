import { createReference } from '@medplum/core';
import { Project, ProjectMembership } from '@medplum/fhirtypes';
import { DrAliceSmith } from './alice';

export const TestProject: Project = {
  resourceType: 'Project',
  id: '123',
  name: 'Project 123',
};

export const TestProjectMembersihp: ProjectMembership = {
  resourceType: 'ProjectMembership',
  id: '456',
  project: createReference(TestProject),
  profile: createReference(DrAliceSmith),
};
