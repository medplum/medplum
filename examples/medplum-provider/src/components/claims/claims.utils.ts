// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { formatCodeableConcept } from '@medplum/core';
import type { Claim } from '@medplum/fhirtypes';

export function getClaimTitle(claim: Claim): string {
  return formatCodeableConcept(claim.type) || claim.use || 'Claim';
}
