// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { JSX, ReactNode } from 'react';
import { useCallback, useMemo, useState } from 'react';
import { MarketplaceContext } from './MarketplaceContext.context';
import type { MarketplaceContextValue } from './MarketplaceContext.context';
import type { InstalledItem, ListingType, MarketplaceListing } from './types';

export function MarketplaceProvider({ children }: { readonly children: ReactNode }): JSX.Element {
  const [installedItems, setInstalledItems] = useState<Record<string, InstalledItem>>({});
  const [customListings, setCustomListings] = useState<MarketplaceListing[]>([]);

  const isInstalled = useCallback(
    (listingId: string): boolean => {
      return listingId in installedItems;
    },
    [installedItems]
  );

  const install = useCallback((listingId: string): void => {
    setInstalledItems((prev) => ({
      ...prev,
      [listingId]: {
        listingId,
        installedAt: new Date().toISOString(),
        status: 'active',
      },
    }));
  }, []);

  const uninstall = useCallback((listingId: string): void => {
    setInstalledItems((prev) => {
      const next = { ...prev };
      delete next[listingId];
      return next;
    });
    // Also remove from custom listings if applicable
    setCustomListings((prev) => prev.filter((l) => l.id !== listingId));
  }, []);

  const addCustomListing = useCallback((name: string, type: ListingType, description?: string): void => {
    const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const newListing: MarketplaceListing = {
      id,
      name,
      tagline: description ?? '',
      description: description ?? '',
      type,
      categories: [],
      vendor: { id: 'custom', name: 'Custom', description: 'User-created item', logo: '' },
      version: '1.0.0',
      lastUpdated: new Date().toISOString().split('T')[0],
      icon: '',
      features: [],
      popularity: 0,
    };
    setCustomListings((prev) => [...prev, newListing]);
    // Auto-install
    setInstalledItems((prev) => ({
      ...prev,
      [id]: {
        listingId: id,
        installedAt: new Date().toISOString(),
        status: 'active',
      },
    }));
  }, []);

  const updateCustomListing = useCallback((id: string, name: string, description?: string): void => {
    setCustomListings((prev) =>
      prev.map((l) => (l.id === id ? { ...l, name, tagline: description ?? '', description: description ?? '' } : l))
    );
  }, []);

  const value = useMemo<MarketplaceContextValue>(
    () => ({
      installedItems,
      customListings,
      isInstalled,
      install,
      uninstall,
      addCustomListing,
      updateCustomListing,
    }),
    [installedItems, customListings, isInstalled, install, uninstall, addCustomListing, updateCustomListing]
  );

  return <MarketplaceContext.Provider value={value}>{children}</MarketplaceContext.Provider>;
}

