// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createReference } from '@medplum/core';
import type { Project, ProjectMembership } from '@medplum/fhirtypes';
import { DrAliceSmith } from './alice';

export const TestProject = {
  resourceType: 'Project',
  id: '123',
  name: 'Project 123',
  // The mock project represents an established, fully-provisioned project so that
  // feature-gated components "just work" under test. Individual tests can override
  // `getProject()` (e.g. with `features: []`) to exercise the feature-disabled paths.
  features: [
    'ai',
    'ai-realtime',
    'aws-comprehend',
    'aws-textract',
    'bots',
    'cron',
    'email',
    'google-auth-required',
    'graphql-introspection',
    'scheduling',
    'websocket-subscriptions',
    'transaction-bundles',
    'validate-terminology',
    'range-search',
    'log-streaming',
  ],
} satisfies Project;

export const TestProjectMembership: ProjectMembership = {
  resourceType: 'ProjectMembership',
  id: '456',
  user: { reference: 'User/123' },
  project: createReference(TestProject),
  profile: createReference(DrAliceSmith),
};
