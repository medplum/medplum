// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { resolve } from 'node:path';

const repoDir = import.meta.dirname;

// resolve to the submodules for much easier testing
export const medplumAliases = {
  '@medplum/ccda': resolve(repoDir, 'packages/ccda/src'),
  '@medplum/core': resolve(repoDir, 'packages/core/src'),
  '@medplum/definitions': resolve(repoDir, 'packages/definitions/src'),
  '@medplum/dosespot-core': resolve(repoDir, 'packages/dosespot-core/src'),
  '@medplum/fhir-router': resolve(repoDir, 'packages/fhir-router/src'),
  '@medplum/health-gorilla-core': resolve(repoDir, 'packages/health-gorilla-core/src'),
  '@medplum/hl7': resolve(repoDir, 'packages/hl7/src'),
  '@medplum/mock': resolve(repoDir, 'packages/mock/src'),
  '@medplum/react': resolve(repoDir, 'packages/react/src'),
  '@medplum/react-hooks': resolve(repoDir, 'packages/react-hooks/src'),
};
