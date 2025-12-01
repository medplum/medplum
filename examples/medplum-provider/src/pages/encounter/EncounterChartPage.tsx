// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Encounter, Reference } from '@medplum/fhirtypes';
import type { JSX } from 'react';
import { Outlet, useParams } from 'react-router';
import { EncounterChart } from '../../components/encounter/EncounterChart';
import { showErrorNotification } from '../../utils/notifications';

export const EncounterChartPage = (): JSX.Element | null => {
  const { encounterId } = useParams();

  if (!encounterId) {
    showErrorNotification('Encounter ID not found');
    return null;
  }

  const encounterRef: Reference<Encounter> = {
    reference: `Encounter/${encounterId}`,
  };

  return (
    <>
      <EncounterChart encounter={encounterRef} />
      <Outlet />
    </>
  );
};
