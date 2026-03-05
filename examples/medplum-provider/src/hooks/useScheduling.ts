// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { useContext } from 'react';
import { SchedulingContext } from '../contexts/contexts';
import type { SchedulingContextValue } from '../contexts/SchedulingContext';

export const useScheduling = (): SchedulingContextValue => {
  const value = useContext(SchedulingContext);
  if (!value) {
    throw new Error('useScheduling called outside of a SchedulingContextProvider');
  }
  return value;
};
