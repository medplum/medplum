// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { useMedplum } from '@medplum/react';
import { useEffect, useRef } from 'react';
import { seedPatientData, seedPlanDefinition } from '../utils/seed-data';

/**
 * Hook that seeds sample patient data on first load if the database is empty
 */
export function useSeedData(): void {
  const medplum = useMedplum();
  const hasRun = useRef(false);
  const isLoading = medplum.isLoading();
  const activeLogin = medplum.getActiveLogin();

  useEffect(() => {
    console.log('useSeedData effect running', {
      hasRun: hasRun.current,
      isLoading,
      hasActiveLogin: !!activeLogin,
    });

    if (hasRun.current || isLoading || !activeLogin) {
      console.log('Seed data not run - conditions not met');
      return;
    }

    console.log('Seed data running');
    hasRun.current = true;

    seedPatientData(medplum).catch((error) => {
      console.error('Failed to seed patient data:', error);
    });

    seedPlanDefinition(medplum).catch((error) => {
      console.error('Failed to seed plan definition:', error);
    });
  }, [medplum, isLoading, activeLogin]);
}
