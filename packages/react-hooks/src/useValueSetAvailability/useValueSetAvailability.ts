// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ValueSetAvailability } from '@medplum/core';
import { getValueSetAvailability, subscribeToValueSetAvailability } from '@medplum/core';
import { useCallback, useSyncExternalStore } from 'react';
import { useMedplum } from '../MedplumProvider/MedplumProvider.context';

/**
 * Subscribes to the availability of a ValueSet, probing it on first use.
 * @param binding - The ValueSet URL, or undefined for unbound inputs.
 * @returns The current availability of the ValueSet.
 */
export function useValueSetAvailability(binding: string | undefined): ValueSetAvailability {
  const medplum = useMedplum();

  const subscribe = useCallback(
    (listener: () => void): (() => void) => subscribeToValueSetAvailability(medplum, binding, listener),
    [medplum, binding]
  );

  const getSnapshot = useCallback(
    (): ValueSetAvailability => getValueSetAvailability(medplum, binding),
    [medplum, binding]
  );

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
