import { MedplumClient } from '@medplum/core';
import { ReactNode, useEffect, useMemo, useState } from 'react';
import { MedplumNavigateFunction, reactContext } from './MedplumProvider.context';

export interface MedplumProviderProps {
  readonly medplum: MedplumClient;
  readonly navigate?: MedplumNavigateFunction;
  readonly children: ReactNode;
}

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

    medplum.addEventListener('change', eventListener);
    medplum.addEventListener('storageInitialized', eventListener);
    medplum.addEventListener('profileRefreshing', eventListener);
    medplum.addEventListener('profileRefreshed', eventListener);

    return () => {
      medplum.removeEventListener('change', eventListener);
      medplum.removeEventListener('storageInitialized', eventListener);
      medplum.removeEventListener('profileRefreshing', eventListener);
      medplum.removeEventListener('profileRefreshed', eventListener);
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
