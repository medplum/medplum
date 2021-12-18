import { MedplumClient, ProfileResource } from '@medplum/core';
import React, { createContext, useContext, useEffect, useState } from 'react';

const reactContext = createContext(undefined as MedplumContext | undefined);

export interface MedplumProviderProps {
  medplum: MedplumClient;
  children: React.ReactNode;
}

export interface MedplumContext {
  medplum: MedplumClient;
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
export function MedplumProvider(props: MedplumProviderProps) {
  const medplumContext = createMedplumContext(props.medplum);
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
 * Returns the current Medplum user profile (if signed in).
 * This is a shortcut for useMedplumContext().profile.
 * @returns The current user profile.
 */
export function useMedplumProfile(): ProfileResource | undefined {
  return useMedplumContext().profile;
}

/**
 * Creates the auth object that handles user state.
 */
function createMedplumContext(medplum: MedplumClient): MedplumContext {
  const [state, setState] = useState({
    profile: medplum.getProfile(),
    loading: false,
  });

  useEffect(() => {
    const eventListener = () =>
      setState({
        ...state,
        profile: medplum.getProfile(),
      });

    medplum.addEventListener('change', eventListener);
    return () => medplum.removeEventListeneer('change', eventListener);
  }, []);

  return {
    ...state,
    medplum,
  };
}
