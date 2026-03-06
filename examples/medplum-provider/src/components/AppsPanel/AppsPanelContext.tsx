// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { JSX, ReactNode } from 'react';
import { createContext, useCallback, useContext, useMemo, useState } from 'react';

interface AppsPanelContextValue {
  readonly openAppId: string | null;
  readonly panelMaximized: boolean;
  readonly openApp: (id: string) => void;
  readonly closePanel: () => void;
  readonly toggleMaximize: () => void;
}

const AppsPanelContext = createContext<AppsPanelContextValue | undefined>(undefined);

export function AppsPanelProvider({ children }: { readonly children: ReactNode }): JSX.Element {
  const [openAppId, setOpenAppId] = useState<string | null>(null);
  const [panelMaximized, setPanelMaximized] = useState(false);

  const openApp = useCallback((id: string): void => {
    setOpenAppId(id);
  }, []);

  const closePanel = useCallback((): void => {
    setOpenAppId(null);
    setPanelMaximized(false);
  }, []);

  const toggleMaximize = useCallback((): void => {
    setPanelMaximized((prev) => !prev);
  }, []);

  const value = useMemo<AppsPanelContextValue>(
    () => ({ openAppId, panelMaximized, openApp, closePanel, toggleMaximize }),
    [openAppId, panelMaximized, openApp, closePanel, toggleMaximize]
  );

  return <AppsPanelContext.Provider value={value}>{children}</AppsPanelContext.Provider>;
}

export function useAppsPanel(): AppsPanelContextValue {
  const context = useContext(AppsPanelContext);
  if (!context) {
    throw new Error('useAppsPanel must be used within an AppsPanelProvider');
  }
  return context;
}
