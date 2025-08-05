// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { useContext } from 'react';
import { HealthGorillaLabOrderContext, UseHealthGorillaLabOrderReturn } from './HealthGorillaLabOrderContext';

export function useHealthGorillaLabOrderContext(): UseHealthGorillaLabOrderReturn {
  const context = useContext(HealthGorillaLabOrderContext);
  if (context === undefined) {
    throw new Error('useHealthGorillaLabOrderContext must be used within a HealthGorillaLabOrderProvider');
  }
  return context;
}
