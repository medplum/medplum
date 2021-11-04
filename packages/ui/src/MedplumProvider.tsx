import { MedplumClient, ProfileResource } from '@medplum/core';
import React, { createContext, useContext, useEffect, useState } from 'react';

const reactContext = createContext(undefined as MedplumContext | undefined);

export interface MedplumProviderProps {
  medplum: MedplumClient;
  router?: MedplumRouter;
  children: React.ReactNode;
}

export interface MedplumContext {
  medplum: MedplumClient;
  router: MedplumRouter;
  profile?: ProfileResource;
  loading: boolean;
}

export interface MedplumRouter {
  push: (path: string, state?: any) => void;
  listen: (listener: MedplumRouterListen) => MedplumRouterUnlisten;
}

export interface MedplumRouterListen {
  (location: any): void;
}

export interface MedplumRouterUnlisten {
  (): void;
}

/**
 * The MedplumProvider component provides Medplum context state.
 *
 * Medplum context includes:
 *   1) medplum - Medplum client library
 *   2) router - Router for navigating links (compatible with 'history' and 'react-router')
 *   3) user - The current user (if signed in)
 */
export function MedplumProvider(props: MedplumProviderProps) {
  const medplumContext = createMedplumContext(props.medplum, props.router);
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
 * Returns the MedplumRouter instance.
 * This is a shortcut for useMedplumContext().router.
 */
export function useMedplumRouter(): MedplumRouter {
  return useMedplumContext().router;
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
function createMedplumContext(medplum: MedplumClient, router: MedplumRouter | undefined): MedplumContext {
  const [state, setState] = useState({
    profile: medplum.getProfile(),
    loading: false
  });

  useEffect(() => {
    const eventListener = () => setState({
      ...state,
      profile: medplum.getProfile()
    });

    medplum.addEventListener('change', eventListener);
    return () => medplum.removeEventListeneer('change', eventListener);
  }, []);

  return {
    ...state,
    medplum,
    router: router ?? NOOP_ROUTER
  };
}

/**
 * Default "no-op" router.
 * Most applications will provide their own router.
 * This is a simple implementation that can be used for testing.
 */
const NOOP_ROUTER: MedplumRouter = {
  push: () => undefined,
  listen: () => (() => undefined)
};
