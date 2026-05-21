// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ProjectMembership } from '@medplum/fhirtypes';

export function getMembershipLabel(membership: ProjectMembership): string | undefined {
  return membership.identifier?.find((i) => i.system === 'https://medplum.com/identifier/label')?.value;
}
