import { MedPlumClient } from 'medplum';
import React, { createContext, useContext, useEffect, useState } from 'react';

/*
 * Based on:
 * https://usehooks.com/useAuth/
 */

interface User {
  email: string;
}

interface Auth {
  medplum: MedPlumClient;
  user?: User;
  loading: boolean;
}

const context = createContext(undefined as Auth | undefined);

export interface MedPlumProviderProps {
  medplum: MedPlumClient;
  children: React.ReactNode;
}

/**
 * The ProvideAuth component wraps the app,
 * providing auth context.
 */
export function MedPlumProvider(props: MedPlumProviderProps) {
  const auth = createAuth(props.medplum);
  return <context.Provider value={auth}>{props.children}</context.Provider>;
}

/**
 * Returns the auth object from the auth context.
 */
export function useAuth(): Auth {
  return useContext(context) as Auth;
}

/**
 * Returns the MedPlumClient instance.
 * This is just a shortcut for useAuth().medplum.
 */
export function useMedPlum(): MedPlumClient {
  return useAuth().medplum;
}

/**
 * Creates the auth object that handles user state.
 */
function createAuth(medplum: MedPlumClient): Auth {
  const [state, setState] = useState({
    user: medplum.getUser(),
    loading: false
  });

  useEffect(() => {
    const eventListener = () => setState({ ...state, user: medplum.getUser() });
    medplum.addEventListener('change', eventListener);
    return () => medplum.removeEventListeneer('change', eventListener);
  }, []);

  return { ...state, medplum };
}
