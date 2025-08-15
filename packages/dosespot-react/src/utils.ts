// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MedicationKnowledge } from '@medplum/fhirtypes';

export const getMedicationName = (medication: MedicationKnowledge | undefined): string => {
  return medication?.code?.text || '';
};
