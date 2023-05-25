import { MedplumClient, ProfileResource } from '@medplum/core';
import React, { createContext, useContext, useEffect, useState } from 'react';

const reactContext = createContext(undefined as MedplumContext | undefined);

export type MepdlumNavigateFunction = (path: string) => void;

export interface MedplumProviderProps {
  medplum: MedplumClient;
  navigate?: MepdlumNavigateFunction;
  children: React.ReactNode;
}

export interface MedplumContext {
  medplum: MedplumClient;
  navigate: MepdlumNavigateFunction;
  profile?: ProfileResource;
  loading: boolean;
}

/**
 * The MedplumProvider component provides Medplum context state.
 *
 * Medplum context includes:
 *   1) medplum - Medplum client library
 *   2) profile - The current user profile (if signed in)
 */
export function MedplumProvider(props: MedplumProviderProps): JSX.Element {
  const medplum = props.medplum;
  const navigate = props.navigate || defaultNavigate;

  const [state, setState] = useState({
    profile: medplum.getProfile(),
    loading: false,
  });

  useEffect(() => {
    function eventListener(): void {
      setState({
        ...state,
        profile: medplum.getProfile(),
      });
    }

    medplum.addEventListener('change', eventListener);
    return () => medplum.removeEventListeneer('change', eventListener);
  }, [medplum, state]);

  const medplumContext = {
    ...state,
    medplum,
    navigate,
  };

  return <reactContext.Provider value={medplumContext}>{props.children}</reactContext.Provider>;
}

/**
 * Returns the MedplumContext instance.
 */
export function useMedplumContext(): MedplumContext {
  return useContext(reactContext) as MedplumContext;
}

/**
 * Returns the MedplumClient instance.
 * This is a shortcut for useMedplumContext().medplum.
 */
export function useMedplum(): MedplumClient {
  return useMedplumContext().medplum;
}

/**
 * Returns the Medplum navigate function.
 * @returns The Medplum navigate function.
 */
export function useMedplumNavigate(): MepdlumNavigateFunction {
  return useMedplumContext().navigate;
}

/**
 * Returns the current Medplum user profile (if signed in).
 * This is a shortcut for useMedplumContext().profile.
 * @returns The current user profile.
 */
export function useMedplumProfile(): ProfileResource | undefined {
  return useMedplumContext().profile;
}

/**
 * The default "navigate" function which simply uses window.location.href.
 * @param path The path to navigate to.
 */
function defaultNavigate(path: string): void {
  window.location.assign(path);
}
