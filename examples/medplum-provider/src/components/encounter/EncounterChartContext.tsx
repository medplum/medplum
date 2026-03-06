// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createContext, useContext } from 'react';
import type { EncounterChartHook } from '../../hooks/useEncounterChart';

const EncounterChartContext = createContext<EncounterChartHook | undefined>(undefined);

export const EncounterChartProvider = EncounterChartContext.Provider;

export const useEncounterChartContext = (): EncounterChartHook => {
  const ctx = useContext(EncounterChartContext);
  if (!ctx) {
    throw new Error('useEncounterChartContext must be used inside EncounterChartProvider');
  }
  return ctx;
};
