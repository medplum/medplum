import { MedplumClient, MedplumClientEventMap } from '@medplum/core';
import { ReactNode, useEffect, useMemo, useState } from 'react';
import { MedplumNavigateFunction, reactContext } from './MedplumProvider.context';

export interface MedplumProviderProps {
  readonly medplum: MedplumClient;
  readonly navigate?: MedplumNavigateFunction;
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
  const navigate = props.navigate ?? defaultNavigate;

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

  return <reactContext.Provider value={medplumContext}>{props.children}</reactContext.Provider>;
}

/**
 * The default "navigate" function which simply uses window.location.href.
 * @param path - The path to navigate to.
 */
function defaultNavigate(path: string): void {
  window.location.assign(path);
}
