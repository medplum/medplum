import { MedPlumClient } from 'medplum';
import React, { createContext, useContext, useState } from 'react';

/*
 * Based on:
 * https://usehooks.com/useAuth/
 */

interface User {
  email: string;
}

interface SignInFormData {
  email: string;
  password: string;
}

interface RegisterFormData {
  email: string;
  password: string;
  confirmPassword: string;
  firstName: string;
  lastName: string;
  phone: string;
}

interface ForgotPasswordFormData {
  email: string;
}

interface ResetPasswordFormData {
  id: string;
  code: string;
  password: string;
}

interface ChangePasswordFormData {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

interface Auth {
  medplum: MedPlumClient;
  user?: User;
  loading: boolean;
  setUser: (user: User) => void;
  signin: (formData: SignInFormData) => Promise<User>;
  register: (formData: RegisterFormData) => Promise<User>;
  signout: () => Promise<void>;
  forgotPassword: (formData: ForgotPasswordFormData) => Promise<void>;
  resetPassword: (formData: ResetPasswordFormData) => Promise<User>;
  changePassword: (formData: ChangePasswordFormData) => Promise<User>;
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
    user: undefined as User | undefined,
    loading: true
  });

  const setUser = (user: User | undefined) => {
    setState({ user, loading: false });
  }

  const signin = (formData: SignInFormData) => {
    setState({ user: undefined, loading: true });
    return medplum.post('auth/signin', formData)
      .then((result: any) => {
        setUser(result.user);
        return result.user;
      });
  };

  const register = (formData: RegisterFormData) => {
    setState({ user: undefined, loading: true });
    return medplum.post('auth/register', formData)
      .then((result: any) => {
        setUser(result.user);
        return result.user;
      });
  };

  const signout = () => {
    setUser(undefined);
    localStorage.clear();
    return medplum.post('auth/signout', {});
  };

  const forgotPassword = (formData: ForgotPasswordFormData) => {
    return medplum.post('auth/forgotpassword', formData);
  };

  const resetPassword = (formData: ResetPasswordFormData) => {
    setState({ user: undefined, loading: true });
    return medplum.post('auth/resetpassword', formData)
      .then((result: any) => {
        setUser(result.user);
        return result.user;
      });
  };

  const changePassword = (formData: ChangePasswordFormData) => {
    return medplum.post('auth/changepassword', formData);
  };

  return {
    ...state,
    medplum,
    setUser,
    signin,
    register,
    signout,
    forgotPassword,
    resetPassword,
    changePassword,
  };
}
