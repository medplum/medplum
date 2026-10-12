// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { useMedplumErrorHandler } from '@medplum/react';
import { useCallback } from 'react';
import type { NavigateOptions, To } from 'react-router';
import { useNavigate } from 'react-router';

export type AppNavigateFunction = (to: To | number, options?: NavigateOptions) => void;

/**
 * Wraps react-router's `useNavigate` so that a rejected navigation is reported to the
 * MedplumProvider error handler, rather than returned as a promise every caller has to catch.
 * @returns A function that navigates to a path, or by a history delta when given a number.
 */
export function useAppNavigate(): AppNavigateFunction {
  const navigate = useNavigate();
  const onError = useMedplumErrorHandler();
  return useCallback(
    (to: To | number, options?: NavigateOptions) => {
      // Forward only the arguments given, so the call matches what react-router would have received
      let result;
      if (typeof to === 'number') {
        result = navigate(to);
      } else if (options) {
        result = navigate(to, options);
      } else {
        result = navigate(to);
      }
      result?.catch((err: unknown) => onError(err, { source: 'useAppNavigate' }));
    },
    [navigate, onError]
  );
}
