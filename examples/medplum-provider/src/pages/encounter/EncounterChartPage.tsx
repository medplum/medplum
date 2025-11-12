// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Encounter, Reference } from '@medplum/fhirtypes';
import { Loading } from '@medplum/react';
import type { JSX } from 'react';
import { useParams } from 'react-router';
import { EncounterChart } from '../../components/encounter/EncounterChart';

export const EncounterChartPage = (): JSX.Element => {
  const { encounterId } = useParams();

  if (!encounterId) {
    return <Loading />;
  }

  const encounterRef: Reference<Encounter> = {
    reference: `Encounter/${encounterId}`,
  };

  return <EncounterChart encounter={encounterRef} />;
};
