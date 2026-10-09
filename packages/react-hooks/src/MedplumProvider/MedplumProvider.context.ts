// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient, ProfileResource } from '@medplum/core';
import type { ErrorInfo } from 'react';
import { createContext, useContext } from 'react';
import { defaultOnError } from './defaultOnError';

export const reactContext = createContext(undefined as MedplumContext | undefined);

export type MedplumNavigateFunction = (path: string) => void;

/**
 * Optional information about a reported error.
 */
export interface MedplumErrorDetails {
  /** The component or hook reporting the error, e.g. `'QuestionnaireFormItem'`. */
  readonly source?: string;
  /** What was being attempted when the error occurred, e.g. `'Error loading value set'`. */
  readonly message?: string;
  /**
   * React's information about an error thrown while rendering, as received by `ErrorBoundary`.
   * Apps that route errors here should not also pass this handler to `createRoot`'s `onCaughtError`,
   * or errors caught by `ErrorBoundary` will be reported twice.
   */
  readonly errorInfo?: ErrorInfo;
}

export type MedplumErrorHandler = (error: unknown, details?: MedplumErrorDetails) => void;

/**
 * The MedplumProvider error handler, kept apart from MedplumContext so that components which only
 * report errors don't re-render when the profile or loading state changes. Outside a
 * MedplumProvider, errors are logged to the console.
 */
export const medplumErrorHandlerContext = createContext<MedplumErrorHandler>(defaultOnError);

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
 * Returns the Medplum error handler, for reporting errors that are caught but not otherwise surfaced.
 * The returned function is referentially stable, so it is safe to list as an effect dependency.
 * Outside of a MedplumProvider, errors are logged to the console.
 * @returns The Medplum error handler.
 */
export function useMedplumErrorHandler(): MedplumErrorHandler {
  return useContext(medplumErrorHandlerContext);
}

/**
 * Returns the current Medplum user profile (if signed in).
 * This is a shortcut for useMedplumContext().profile.
 * @returns The current user profile.
 */
export function useMedplumProfile(): ProfileResource | undefined {
  return useMedplumContext().profile;
}
