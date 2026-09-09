// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router';

/**
 * NewInUrlState is the result of the useNewInUrl hook.
 * @property isNew - Whether the current URL ends with `/new` (i.e. the "create new" modal should be open).
 * @property openNew - Navigates to `${basePath}/new${suffix}` to open the modal.
 * @property closeNew - Navigates to `${basePath}${suffix}` to close the modal.
 */
export interface NewInUrlState {
  isNew: boolean;
  openNew: () => void;
  closeNew: () => void;
}

/**
 * Drives a "create new" modal from a trailing `/new` URL segment, so the modal state
 * survives reloads and back/forward navigation.
 * @param basePath - Path to the current selection (e.g. `/Task/123` or `/Task`).
 * @param suffix - Query string to preserve across navigation, including the leading `?` (or '').
 * @returns The current `/new` state and open/close navigation handlers.
 */
export function useNewInUrl(basePath: string, suffix: string): NewInUrlState {
  const location = useLocation();
  const navigate = useNavigate();

  const openNew = useCallback((): void => {
    navigate(`${basePath}/new${suffix}`)?.catch(console.error);
  }, [navigate, basePath, suffix]);

  const closeNew = useCallback((): void => {
    navigate(`${basePath}${suffix}`)?.catch(console.error);
  }, [navigate, basePath, suffix]);

  return {
    isNew: location.pathname.endsWith('/new'),
    openNew,
    closeNew,
  };
}
