import { MedplumClient, ProfileResource } from '@medplum/core';
import { createContext, useContext } from 'react';

export const reactContext = createContext(undefined as MedplumContext | undefined);

export type MedplumNavigateFunction = (path: string) => void;

export interface MedplumContext {
  medplum: MedplumClient;
  navigate: MedplumNavigateFunction;
  profile?: ProfileResource;
  loading: boolean;
}

/**
 * Returns the MedplumContext instance.
 * @returns The MedplumContext instance.
 */
export function useMedplumContext(): MedplumContext {
  return useContext(reactContext) as MedplumContext;
}

/**
 * Returns the MedplumClient instance.
 * This is a shortcut for useMedplumContext().medplum.
 * @returns The MedplumClient instance.
 */
export function useMedplum(): MedplumClient {
  return useMedplumContext().medplum;
}

/**
 * Returns the Medplum navigate function.
 * @returns The Medplum navigate function.
 */
export function useMedplumNavigate(): MedplumNavigateFunction {
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
