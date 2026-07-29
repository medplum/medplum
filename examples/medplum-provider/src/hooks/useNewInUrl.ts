// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { useLocation, useNavigate } from 'react-router';

export interface NewInUrlState {
  /** Whether the current URL ends with `/new` (i.e. the "create new" modal should be open). */
  isNew: boolean;
  /** Navigates to `${basePath}/new${suffix}` to open the modal. */
  openNew: () => void;
  /** Navigates to `${basePath}${suffix}` to close the modal. */
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
  return {
    isNew: location.pathname.endsWith('/new'),
    openNew: (): void => {
      navigate(`${basePath}/new${suffix}`)?.catch(console.error);
    },
    closeNew: (): void => {
      navigate(`${basePath}${suffix}`)?.catch(console.error);
    },
  };
}
