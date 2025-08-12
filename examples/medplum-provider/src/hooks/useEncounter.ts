// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Encounter } from '@medplum/fhirtypes';
import { useResource } from '@medplum/react';
import { useParams } from 'react-router';

export function useEncounter(): Encounter | undefined {
  const { encounterId } = useParams();

  return useResource<Encounter>({ reference: `Encounter/${encounterId}` });
}
