// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient } from '@medplum/core';
import { useEffect } from 'react';
import { getAvailableTables } from './utils';

export interface UseResourceTypesProps {
  readonly medplum: MedplumClient;
  readonly onChange: (value: string[]) => void;
  readonly onError?: (error: unknown) => void;
}
export const useAvailableTables = ({ medplum, onChange, onError }: UseResourceTypesProps): void => {
  useEffect(() => {
    async function loadResourceTypes(): Promise<string[]> {
      const valueSet = await medplum.valueSetExpand({
        url: 'https://medplum.com/fhir/ValueSet/resource-types',
        count: 200,
      });
      return valueSet.expansion?.contains?.map((c) => c.code).filter((c) => c !== undefined) ?? [];
    }
    loadResourceTypes()
      .then((resourceTypes) => {
        onChange(getAvailableTables(resourceTypes));
      })
      .catch((err) => {
        if (onError) {
          onError(err);
        } else {
          console.error(err);
        }
      });
  }, [medplum, onChange, onError]);
};
