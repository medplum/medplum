// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient, MedplumClientEventMap } from '@medplum/core';
import type { JSX, ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useStabilizedCallback } from '../useStabilizedCallback/useStabilizedCallback';
import { defaultOnError } from './defaultOnError';
import type { MedplumErrorDetails, MedplumErrorHandler, MedplumNavigateFunction } from './MedplumProvider.context';
import { medplumErrorHandlerContext, reactContext } from './MedplumProvider.context';

export interface MedplumProviderProps {
  readonly medplum: MedplumClient;
  readonly navigate?: MedplumNavigateFunction;
  readonly onError?: MedplumErrorHandler;
  readonly children: ReactNode;
}

const EVENTS_TO_TRACK = [
  'change',
  'storageInitialized',
  'storageInitFailed',
  'profileRefreshing',
  'profileRefreshed',
] satisfies (keyof MedplumClientEventMap)[];

/**
 * The MedplumProvider component provides Medplum context state.
 *
 * Medplum context includes:
 *   1) medplum - Medplum client library
 *   2) profile - The current user profile (if signed in)
 * @param props - The MedplumProvider React props.
 * @returns The MedplumProvider React node.
 */
export function MedplumProvider(props: MedplumProviderProps): JSX.Element {
  const medplum = props.medplum;
  const navigateProp = props.navigate ?? defaultNavigate;
  // Callers run their own recovery after reporting (clearing loading state and so on), so a handler
  // that throws must not escape into them. Fall back to the console for both errors instead.
  const onError = useStabilizedCallback((error: unknown, details?: MedplumErrorDetails): void => {
    try {
      (props.onError ?? defaultOnError)(error, details);
    } catch (handlerError) {
      defaultOnError(error, details);
      defaultOnError(handlerError, { source: 'MedplumProvider', message: 'onError handler threw' });
    }
  });

  // Apps often pass react-router's router.navigate, which returns a promise even though
  // MedplumNavigateFunction returns void, so no caller handles a rejection. Report it here instead,
  // and still return the result so a caller that awaits it keeps working.
  const navigate = useCallback(
    (path: string): unknown => {
      const result: unknown = navigateProp(path);
      if (result instanceof Promise) {
        result.catch((err: unknown) => onError(err, { source: 'MedplumProvider', message: 'Navigation failed' }));
      }
      return result;
    },
    [navigateProp, onError]
  );

  const [state, setState] = useState({
    profile: medplum.getProfile(),
    loading: medplum.isLoading(),
  });

  useEffect(() => {
    function eventListener(): void {
      setState((s) => ({
        ...s,
        profile: medplum.getProfile(),
        loading: medplum.isLoading(),
      }));
    }

    for (const event of EVENTS_TO_TRACK) {
      medplum.addEventListener(event, eventListener);
    }
    return () => {
      for (const event of EVENTS_TO_TRACK) {
        medplum.removeEventListener(event, eventListener);
      }
    };
  }, [medplum]);

  const medplumContext = useMemo(
    () => ({
      ...state,
      medplum,
      navigate,
    }),
    [state, medplum, navigate]
  );

  return (
    <reactContext.Provider value={medplumContext}>
      <medplumErrorHandlerContext.Provider value={onError}>{props.children}</medplumErrorHandlerContext.Provider>
    </reactContext.Provider>
  );
}

/**
 * The default "navigate" function which simply uses window.location.href.
 * @param path - The path to navigate to.
 */
function defaultNavigate(path: string): void {
  window.location.assign(path);
}
